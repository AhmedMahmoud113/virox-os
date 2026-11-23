// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, homenet (BUILD-PLAN section 11, B7). Pages only call these methods.
// Documented in docs/api.md. Error codes, not sentences: every client translates them.
//
//   virox.homenet  reservations                       fixed addresses (DHCP static leases) (admin)
//                  reserve {mac, ip, name, replace}   add one; replace=true changes the
//                                                     existing reservation of that MAC     (admin)
//                  unreserve {mac}                    remove the reservation of a MAC      (admin)
//
// B7.5b: a duplicate IP or MAC makes dnsmasq refuse to start, and then no device gets an
// address. So every duplicate is refused here, before anything is written, and the change is
// applied through dhcp-guard, which puts the last working DHCP settings back if dnsmasq still
// fails (error dhcp_restored).

'use strict';

import { readfile, writefile, rename, chmod, popen, unlink } from 'fs';
import * as uloop from 'uloop';
import { cursor } from 'uci';

const DATA = '/etc/homenet/data', RUN = '/tmp/homenet';
const DEVICES_CMD = '/usr/libexec/homenet/devices', CONTROLS_CMD = '/usr/libexec/homenet/controls';
const DNS_CMD = '/usr/libexec/homenet/dns', FILTER_CMD = '/usr/libexec/homenet/filter';

// ------------------------------------------------------------------ helpers

// ------------------------------------------------------------------ short-lived copy (owner 2026-11-22:
// "moving between pages is very slow"). rpcd answers one call at a time, so a page waits for the sum
// of its calls; the device list (~0.35 s on the GAPM-7200: neighbours, Wi-Fi stations, usage files)
// was built twice per Devices or Home page (devices and people both build it) and again by every
// poll. It is now built at most once every 2 seconds and shared; every method that changes
// anything clears it first (cached_clear, wrapped around them at the end of this file).
let cache_v = {}, cache_t = {};
function now_s() { const c = clock(true); return c[0] + c[1] / 1e9; }
function cached(key, ttl, fn) {
	const t = now_s();
	if (cache_v[key] != null && t - cache_t[key] < ttl) return cache_v[key];
	cache_v[key] = fn(); cache_t[key] = now_s();
	return cache_v[key];
}
function cached_clear() { cache_v = {}; cache_t = {}; }
// wrap every method of an API object that is not in `reads` so it clears the copy before it runs
function clears_cache(obj, reads) {
	for (let name in keys(obj)) {
		if (index(reads, name) >= 0) continue;
		const f = obj[name].call;
		obj[name].call = function(req) { cached_clear(); return f(req); };
	}
	return obj;
}

function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }

function sh_out(cmd) {
	const fd = popen(cmd);
	if (!fd) return '';
	const out = fd.read('all');
	fd.close();
	return trim(out ?? '');
}

// run a homenet script: { result: true, value } or { result: false, error }
function run_cmd(cmd, args) {
	const out = sh_out(join(' ', [ cmd, ...map(args, shq) ]) + ' 2>/dev/null');
	// the script prints exactly one line (ucode regexes have no multi-line flag)
	const m = match(out, /^OK ?(.*)$/);
	if (m) return { result: true, value: m[1] };
	const e = match(out, /^ERR ([a-z_]+)/);
	return { result: false, error: e ? e[1] : 'failed' };
}
function devices_cmd(...args) { return run_cmd(DEVICES_CMD, args); }
function controls_cmd(...args) { return run_cmd(CONTROLS_CMD, args); }
function plain(r) { delete r.value; return r; }


// tab-separated file -> array of field arrays (RAM copy first, flash copy otherwise)
function tsv(name, hot) {
	const txt = (hot ? readfile(`${RUN}/${name}`) : null) ?? readfile(`${DATA}/${name}`) ?? '';
	return map(filter(split(txt, '\n'), l => l != ''), l => split(l, '\t'));
}

// online MACs, same rule as the old homenet page: an associated Wi-Fi station, or a LAN
// neighbour entry that is not FAILED / INCOMPLETE. mac -> { ip, link: "wifi" | "lan" }
function online_macs() {
	const lan = cursor().get('network', 'lan', 'device') ?? 'br-lan';
	let on = {};
	if (cursor().get('lg7200', 'state', 'mode') == 'ap') {
		// access point: its Wi-Fi stations (below) and the devices on its own cable ports, i.e. the
		// bridge's learned entries on every port but the one towards the main router (the port
		// where the gateway's MAC is). Not every neighbour: that listed the main router itself and
		// the whole house as this unit's devices (owner 2026-11-20).
		let ipof = {};
		for (let line in split(sh_out(`ip -4 neigh show dev ${shq(lan)} 2>/dev/null`), '\n')) {
			const p = split(trim(line), /[ \t]+/), i = index(p, 'lladdr');
			if (i > 0) ipof[lc(p[i + 1])] = p[0];
		}
		const gw = trim(sh_out("ip -4 route show default 2>/dev/null | awk '{ print $3; exit }'"));
		let gwmac = '';
		for (let m, ip in ipof) if (ip == gw) gwmac = m;
		let ent = [], up = '';
		for (let line in split(sh_out(`bridge fdb show br ${shq(lan)} 2>/dev/null`), '\n')) {
			const p = split(trim(line), /[ \t]+/);
			if (length(p) < 3 || p[1] != 'dev' || index(p, 'permanent') >= 0 || index(p, 'master') < 0) continue;
			const mac = lc(p[0]);
			if (!match(mac, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/) || (hex(substr(mac, 0, 2)) & 1)) continue;
			if (mac == gwmac) up = p[2];
			push(ent, [ mac, p[2] ]);
		}
		for (let e in ent)
			if (up != '' && e[1] != up && !match(e[1], /^phy|^wlan/)) on[e[0]] = { ip: ipof[e[0]] ?? '', link: 'lan' };
		const st = sh_out("for d in $(iw dev 2>/dev/null | awk '/Interface/ { print $2 }'); do " +
		                  "iw dev \"$d\" station dump 2>/dev/null | awk '/^Station / { print tolower($2) }'; done");
		for (let mac in split(st, '\n'))
			if (mac != '') on[mac] = { ip: ipof[mac] ?? '', link: 'wifi' };
		// this unit leads the access points under a router that is not a Virox (apctl): the devices
		// on the other access points too (their reports of the last 5 minutes)
		if (trim(readfile('/tmp/homenet/apctl/role') ?? '') == 'lead') {
			const now = time();
			for (let l in split(readfile('/tmp/homenet/ap-clients.tsv') ?? '', '\n')) {
				const f = split(l, '\t');
				if (length(f) >= 5 && f[1] != 'main' && now - +f[4] < 300 && !on[f[0]])
					on[f[0]] = { ip: ipof[f[0]] ?? '', link: f[3] == 'lan' ? 'lan' : 'wifi' };
			}
		}
		return on;
	}
	for (let line in split(sh_out(`ip -4 neigh show dev ${shq(lan)} 2>/dev/null`), '\n')) {
		const p = split(trim(line), /[ \t]+/);
		const i = index(p, 'lladdr');
		const state = p[length(p) - 1];
		if (i > 0 && state != 'FAILED' && state != 'INCOMPLETE')
			on[lc(p[i + 1])] = { ip: p[0], link: 'lan' };
	}
	const st = sh_out("for d in $(iw dev 2>/dev/null | awk '/Interface/ { print $2 }'); do " +
	                  "iw dev \"$d\" station dump 2>/dev/null | awk '/^Station / { print tolower($2) }'; done");
	for (let mac in split(st, '\n'))
		if (mac != '') on[mac] = { ip: on[mac] ? on[mac].ip : '', link: 'wifi' };
	return on;
}

function cycle() {
	const p = split(sh_out('. /usr/lib/homenet/common.sh; hn_cycle'), ' ');
	return { start: p[0] ?? '', next: p[1] ?? '' };
}

function norm_mac(s) {
	const m = lc(replace(s ?? '', /-/g, ':'));
	if (!match(m, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/)) return null;
	if (m == '00:00:00:00:00:00' || (hex(substr(m, 0, 2)) & 1)) return null;   // zero / multicast
	return m;
}

function ip2int(s) {
	const m = match(s ?? '', /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	let n = 0;
	for (let i = 1; i <= 4; i++) {
		if (+m[i] > 255) return null;
		n = n * 256 + +m[i];
	}
	return n;
}

function prefix_of_mask(mask) {
	const n = ip2int(mask);
	if (n == null) return null;
	let p = 0, v = n;
	for (let i = 0; i < 32; i++) {
		if (v >= 2147483648) { p++; v = (v - 2147483648) * 2; }
		else break;
	}
	return p;
}

// LAN address + prefix from network.lan (ipaddr may be "a.b.c.d/nn", a list, or with netmask)
function lan(c) {
	let a = c.get('network', 'lan', 'ipaddr');
	if (type(a) == 'array') a = a[0];
	const parts = split(a ?? '', '/');
	const pfx = length(parts) > 1 ? +parts[1] : (prefix_of_mask(c.get('network', 'lan', 'netmask') ?? '255.255.255.0') ?? 24);
	return { ip: parts[0], prefix: pfx };
}

function host_macs(s) {
	let m = s.mac;
	if (type(m) != 'array') m = split(m ?? '', /\s+/);
	return filter(map(m, norm_mac), x => x != null);
}

function reservations(c) {
	let out = [];
	c.foreach('dhcp', 'host', s => {
		for (let m in host_macs(s))
			push(out, { mac: m, ip: s.ip ?? '', name: s.name ?? '', section: s['.name'] });
	});
	return out;
}

function leases() {
	let out = {};
	for (let line in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) {
		const f = split(line, ' ');
		if (length(f) >= 3 && norm_mac(f[1])) out[f[2]] = norm_mac(f[1]);
	}
	return out;
}

function check(c, mac, ip, name, replacing) {
	if (!mac) return { error: 'invalid_mac' };
	const n = ip2int(ip);
	if (n == null) return { error: 'invalid_ip' };
	if (name != '' && !match(name, /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/))
		return { error: 'invalid_name' };
	const l = lan(c), r = ip2int(l.ip);
	if (r == null) return { error: 'no_lan' };
	if (l.prefix < 8 || l.prefix > 30) return { error: 'no_lan' };
	const size = 1 << (32 - l.prefix), net = r - r % size;
	if (n < net || n >= net + size) return { error: 'ip_outside_lan' };
	if (n == net || n == net + size - 1) return { error: 'ip_network' };
	if (n == r) return { error: 'ip_router' };
	for (let h in reservations(c)) {
		if (h.ip == ip && h.mac != mac) return { error: 'ip_reserved', by: h.mac };
		if (h.mac == mac && !replacing) return { error: 'mac_reserved', ip: h.ip };
	}
	const by = leases()[ip];
	if (by && by != mac) return { error: 'ip_in_use', by };
	return null;
}

function apply() {
	const rc = system('/usr/libexec/lg7200/dhcp-guard apply >/dev/null 2>&1');
	if (rc == 2) return { result: false, error: 'dhcp_restored' };
	if (rc != 0) return { result: false, error: 'dhcp_down' };
	return { result: true };
}

// (ucode does not hoist functions: these use tsv() above)
// byte counters of the WAN devices (wan, wan2, ...; PPPoE: its pppoe-<name> device) with the
// moment they were read: a page takes two readings and shows the speed between them (Home)
function wan_traffic() {
	let rx = 0, tx = 0, seen = {};
	// access point: no WAN port; the internet bytes of its devices are the bridge counters
	// (accounting, table bridge homenet_ap): the speed on Home was 0 (owner 2026-11-20)
	if (cursor().get('lg7200', 'state', 'mode') == 'ap') {
		const out = sh_out('nft list counters table bridge homenet_ap 2>/dev/null') ?? '';
		const d = match(out, /counter wan_down[^}]*bytes ([0-9]+)/), u = match(out, /counter wan_up[^}]*bytes ([0-9]+)/);
		return { rx: d ? +d[1] : 0, tx: u ? +u[1] : 0, time: +split(trim(readfile('/proc/uptime') ?? '0'), ' ')[0] };
	}
	cursor().foreach('network', 'interface', s => {
		const n = s['.name'];
		if (!match(n, /^wan[0-9]*$/)) return;
		for (let d in [ 'pppoe-' + n, s.device ?? '' ]) {
			if (!d || seen[d]) continue;
			const b = readfile(`/sys/class/net/${d}/statistics/rx_bytes`);
			if (b == null) continue;
			seen[d] = true;
			rx += +trim(b); tx += +trim(readfile(`/sys/class/net/${d}/statistics/tx_bytes`) ?? '0');
			break;
		}
	});
	return { rx, tx, time: +split(trim(readfile('/proc/uptime') ?? '0'), ' ')[0] };
}
// seconds since the router started
function uptime() { return int(+split(trim(readfile('/proc/uptime') ?? '0'), ' ')[0]); }

function policy() { return cursor().get('homenet', 'main', 'new_devices') == 'ask' ? 'ask' : 'allow'; }

// the household passwords of the home networks (a person's password must differ)
function home_keys(c) {
	const out = [];
	c.foreach('wireless', 'wifi-iface', v => { if (v.mode == 'ap' && v.network == 'lan' && v.key) push(out, v.key); });
	return out;
}

// controls.tsv rows still in force, and held device ids
function controls_state() {
	const now = time();
	let rows = [], held = {};
	for (let f in tsv('controls.tsv', false)) {
		if (f[1] == 'pause' && +f[2] <= now) continue;
		push(rows, { target: f[0], kind: f[1], until: f[1] == 'pause' ? +f[2] : null });
	}
	for (let f in tsv('held.tsv', false)) held[f[0]] = f[1] ?? '';
	// schedules in force now (written by `controls apply` every minute)
	let active = {};
	for (let id in split(trim(readfile(`${RUN}/schedules-active`) ?? ''), '\n')) if (id != '') active[id] = true;
	let schedules = map(tsv('schedules.tsv', false), f => ({
		id: f[0], target: f[1], days: f[2], start: f[3], end: f[4], enabled: f[5] == '1',
		label: f[6] ?? '', active: !!active[f[0]] }));
	// daily time limits (B7 feature 4): limit and minutes used today per target
	const today = sh_out('date +%F');
	let used = {}, extra = {}, person = {}, timelimits = [];
	for (let f in tsv('screentime.tsv', true)) if (f[0] == today) used[f[1]] = +f[2];
	// extra time given for today (owner 2026-11-22); a device also gets its person's extra
	for (let f in tsv('timeextra.tsv', false)) if (f[0] == today) extra[f[1]] = (extra[f[1]] ?? 0) + +f[2];
	for (let f in tsv('devices.tsv', false)) if (f[2]) person[f[0]] = f[2];
	for (let f in tsv('timelimits.tsv', false)) {
		const ex = (extra[f[0]] ?? 0) + (person[f[0]] ? (extra[person[f[0]]] ?? 0) : 0);
		const u = used[f[0]] ?? 0, total = +f[1] + ex;
		push(timelimits, { target: f[0], minutes: +f[1], extra_today: ex, used_today: u,
			left: total > u ? total - u : 0, up: u >= total });
	}
	return { rows, held, schedules, timelimits };
}

function people_list() {
	return map(tsv('people.tsv', false), f => ({ id: f[0], name: f[1] ?? '' }));
}

// Units (B7.3e item 6): whole numbers only. Speeds in kbit/s, volumes in MB (1 MB = 1048576
// bytes), byte counts in bytes. The pages show GB as 1024 MB everywhere.
const MB = 1048576;

// package size in MB (package_mb; a config from before B7.3e has package_gb)
function package_mb(c) {
	const mb = c.get('homenet', 'main', 'package_mb');
	if (mb != null) return +mb;
	return int(+(c.get('homenet', 'main', 'package_gb') ?? 0) * 1024 + 0.5);
}

// speed limits (B7 feature 5): target -> { down_kbit, up_kbit } (0 = no limit that way)
// devices and people whose internet goes first (owner 2026-11-22, controls prio_apply)
function priority_set() {
	let m = {};
	for (let f in tsv('priority.tsv', false)) m[f[0]] = true;
	return m;
}

function speed_map() {
	let m = {};
	for (let f in tsv('speed.tsv', false)) m[f[0]] = { down_kbit: +f[1], up_kbit: +f[2] };
	return m;
}

// usage limits (B7 feature 6): limits.tsv + what `controls apply` computed (quota.tsv)
function quota_state() {
	let st = {};
	for (let f in tsv('quota.tsv', true)) st[f[0]] = { used: +f[1], limit: +f[2], warn: +f[3], up: f[4] == '1' };
	return st;
}
function limits_map() {
	const st = quota_state();
	let m = {};
	for (let f in tsv('limits.tsv', false)) {
		const s = st[f[0]];
		m[f[0]] = { mb: int(+f[1] / MB), bytes: +f[1], warn: +f[2], used: s ? s.used : null, up: s ? s.up : false };
	}
	return m;
}

// kids mode (B7 feature 7) and running site locks (B7 feature 8)
function kids_set() {
	let k = {};
	for (let f in tsv('kids.tsv', false)) k[f[0]] = true;
	return k;
}
function catalog() {
	let c = {};
	for (let l in split(readfile('/usr/share/homenet/site-catalog.tsv') ?? '', '\n')) {
		const f = split(l, '\t');
		if (length(f) >= 4) c[f[0]] = { id: f[0], group: f[1], label: f[2], domains: split(f[3], ',') };
	}
	return c;
}
function site_locks() {
	const now = time();
	return map(filter(tsv('sitelocks.tsv', false), f => f[2] == '0' || +f[2] > now), f => ({
		id: f[0], target: f[1], until: +f[2], always: f[2] == '0',
		minutes_left: f[2] == '0' ? null : int((+f[2] - now + 59) / 60),
		sites: f[3] ? split(f[3], ',') : [], domain: f[4] ?? '' }));
}
function lines_of(name) {
	// (map passes the index as a second argument: trim(l, 0) would trim "0" characters)
	return filter(map(split(trim(readfile(`${DATA}/${name}`) ?? ''), '\n'), l => trim(l)), l => l != '');
}

// ------------------------------------------------------------------ user role (B7.3a, 11.2)
// A "user" login is an rpcd login tied to ONE person: it can read that person's devices and
// usage (method `me`) and nothing else. Its password is the shadow password of a system user
// vx_<name> (no shell, no home; rpcd checks it with "$p$vx_<name>"), set through passwd's
// stdin, so it never appears on a command line, in uci or in a log. The root password is never
// shared. homenet uci: config user (username, person).
const USER_RE = /^[a-z][a-z0-9_]{2,15}$/;
const RESERVED = [ 'root', 'admin', 'daemon', 'network', 'nobody', 'dnsmasq', 'ftp', 'ubus', 'logd', 'ntp', 'user' ];

function user_rows() {
	let out = [];
	cursor().foreach('homenet', 'user', s => push(out, { username: s.username ?? '', person: s.person ?? '', section: s['.name'] }));
	return out;
}

// /etc/passwd and /etc/shadow: one line added or removed, written atomically
function edit_account_file(path, name, line) {
	const lines = filter(split(readfile(path) ?? '', '\n'), l => l != '' && split(l, ':')[0] != name);
	if (line) push(lines, line);
	const tmp = `${path}.vx${time()}`;
	if (writefile(tmp, join('\n', lines) + '\n') == null) return false;
	chmod(tmp, path == '/etc/shadow' ? 0o600 : 0o644);
	return rename(tmp, path);
}

function set_user_password(sys, pw) {
	const fd = popen(`/bin/busybox passwd ${shq(sys)} >/dev/null 2>&1`, 'w');
	if (!fd) return false;
	fd.write(pw + '\n'); fd.flush(); sleep(1000); fd.write(pw + '\n');
	return fd.close() == 0 && !match(split(filter(split(readfile('/etc/shadow') ?? '', '\n'), l => split(l, ':')[0] == sys)[0] ?? '', ':')[1] ?? '*', /^[*!x]?$/);
}

function pw_ok(pw) { return type(pw) == 'string' && length(pw) >= 8 && length(pw) <= 64 && !match(pw, /[\n\r:]/); }

// The username of the session that made the call. rpcd serves the `session` object itself and
// handles one request at a time, so asking it synchronously from inside a method deadlocks
// (found by the VM test: every `me` call timed out). The method therefore defers its reply,
// asks in a child process, and replies when the child is done (rpcd's loop stays free).
function with_session_user(req, done) {
	const sid = req.args ? req.args.ubus_rpc_session : null;
	if (type(sid) != 'string' || !match(sid, /^[0-9a-f]{32}$/)) return false;
	const out = `${RUN}/session.${sid}`;
	uloop.process('/bin/sh', [ '-c', `ubus call session get ${shq(sprintf('%J', { ubus_rpc_session: sid }))} > ${shq(out)} 2>/dev/null` ], {},
		function(code) {
			let s = null;
			try { s = json(readfile(out) || 'null'); } catch (e) { s = null; }
			unlink(out);
			done(s && s.values ? s.values.username : null);
		});
	return true;
}

// devices with their MACs, person, online state and usage (today, current billing cycle)
// the maker of a device from the first three bytes of its MAC (owner 2026-11-22: a name next to
// a device without one): /usr/share/homenet/makers.tsv (tools/makers-table.py, about 11 000
// prefixes of makers found in a house), read once per rpcd start. A MAC with the "locally
// administered" bit (the second hex digit 2, 6, a or e) is a private address a phone or tablet made
// up for this network: no maker can be known, the page says "private address".
let MAKERS = null;
function maker_of(mac) {
	if (MAKERS == null) {
		MAKERS = {};
		for (let l in split(readfile('/usr/share/homenet/makers.tsv') ?? '', '\n')) {
			const t = index(l, '	');
			if (t == 6) MAKERS[substr(l, 0, 6)] = substr(l, 7);
		}
	}
	return MAKERS[replace(substr(lc(mac ?? ''), 0, 8), /:/g, '')] ?? null;
}
function private_mac(mac) { return !!match(lc(mac ?? ''), /^.[26ae]:/); }

function devices_list() {
	const today = sh_out('date +%F'), cyc = cycle(), on = online_macs(), cs = controls_state();
	let pname = {};
	for (let p in people_list()) pname[p.id] = p.name;
	let macs = {}, use = {};
	// B9 Y3: which access point each device is on, with its signal (homenet-apctl writes the list;
	// "main" is the main router itself)
	const apname = { main: null }, apmac = {}, where = {}, cab = {}, cabset = {};
	cursor().foreach('apctl', 'ap', s => { apname[s['.name']] = s.name ?? s['.name']; apmac[s['.name']] = lc(s.mac ?? ''); });
	for (let l in split(readfile('/tmp/homenet/ap-clients.tsv') ?? '', '\n')) {
		const f = split(l, '\t');
		if (length(f) < 4) continue;
		// band "lan": on a cable port of that access point (0.9.0-rc4.2)
		if (f[3] == 'lan') {
			if (!cab[f[0]]) cab[f[0]] = [];
			push(cab[f[0]], f[1]);
			if (!cabset[f[1]]) cabset[f[1]] = {};
			cabset[f[1]][f[0]] = true;
		}
		else if (!where[f[0]] || +f[2] > where[f[0]].signal)
			where[f[0]] = { ap: f[1], name: apname[f[1]] ?? null, signal: +f[2], band: f[3] };
	}
	// a cable only where no Wi-Fi saw the device; seen on the cable side of several units (a switch,
	// units in a chain): the nearest one, the unit with none of the other claimants behind it
	for (let m, c in cab) {
		if (where[m]) continue;
		let best = null;
		for (let x in c) {
			let behind = false;
			for (let z in c) if (z != x && apmac[z] && cabset[x]?.[apmac[z]]) behind = true;
			if (!behind) { best = x; break; }
		}
		best ??= c[0];
		where[m] = { ap: best, name: apname[best] ?? null, signal: null, band: 'lan' };
	}
	for (let f in tsv('device-macs.tsv', true)) {
		if (!macs[f[1]]) macs[f[1]] = [];
		push(macs[f[1]], { mac: f[0], first_seen: f[2] ?? '', last_seen: f[3] ?? '', hostname: f[4] ?? '',
		                   maker: private_mac(f[0]) ? null : maker_of(f[0]), private: private_mac(f[0]),
		                   online: !!on[f[0]], ip: on[f[0]] ? on[f[0]].ip : '',
		                   link: on[f[0]] ? on[f[0]].link : '' });
	}
	for (let f in tsv('usage-history.tsv', true)) {
		if (!use[f[1]]) use[f[1]] = { today_up: 0, today_down: 0, cycle_up: 0, cycle_down: 0 };
		const u = use[f[1]];
		if (f[0] == today) { u.today_up += +f[2]; u.today_down += +f[3]; }
		if (f[0] >= cyc.start) { u.cycle_up += +f[2]; u.cycle_down += +f[3]; }
	}
	// control on the device itself, or on its person
	function ctl(id, person, kind) {
		for (let r in cs.rows)
			if (r.kind == kind && (r.target == id || (person != '' && r.target == person)))
				return r.kind == 'pause' ? r.until : true;
		return kind == 'pause' ? null : false;
	}
	// usage nobody could be given to (B7.5d): "unknown" + still unattributed, shown as غير معروف
	let unknown = use['unknown'] ?? { today_up: 0, today_down: 0, cycle_up: 0, cycle_down: 0 };
	for (let f in tsv('unattributed.tsv', true)) {
		if (f[0] == today) { unknown.today_up += +f[2]; unknown.today_down += +f[3]; }
		if (f[0] >= cyc.start) { unknown.cycle_up += +f[2]; unknown.cycle_down += +f[3]; }
	}
	// the router's own WAN traffic (B7.5d): shown as «الراوتر نفسه»
	const router = use['router'] ?? { today_up: 0, today_down: 0, cycle_up: 0, cycle_down: 0 };
	// the guest network (B9 Y2): one row «الضيوف»
	const guest = use['guest'] ?? { today_up: 0, today_down: 0, cycle_up: 0, cycle_down: 0 };
	const sp = speed_map(), lm = limits_map(), kd = kids_set(), locks = site_locks(), pr = priority_set();
	// MACs that are a router in router mode (accounting: set behind_nat, by the TTL of its packets)
	const nat = {};
	for (let m in match(sh_out('nft list set inet homenet behind_nat 2>/dev/null; nft list set bridge homenet_ap behind_nat 2>/dev/null'), /([0-9a-f]{2}:){5}[0-9a-f]{2}/g) ?? [])
		nat[m[0]] = true;
	// own setting of the device, and the one of its person (both apply)
	function own(m, id) { return m[id] ?? null; }
	function via(m, p) { return p ? (m[p] ?? null) : null; }
	return {
		today, cycle: cyc, policy: policy(), unknown, router, guest,
		devices: map(tsv('devices.tsv', false), f => ({
			speed: own(sp, f[0]), person_speed: via(sp, f[2]),
			limit: own(lm, f[0]), person_limit: via(lm, f[2]),
			kids: !!(kd[f[0]] || (f[2] && kd[f[2]])), kids_via_person: !kd[f[0]] && !!(f[2] && kd[f[2]]),
			priority: !!(pr[f[0]] || (f[2] && pr[f[2]])), priority_via_person: !pr[f[0]] && !!(f[2] && pr[f[2]]),
			site_locks: map(filter(locks, l => l.target == f[0] || (f[2] && l.target == f[2])), l => l.id),
			blocked: ctl(f[0], f[2] ?? '', 'block'), paused_until: ctl(f[0], f[2] ?? '', 'pause'),
			scheduled_off: length(filter(cs.schedules, x => x.active && (x.target == f[0] || (f[2] && x.target == f[2])))) > 0,
			time: (filter(cs.timelimits, x => x.target == f[0])[0] ?? (f[2] ? filter(cs.timelimits, x => x.target == f[2])[0] : null)),
			held: f[0] in cs.held,
			behind_router: length(filter(macs[f[0]] ?? [], m => nat[lc(m.mac)])) > 0,
			id: f[0], name: f[1] ?? '', person: f[2] ?? '', person_name: pname[f[2]] ?? '',
			created: f[5] ?? '', macs: macs[f[0]] ?? [],
			maker: (filter(macs[f[0]] ?? [], m => m.maker)[0] ?? {}).maker ?? null,
			private_mac: length(macs[f[0]] ?? []) > 0 && length(filter(macs[f[0]] ?? [], m => !m.private)) == 0,
			online: length(filter(macs[f[0]] ?? [], m => m.online)) > 0,
			where: (function() { let w = null; for (let m in macs[f[0]] ?? []) if (where[m.mac] && (!w || where[m.mac].signal > w.signal)) w = where[m.mac]; return w; })(),
			usage: use[f[0]] ?? { today_up: 0, today_down: 0, cycle_up: 0, cycle_down: 0 }
		}))
	};
}

// Computers (owner 2026-11-21): the computers page lists computers only. A device is a computer when
// the Virox program on it reported its MAC (why "program"), when the admin said so ("chosen"), or
// when its name says so ("name": Windows DESKTOP-/LAPTOP-, a Mac, a laptop model...) unless the
// admin said it is not one. uci homenet.computers: list device (chosen), list not (said not).
const PC_NAME = /^(desktop|laptop|win|pc)-|(^|[-_ .])pc([-_ .0-9]|$)|macbook|imac|mac-?mini|mac-?pro|mac-?studio|thinkpad|thinkcentre|latitude|inspiron|optiplex|vostro|pavilion|elitebook|probook|ideapad|legion|vivobook|zenbook|aspire|predator|surface|ubuntu|debian|fedora|linux|workstation|desktop|laptop|notebook|computer/i;
function as_list(v) { return v == null ? [] : (type(v) == 'array' ? v : [ v ]); }
// the device of each Virox program (virox.pc), by the MACs it reported: { device: { id, online } }
function pc_programs() {
	const by_mac = {}, out = {}, now = time();
	for (let f in tsv('device-macs.tsv', true)) by_mac[f[0]] = f[1];
	cursor().foreach('homenet', 'pc', s => {
		const st = json(readfile(`${RUN}/pc/${s['.name']}.json`) ?? 'null') ?? {};
		for (let m in st.macs ?? [])
			if (by_mac[m]) { out[by_mac[m]] = { id: s['.name'], online: now - (st.seen ?? 0) < 20 }; break; }
	});
	return out;
}
function computers_list() {
	const c = cursor(), chosen = {}, not = {}, prog = pc_programs(), out = [], others = [];
	for (let d in as_list(c.get('homenet', 'computers', 'device'))) chosen[d] = true;
	for (let d in as_list(c.get('homenet', 'computers', 'not'))) not[d] = true;
	// the DHCP host names of now too: the device list records them at its next save (5 minutes),
	// a computer that just joined is recognised at once
	const lease_host = {};
	for (let l in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) {
		const f = split(l, ' ');
		if (length(f) >= 4 && f[3] != '*' && norm_mac(f[1])) lease_host[norm_mac(f[1])] = f[3];
	}
	for (let d in devices_list().devices) {
		const hosts = filter(map(d.macs, m => m.hostname || lease_host[m.mac] || ''), h => h != '');
		const name = d.name != '' ? d.name : (hosts[0] ?? '');
		let why = null;
		if (prog[d.id]) why = 'program';
		else if (chosen[d.id]) why = 'chosen';
		else if (!not[d.id] && (match(d.name, PC_NAME) || length(filter(hosts, h => match(h, PC_NAME))))) why = 'name';
		if (why)
			push(out, { device: d.id, name, online: d.online, why, pc: prog[d.id]?.id ?? null, pc_online: prog[d.id]?.online ?? false,
			            cable: length(filter(d.macs, m => m.link == 'cable')) > 0 });
		else
			push(others, { device: d.id, name, online: d.online });
	}
	return { computers: out, others };
}

// reply of `me` (the user role): the person's own devices only
function me_reply(u) {
	const row = u ? filter(user_rows(), x => x.username == u)[0] : null;
	if (!row) return { result: false, error: 'not_a_user' };
	const d = devices_list();
	return {
		username: u, person: row.person,
		person_name: (filter(people_list(), p => p.id == row.person)[0] ?? {}).name ?? '',
		today: d.today, cycle: d.cycle,
		devices: map(filter(d.devices, x => x.person == row.person), x => ({
			id: x.id, name: x.name, online: x.online, usage: x.usage, blocked: x.blocked,
			paused_until: x.paused_until, scheduled_off: x.scheduled_off, time: x.time,
			limit: x.limit ?? x.person_limit, kids: x.kids }))
	};
}

const homenet = {
	// ------------------------------------------------ devices and people (B7 feature 1)
	devices: { call: function() { return cached('devices', 2, devices_list); } },

	people: {
		call: function() {
			const d = cached('devices', 2, devices_list).devices;
			return { people: map(people_list(), p => ({ ...p, devices: map(filter(d, x => x.person == p.id), x => x.id) })) };
		}
	},

	set_name: {
		args: { id: '', name: '' },
		call: function(req) { return plain(devices_cmd('set-name', req.args.id, req.args.name)); }
	},

	set_person: {
		args: { id: '', person: '' },
		call: function(req) { return plain(devices_cmd('set-person', req.args.id, req.args.person)); }
	},

	person_add: {
		args: { name: '' },
		call: function(req) {
			const r = devices_cmd('person-add', req.args.name);
			return r.result ? { result: true, id: r.value } : r;
		}
	},

	person_rename: {
		args: { id: '', name: '' },
		call: function(req) { return plain(devices_cmd('person-rename', req.args.id, req.args.name)); }
	},

	person_delete: {
		args: { id: '' },
		call: function(req) { return plain(devices_cmd('person-delete', req.args.id)); }
	},

	// the MAC belongs to device <id> (a phone that changed its random MAC); usage moves with it
	link: {
		args: { mac: '', id: '' },
		call: function(req) { return plain(devices_cmd('link', req.args.mac, req.args.id)); }
	},

	// B9 Y2 guest network: name, password, on/off, line (the page draws the QR code)
	guest: {
		call: function() {
			const c = cursor();
			return {
				enabled: c.get('homenet', 'guest', 'enabled') == '1', ssid: c.get('homenet', 'guest', 'ssid') ?? '',
				key: c.get('homenet', 'guest', 'key') ?? '', line: +(c.get('homenet', 'guest', 'line') ?? 0),
				band: c.get('homenet', 'guest', 'band') ?? '2g', hidden: c.get('homenet', 'guest', 'hidden') == '1',
				// limits (owner 2026-11-22): speed for all guests together, switch off by itself
				down_kbit: +(c.get('homenet', 'guest', 'down_kbit') ?? 0), up_kbit: +(c.get('homenet', 'guest', 'up_kbit') ?? 0),
				hours: +(c.get('homenet', 'guest', 'hours') ?? 0), off_at: +(c.get('homenet', 'guest', 'off_at') ?? 0) || null
			};
		}
	},

	// guest limits (owner 2026-11-22): down_kbit / up_kbit for all guests together (0 = none, else
	// 100-1000000), hours = switch off by itself that many hours after it is turned on (0 = never,
	// 1-24); when the guest network is on now, the hours count from now. Applied within a minute.
	guest_limits: {
		args: { down_kbit: 0, up_kbit: 0, hours: 0 },
		call: function(req) {
			const a = req.args, ok = k => k === 0 || (k >= 100 && k <= 1000000);
			const d = int(+(a.down_kbit ?? 0)), u = int(+(a.up_kbit ?? 0)), h = int(+(a.hours ?? 0));
			if (!ok(d) || !ok(u)) return { result: false, error: 'invalid_speed' };
			if (!(h >= 0 && h <= 24)) return { result: false, error: 'invalid_hours' };
			const c = cursor();
			if (c.get('homenet', 'guest') == null) c.set('homenet', 'guest', 'guest');
			c.set('homenet', 'guest', 'down_kbit', `${d}`);
			c.set('homenet', 'guest', 'up_kbit', `${u}`);
			c.set('homenet', 'guest', 'hours', `${h}`);
			if (h > 0 && c.get('homenet', 'guest', 'enabled') == '1') c.set('homenet', 'guest', 'off_at', `${time() + h * 3600}`);
			else c.delete('homenet', 'guest', 'off_at');
			c.commit('homenet');
			return plain(controls_cmd('apply'));
		}
	},

	// hide the guest network name (owner 2026-11-21: a checkbox per network). Kept while the guest
	// network is off; access points follow at their next contact (apctl sync, guest.hidden)
	guest_hidden: {
		args: { on: false },
		call: function(req) {
			const c = cursor(), on = !!req.args.on;
			if (c.get('homenet', 'guest') == null) c.set('homenet', 'guest', 'guest');
			c.set('homenet', 'guest', 'hidden', on ? '1' : '0');
			c.commit('homenet');
			let n = 0;
			c.foreach('wireless', 'wifi-iface', v => {
				if (v.network != 'guest') return;
				if (on) c.set('wireless', v['.name'], 'hidden', '1'); else c.delete('wireless', v['.name'], 'hidden');
				n++;
			});
			if (n) { c.commit('wireless'); system('(sleep 1; wifi reload) >/dev/null 2>&1 &'); }
			return { result: true };
		}
	},

	guest_set: {
		args: { enabled: false, ssid: '', key: '', line: 0, band: '' },
		call: function(req) {
			const a = req.args;
			if (a.enabled) {
				if (!length(a.ssid) || length(a.ssid) > 32 || match(a.ssid, /[\t\n]/)) return { result: false, error: 'invalid_ssid' };
				if (length(a.key) < 8 || length(a.key) > 63 || match(a.key, /[^\x20-\x7e]/)) return { result: false, error: 'invalid_key' };
			}
			if (!(+a.line >= 0 && +a.line <= 3)) return { result: false, error: 'invalid_line' };   // 3 = both lines
			// which band: 2.4 GHz (default), 5 GHz or both; "" keeps the band set before
			if (a.band && !(a.band in [ '2g', '5g', 'both' ])) return { result: false, error: 'invalid_band' };
			const c = cursor();
			if (c.get('homenet', 'guest') == null) c.set('homenet', 'guest', 'guest');
			// switch off by itself (guest_limits): the hours count from the moment it is turned on
			const was = c.get('homenet', 'guest', 'enabled') == '1', hrs = +(c.get('homenet', 'guest', 'hours') ?? 0);
			if (!a.enabled) c.delete('homenet', 'guest', 'off_at');
			else if (!was && hrs > 0) c.set('homenet', 'guest', 'off_at', `${time() + hrs * 3600}`);
			c.set('homenet', 'guest', 'enabled', a.enabled ? '1' : '0');
			if (a.ssid) c.set('homenet', 'guest', 'ssid', a.ssid);
			if (a.key) c.set('homenet', 'guest', 'key', a.key);
			c.set('homenet', 'guest', 'line', `${+a.line}`);
			if (a.band) c.set('homenet', 'guest', 'band', a.band);
			c.commit('homenet');
			return plain(run_cmd('/usr/libexec/homenet/guest', [ 'apply' ]));
		}
	},

	// B9 R5 layer 3: personal Wi-Fi passwords, one per person (admin sees them, to pass them on)
	wifikeys: {
		call: function() {
			const c = cursor(), out = [];
			c.foreach('homenet', 'wifikey', s => { push(out, { person: s.person, key: s.key }); });
			return { keys: out, wpa2: length(out) > 0, autolink: c.get('homenet', 'main', 'autolink') == '1' };
		}
	},

	// key "" removes the person's password; 8 to 63 printable characters otherwise
	wifikey_set: {
		args: { person: '', key: '' },
		call: function(req) {
			const p = req.args.person, k = req.args.key ?? '';
			if (!match(p ?? '', /^p[0-9]+$/)) return { result: false, error: 'unknown_person' };
			if (k != '' && (length(k) < 8 || length(k) > 63 || match(k, /[^\x20-\x7e]/))) return { result: false, error: 'invalid_key' };
			const c = cursor();
			let sec = null, taken = false;
			c.foreach('homenet', 'wifikey', s => { if (s.person == p) sec = s['.name']; else if (k != '' && s.key == k) taken = true; });
			// the household password is not a person's (the router could not tell them apart)
			if (k != '' && k in home_keys(c)) taken = true;
			if (taken) return { result: false, error: 'key_taken' };
			if (k == '') { if (sec) c.delete('homenet', sec); }
			else { if (!sec) sec = c.add('homenet', 'wifikey'); c.set('homenet', sec, 'person', p); c.set('homenet', sec, 'key', k); }
			c.commit('homenet');
			return run_cmd('/usr/libexec/homenet/identity', [ 'keys-apply' ]).result ? { result: true } : { result: false, error: 'failed' };
		}
	},

	// BUILD-PLAN 15.9 item 3: "Add a person" = a name and a password in one step; every device that
	// joins with that password is then added to the person by itself (identity, device_person_from_key)
	person_with_key: {
		args: { name: '', key: '' },
		call: function(req) {
			const k = req.args.key ?? '';
			if (length(k) < 8 || length(k) > 63 || match(k, /[^\x20-\x7e]/)) return { result: false, error: 'invalid_key' };
			const c = cursor();
			let taken = k in home_keys(c);
			c.foreach('homenet', 'wifikey', s => { if (s.key == k) taken = true; });
			if (taken) return { result: false, error: 'key_taken' };
			const r = devices_cmd('person-add', req.args.name);
			if (!r.result) return r;
			const id = r.value, sec = c.add('homenet', 'wifikey');
			c.set('homenet', sec, 'person', id); c.set('homenet', sec, 'key', k);
			c.commit('homenet');
			if (!run_cmd('/usr/libexec/homenet/identity', [ 'keys-apply' ]).result) {
				c.delete('homenet', sec); c.commit('homenet'); devices_cmd('person-delete', id);
				return { result: false, error: 'failed' };
			}
			return { result: true, id };
		}
	},

	// BUILD-PLAN 15.9 item 2: every network of the house with its name and password, for its QR code
	// and the printed card (admin only: a family login never sees passwords)
	wifi_cards: {
		call: function() {
			const c = cursor(), home = {}, out = [];
			c.foreach('wireless', 'wifi-iface', v => {
				if (v.mode != 'ap' || v.network != 'lan' || v.disabled == '1' || !v.ssid) return;
				const band = c.get('wireless', v.device, 'band') ?? '';
				const enc = v.encryption ?? 'none';
				const k = `${v.ssid}\n${v.key ?? ''}`;
				if (!home[k]) { home[k] = { kind: 'home', ssid: v.ssid, key: enc == 'none' ? '' : (v.key ?? ''), open: enc == 'none', hidden: v.hidden == '1', bands: [] }; push(out, home[k]); }
				if (band && !(band in home[k].bands)) push(home[k].bands, band);
			});
			if (c.get('homenet', 'guest', 'enabled') == '1' && c.get('homenet', 'guest', 'ssid'))
				push(out, { kind: 'guest', ssid: c.get('homenet', 'guest', 'ssid'), key: c.get('homenet', 'guest', 'key') ?? '', open: false, hidden: c.get('homenet', 'guest', 'hidden') == '1', bands: [] });
			const names = {};
			for (let p in tsv('people.tsv')) names[p[0]] = p[1];
			const first = length(out) ? out[0] : null;
			c.foreach('homenet', 'wifikey', s => {
				if (!s.person || !s.key || !first || first.kind != 'home') return;
				push(out, { kind: 'person', person: s.person, name: names[s.person] ?? s.person, ssid: first.ssid, key: s.key, open: false, hidden: first.hidden, bands: first.bands });
			});
			return { networks: out };
		}
	},

	// layer 2: link a phone that came back with a new address when its DHCP fingerprint matches
	autolink: {
		args: { on: false },
		call: function(req) {
			const c = cursor();
			c.set('homenet', 'main', 'autolink', req.args.on ? '1' : '0');
			c.commit('homenet');
			return { result: true };
		}
	},

	// two device records are the same device: everything of <from> moves to <into>
	merge: {
		args: { from: '', into: '' },
		call: function(req) { return plain(devices_cmd('merge', req.args.from, req.args.into)); }
	},
	// a device leaves the list; its usage stays in the totals as "removed"
	device_forget: {
		args: { id: '' },
		call: function(req) { return plain(devices_cmd('forget', req.args.id)); }
	},

	// ------------------------------------------------ controls (B7 feature 2, B7.3c)
	// target: a device id (all its MACs) or a person id (all the person's devices)
	block: { args: { target: '' }, call: function(req) { return plain(controls_cmd('block', req.args.target)); } },
	unblock: { args: { target: '' }, call: function(req) { return plain(controls_cmd('unblock', req.args.target)); } },
	pause: {
		args: { target: '', minutes: 0 },
		call: function(req) { return plain(controls_cmd('pause', req.args.target, `${req.args.minutes ?? ''}`)); }
	},
	resume: { args: { target: '' }, call: function(req) { return plain(controls_cmd('resume', req.args.target)); } },

	// new-devices policy: allow (default) | ask (no internet until approved or linked)
	set_policy: {
		args: { new_devices: '' },
		call: function(req) { return plain(controls_cmd('policy', req.args.new_devices)); }
	},
	approve: { args: { id: '' }, call: function(req) { return plain(controls_cmd('approve', req.args.id)); } },
	controls: {
		call: function() {
			const cs = controls_state();
			return { policy: policy(), controls: cs.rows,
			         held: map(keys(cs.held), id => ({ id, since: cs.held[id] })) };
		}
	},

	// schedules (B7 feature 3): internet off on days between start and end (local time)
	// days: digits 0-6 (0 = Sunday); start/end "HH:MM"; end <= start runs past midnight
	schedules: { call: function() { return { now: sh_out("date '+%w %H:%M'"), schedules: controls_state().schedules }; } },
	schedule_add: {
		args: { target: '', days: '', start: '', end: '', label: '' },
		call: function(req) {
			const a = req.args, r = controls_cmd('sched-add', a.target, a.days, a.start, a.end, a.label);
			return r.result ? { result: true, id: r.value } : r;
		}
	},
	schedule_update: {
		args: { id: '', target: '', days: '', start: '', end: '', label: '' },
		call: function(req) { const a = req.args; return plain(controls_cmd('sched-update', a.id, a.target, a.days, a.start, a.end, a.label)); }
	},
	schedule_enable: {
		args: { id: '', enabled: false },
		call: function(req) { return plain(controls_cmd('sched-enable', req.args.id, req.args.enabled ? '1' : '0')); }
	},
	schedule_remove: { args: { id: '' }, call: function(req) { return plain(controls_cmd('sched-remove', req.args.id)); } },

	// daily internet time (B7 feature 4): minutes per day on a device or a person; 0 removes
	timelimits: { call: function() { return { today: sh_out('date +%F'), timelimits: controls_state().timelimits }; } },
	timelimit_set: {
		args: { target: '', minutes: 0 },
		call: function(req) { return plain(controls_cmd('timelimit', req.args.target, `${req.args.minutes ?? ''}`)); }
	},
	// extra time for today only, 5..720 minutes (owner 2026-11-22)
	timelimit_extra: {
		args: { target: '', minutes: 0 },
		call: function(req) { return plain(controls_cmd('timelimit-extra', req.args.target, `${req.args.minutes ?? ''}`)); }
	},

	// ------------------------------------------------ settings (package, renewal day, B7.3d)
	settings: {
		call: function() {
			const c = cursor();
			return {
				package_mb: package_mb(c),
				renew_day: +(c.get('homenet', 'main', 'renew_day') ?? 1),
				package_warn: +(c.get('homenet', 'main', 'package_warn') ?? 80),
				active_kb: +(c.get('homenet', 'main', 'active_kb') ?? 40),
				new_devices: policy()
			};
		}
	},

	// any subset of: package_mb 0-102400000 (0 = no package), renew_day 1-31, package_warn
	// 50-100, active_kb 1-10000 (a minute of internet time counts above this many KB, B7.3d)
	settings_set: {
		args: { package_mb: 0, renew_day: 0, package_warn: 0, active_kb: 0 },
		call: function(req) {
			const a = req.args, c = cursor();
			function int_in(v, lo, hi) { return type(v) == 'int' && v >= lo && v <= hi; }
			if (a.package_mb != null && !int_in(a.package_mb, 0, 102400000))
				return { result: false, error: 'invalid_package' };
			if (a.renew_day != null && !int_in(a.renew_day, 1, 31)) return { result: false, error: 'invalid_renew_day' };
			if (a.package_warn != null && !int_in(a.package_warn, 50, 100)) return { result: false, error: 'invalid_warn' };
			if (a.active_kb != null && !int_in(a.active_kb, 1, 10000)) return { result: false, error: 'invalid_active_kb' };
			let pkg_changed = false;
			if (a.package_mb != null) {
				c.set('homenet', 'main', 'package_mb', `${a.package_mb}`);
				c.delete('homenet', 'main', 'package_gb');
				pkg_changed = true;
			}
			if (a.renew_day != null) { c.set('homenet', 'main', 'renew_day', `${a.renew_day}`); pkg_changed = true; }
			if (a.package_warn != null) { c.set('homenet', 'main', 'package_warn', `${a.package_warn}`); pkg_changed = true; }
			if (a.active_kb != null) c.set('homenet', 'main', 'active_kb', `${a.active_kb}`);
			c.commit('homenet');
			// limits and the package are judged again at once (a new package may alert again)
			return plain(controls_cmd(pkg_changed ? 'package-changed' : 'apply'));
		}
	},

	// ------------------------------------------------ speed limits (B7 feature 5)
	speed_limits: {
		call: function() {
			const m = speed_map();
			return { speed_limits: map(keys(m), t => ({ target: t, ...m[t] })) };
		}
	},
	// priority for a device or a person (owner 2026-11-22): at most 3 (error too_many); games and
	// calls of every device still go first. Works while a line is shaped (Ping and games).
	priority_set: {
		args: { target: '', on: false },
		call: function(req) {
			return plain(controls_cmd('priority', req.args.target ?? '', req.args.on ? '1' : '0'));
		}
	},

	// down_kbit / up_kbit: 0 (none) or 100-1000000 kbit/s; both 0 removes the limit
	speed_limit_set: {
		args: { target: '', down_kbit: 0, up_kbit: 0 },
		call: function(req) {
			const a = req.args;
			return plain(controls_cmd('speed', a.target, `${a.down_kbit ?? 0}`, `${a.up_kbit ?? 0}`));
		}
	},

	// ------------------------------------------------ usage limits and the package (B7 feature 6)
	limits: {
		call: function() {
			const m = limits_map();
			return { cycle: cycle(), limits: map(keys(m), t => ({ target: t, ...m[t] })) };
		}
	},
	// mb: 0 removes the limit, else 1-102400000; warn: 50-100 percent (default 80)
	limit_set: {
		args: { target: '', mb: 0, warn: 0 },
		call: function(req) {
			const a = req.args;
			return plain(controls_cmd('limit', a.target, `${a.mb ?? ''}`, `${a.warn ?? 80}`));
		}
	},
	// the admin types what the ISP shows as remaining (MB); the package continues from it in this
	// billing cycle (B7.3e item 5c)
	package_calibrate: {
		args: { remaining_mb: 0 },
		call: function(req) { return plain(controls_cmd('calibrate', `${req.args.remaining_mb ?? ''}`)); }
	},
	// the house: package, used in this billing cycle, per day
	usage: {
		call: function() {
			const c = cursor(), cyc = cycle(), pkg = package_mb(c);
			let days = {}, used = 0;
			for (let name in [ 'usage-history.tsv', 'unattributed.tsv' ])
				for (let f in tsv(name, true)) {
					if (f[0] < cyc.start) continue;
					if (!days[f[0]]) days[f[0]] = { day: f[0], up: 0, down: 0 };
					days[f[0]].up += +f[2]; days[f[0]].down += +f[3];
					used += +f[2] + +f[3];
				}
			// wire / booked ratio per day (B7.3e item 5b, diagnosis): how much the fold scaling added
			for (let f in tsv('wire-ratio.tsv', true))
				if (days[f[0]]) days[f[0]].wire_ratio = {
					up: +f[3] > 0 ? int(+f[1] * 10000 / +f[3]) / 10000 : null,
					down: +f[4] > 0 ? int(+f[2] * 10000 / +f[4]) / 10000 : null };
			// ISP calibration of this cycle: the package continues from the typed figure
			const calibrated = c.get('homenet', 'main', 'calib_cycle') == cyc.start;
			const offset = calibrated ? +(c.get('homenet', 'main', 'calib_offset') ?? 0) : 0;
			const router_used = used, limit = pkg * MB;
			used = used + offset; if (used < 0) used = 0;
			return {
				cycle: cyc, package_mb: pkg, package_warn: +(c.get('homenet', 'main', 'package_warn') ?? 80),
				used, router_used, remaining: pkg > 0 ? (limit > used ? limit - used : 0) : null,
				percent: pkg > 0 ? int(used * 100 / limit) : null,
				calibration: calibrated ? { time: +(c.get('homenet', 'main', 'calib_time') ?? 0), offset,
				                            router_used_then: +(c.get('homenet', 'main', 'calib_router_used') ?? 0) } : null,
				days: sort(values(days), (x, y) => x.day < y.day ? -1 : (x.day > y.day ? 1 : 0))
			};
		}
	},

	// usage of one device, one person or the whole house between two days (owner 2026-11-20:
	// choose a device and "from day X to day Y"). target: "" = the house (devices, the router
	// itself, guests, unknown and addresses not given to a device yet), dN, pN, router, guest,
	// unknown. from / to: YYYY-MM-DD, at most 366 days. The day rows are kept for good (the history
	// is never shortened), so any past range works.
	usage_range: {
		args: { target: '', from: '', to: '' },
		call: function(req) {
			const a = req.args, t = a.target ?? '';
			const isday = s => match(s ?? '', /^\d{4}-\d{2}-\d{2}$/);
			if (!isday(a.from) || !isday(a.to) || a.from > a.to) return { result: false, error: 'invalid_range' };
			// day number of a date (civil calendar), for the length of the range
			const dnum = s => {
				let y = +substr(s, 0, 4), m = +substr(s, 5, 2);
				const d = +substr(s, 8, 2);
				if (m <= 2) { y--; m += 12; }
				return 365 * y + int(y / 4) - int(y / 100) + int(y / 400) + int((153 * (m - 3) + 2) / 5) + d;
			};
			const span = dnum(a.to) - dnum(a.from);
			if (span > 366) return { result: false, error: 'invalid_range' };
			if (!(t == '' || t in [ 'router', 'guest', 'unknown' ] || match(t, /^[dp][0-9]+$/))) return { result: false, error: 'unknown_target' };
			// which ids count: one id, or every device of the person
			let want = null;
			if (match(t, /^p[0-9]+$/)) {
				want = {};
				for (let f in tsv('devices.tsv')) if (f[2] == t) want[f[0]] = true;
			}
			else if (t != '') want = { [t]: true };
			let days = {}, per = {}, up = 0, down = 0;
			const add = (day, id, u, d) => {
				if (!days[day]) days[day] = { day, up: 0, down: 0 };
				days[day].up += u; days[day].down += d;
				if (!per[id]) per[id] = { id, up: 0, down: 0 };
				per[id].up += u; per[id].down += d;
				up += u; down += d;
			};
			for (let f in tsv('usage-history.tsv', true))
				if (f[0] >= a.from && f[0] <= a.to && (!want || want[f[1]])) add(f[0], f[1], +f[2], +f[3]);
			// the house also has the addresses not given to a device yet (they move to one later)
			if (t == '' || t == 'unknown')
				for (let f in tsv('unattributed.tsv', true))
					if (f[0] >= a.from && f[0] <= a.to) add(f[0], 'unknown', +f[2], +f[3]);
			// two lines (B9): the same usage split per line (usage-lines.tsv); what is not split (an
			// address before it had a device, the router itself) is in the total only
			let lines = null;
			const lc = cursor();
			for (let f in tsv('usage-lines.tsv', true)) {
				if (f[0] < a.from || f[0] > a.to || (want && !want[f[1]]) || !match(f[2] ?? '', /^[0-9]+$/)) continue;
				lines ??= {};
				const n = f[2];
				lines[n] ??= { line: +n, name: lc.get('lines', `line${n}`, 'name') ?? '', up: 0, down: 0 };
				lines[n].up += +f[3]; lines[n].down += +f[4];
				if (per[f[1]]) {
					per[f[1]].lines ??= {};
					per[f[1]].lines[n] ??= { up: 0, down: 0 };
					per[f[1]].lines[n].up += +f[3]; per[f[1]].lines[n].down += +f[4];
				}
			}
			if (!lines && lc.get('lines', 'main', 'enabled') == '1') lines = {};
			const bydate = (x, y) => x.day < y.day ? -1 : (x.day > y.day ? 1 : 0);
			return { from: a.from, to: a.to, target: t, total: { up, down },
			         days: sort(values(days), bydate),
			         lines: lines ? sort(values(lines), (x, y) => x.line - y.line) : null,
			         devices: sort(values(per), (x, y) => (y.up + y.down) - (x.up + x.down)) };
		}
	},

	// ------------------------------------------------ kids mode (B7 feature 7, P8)
	kids: {
		call: function() {
			return { targets: keys(kids_set()), blocklist: lines_of('kids-blocklist.txt'), policy: policy(),
				kids_log: cursor().get('homenet', 'main', 'kids_log') != '0' };
		}
	},
	// on: true/false. While the new-devices policy is "allow", the answer carries
	// suggest_policy: "ask" (a child could come back with a new random MAC, B7.3c)
	kids_set: {
		args: { target: '', on: false },
		call: function(req) {
			const r = plain(run_cmd(DNS_CMD, [ 'kids', req.args.target, req.args.on ? '1' : '0' ]));
			if (r.result && req.args.on && policy() == 'allow') r.suggest_policy = 'ask';
			return r;
		}
	},
	kids_block: { args: { domain: '' }, call: function(req) { return plain(run_cmd(DNS_CMD, [ 'kids-block', req.args.domain ])); } },
	kids_unblock: { args: { domain: '' }, call: function(req) { return plain(run_cmd(DNS_CMD, [ 'kids-unblock', req.args.domain ])); } },

	// ------------------------------------------------ site locks (B7 feature 8)
	site_catalog: { call: function() { return { sites: values(catalog()) }; } },
	site_locks: { call: function() { return { site_locks: site_locks() }; } },
	// sites: catalog ids (array or comma text) and/or domain; minutes 5-1440
	site_lock: {
		args: { target: '', minutes: 0, sites: [], domain: '' },
		call: function(req) {
			const a = req.args;
			const s = type(a.sites) == 'array' ? join(',', a.sites) : `${a.sites ?? ''}`;
			const r = run_cmd(DNS_CMD, [ 'lock', a.target, `${a.minutes ?? ''}`, s, a.domain ?? '' ]);
			return r.result ? { result: true, id: r.value } : r;
		}
	},
	site_unlock: { args: { id: '' }, call: function(req) { return plain(run_cmd(DNS_CMD, [ 'unlock', req.args.id ])); } },

	// ------------------------------------------------ whole-house filter (B7 feature 9)
	filter: {
		call: function() {
			const c = cursor();
			let st = {};
			for (let l in split(readfile(`${RUN}/filter/status`) ?? '', '\n')) {
				const i = index(l, '=');
				if (i > 0) st[substr(l, 0, i)] = substr(l, i + 1);
			}
			let lists = {};
			for (let k in [ 'ads', 'adult', 'gambling', 'bypass' ]) {
				const s = split(st[k] ?? '', ' ');
				lists[k] = { on: c.get('homenet', 'filter', k) == '1', state: s[0] || 'none',
				             time: s[1] ? +s[1] : null, domains: s[2] ? +s[2] : null };
			}
			return {
				lists, ads_size: c.get('homenet', 'filter', 'ads_size') ?? 'normal', ads_effective: st.ads_effective || null,
				memory_kb: +(sh_out("awk '/^MemAvailable:/ { print $2 }' /proc/meminfo") || 0),
				safesearch: c.get('homenet', 'filter', 'safesearch') == '1',
				youtube: c.get('homenet', 'filter', 'youtube') == '1',
				domains: +(st.domains ?? 0), built: st.built ? +st.built : null, builds: +(st.builds ?? 0), error: st.error || null,
				blocked: lines_of('filter-block.txt'), allowed: lines_of('filter-allow.txt')
			};
		}
	},
	// ads_size: light | normal (default) | pro | pro.plus (B7.3e item 2)
	filter_set: {
		args: { ads: false, adult: false, gambling: false, bypass: false, safesearch: false, youtube: false, ads_size: '' },
		call: function(req) {
			const a = req.args;
			return plain(run_cmd(FILTER_CMD, [ 'set', ...map([ a.ads, a.adult, a.gambling, a.bypass, a.safesearch, a.youtube ], v => v ? '1' : '0'),
			                                   a.ads_size || (cursor().get('homenet', 'filter', 'ads_size') ?? 'normal') ]));
		}
	},
	filter_block: { args: { domain: '' }, call: function(req) { return plain(run_cmd(FILTER_CMD, [ 'block', req.args.domain ])); } },
	filter_unblock: { args: { domain: '' }, call: function(req) { return plain(run_cmd(FILTER_CMD, [ 'unblock', req.args.domain ])); } },
	filter_allow: { args: { domain: '' }, call: function(req) { return plain(run_cmd(FILTER_CMD, [ 'allow', req.args.domain ])); } },
	filter_unallow: { args: { domain: '' }, call: function(req) { return plain(run_cmd(FILTER_CMD, [ 'unallow', req.args.domain ])); } },
	// fetch the lists again now (in the background; `filter` shows the result)
	filter_update: {
		call: function() {
			system(`${FILTER_CMD} update >/dev/null 2>&1 &`);
			return { result: true };
		}
	},

	// ------------------------------------------------ wake a computer (B7 feature 10)
	// a Wake-on-LAN packet to every MAC of the device (or only to <mac>, one of them)
	wake: {
		args: { id: '', mac: '' },
		call: function(req) {
			const id = req.args.id ?? '', only = req.args.mac ? norm_mac(req.args.mac) : null;
			if (req.args.mac && !only) return { result: false, error: 'invalid_mac' };
			const macs = map(filter(tsv('device-macs.tsv', true), f => f[1] == id && (!only || f[0] == only)), f => f[0]);
			if (!length(macs)) return { result: false, error: only ? 'unknown_mac' : 'unknown_device' };
			const lan = cursor().get('network', 'lan', 'device') ?? 'br-lan';
			for (let m in macs)
				if (system(`/usr/bin/etherwake -b -i ${shq(lan)} ${shq(m)} >/dev/null 2>&1`) != 0)
					return { result: false, error: 'send_failed' };
			return { result: true, sent: macs };
		}
	},

	// computers only (owner 2026-11-21), see computers_list()
	computers: { call: function() { return computers_list(); } },
	// the admin says a device is a computer (on) or is not one (off)
	computer_set: {
		args: { device: '', on: false },
		call: function(req) {
			const id = req.args.device ?? '';
			if (!length(filter(tsv('devices.tsv', false), f => f[0] == id))) return { result: false, error: 'unknown_device' };
			const c = cursor();
			if (c.get('homenet', 'computers') == null) c.set('homenet', 'computers', 'computers');
			const yes = filter(as_list(c.get('homenet', 'computers', 'device')), d => d != id);
			const no = filter(as_list(c.get('homenet', 'computers', 'not')), d => d != id);
			push(req.args.on ? yes : no, id);
			if (length(yes)) c.set('homenet', 'computers', 'device', yes); else c.delete('homenet', 'computers', 'device');
			if (length(no)) c.set('homenet', 'computers', 'not', no); else c.delete('homenet', 'computers', 'not');
			c.commit('homenet');
			return { result: true };
		}
	},

	// scheduled wake (owner 2026-11-19): wake a device at a time on chosen days; since 2026-11-21
	// also shut down or sleep at a time (action), through the Virox program on the computer
	wakes: {
		call: function() {
			let out = [];
			cursor().foreach('homenet', 'wake', w => push(out, { id: w['.name'], device: w.device ?? '', time: w.time ?? '', days: w.days ?? '',
				action: w.action ?? 'wake', enabled: w.enabled != '0' }));
			return { wakes: out };
		}
	},
	wake_add: {
		args: { id: '', time: '', days: '', action: '' },
		call: function(req) {
			const a = req.args, action = a.action || 'wake';
			if (!length(filter(tsv('device-macs.tsv', true), f => f[1] == a.id))) return { result: false, error: 'unknown_device' };
			if (!match(a.time ?? '', /^([01][0-9]|2[0-3]):[0-5][0-9]$/)) return { result: false, error: 'invalid_time' };
			if (!match(a.days ?? '', /^[0-6]{1,7}$/)) return { result: false, error: 'invalid_days' };
			if (!(action in [ 'wake', 'shutdown', 'sleep' ])) return { result: false, error: 'invalid_action' };
			// shutting down or sleep needs the program on that computer (wake needs only the MAC)
			if (action != 'wake' && !pc_programs()[a.id]) return { result: false, error: 'no_program' };
			const c = cursor();
			let n = 0;
			c.foreach('homenet', 'wake', () => { n++; });
			if (n >= 32) return { result: false, error: 'too_many' };
			// a named section: an unnamed one gets a new name when another one is deleted
			let k = 1;
			while (c.get('homenet', `wake${k}`) != null) k++;
			const sid = `wake${k}`;
			c.set('homenet', sid, 'wake');
			c.set('homenet', sid, 'device', a.id); c.set('homenet', sid, 'time', a.time); c.set('homenet', sid, 'days', a.days);
			if (action != 'wake') c.set('homenet', sid, 'action', action);
			c.commit('homenet');
			system('/usr/libexec/homenet/wake-sched cron >/dev/null 2>&1');
			return { result: true, id: sid };
		}
	},
	wake_remove: {
		args: { id: '' },
		call: function(req) {
			const c = cursor();
			if (c.get('homenet', req.args.id ?? '') != 'wake') return { result: false, error: 'unknown_wake' };
			c.delete('homenet', req.args.id); c.commit('homenet');
			system('/usr/libexec/homenet/wake-sched cron >/dev/null 2>&1');
			return { result: true };
		}
	},

	// the outages of one month for the internet company (owner 2026-11-22): month = YYYY-MM (default
	// this month); rows from homenet/watch's outages.tsv: start, end, seconds, line, reason (no_internet:
	// the modem answered, the internet did not; no_modem; wan_down). months = the months that have rows.
	outages: {
		args: { month: '' },
		call: function(req) {
			const month = req.args.month || sh_out('date +%Y-%m');
			if (!match(month, /^[0-9]{4}-[0-9]{2}$/)) return { result: false, error: 'invalid_month' };
			let rows = [], months = {}, total = 0;
			for (let l in split(readfile(`${DATA}/outages.tsv`) ?? '', '\n')) {
				const f = split(l, '\t');
				if (length(f) < 5 || !(+f[0] > 0)) continue;
				const lt = localtime(int(+f[0])), m = sprintf('%04d-%02d', lt.year, lt.mon);
				months[m] = true;
				if (m != month) continue;
				push(rows, { start: +f[0], end: +f[1], seconds: +f[2], line: f[3], reason: f[4] });
				total += +f[2];
			}
			return { month, outages: rows, count: length(rows), seconds: total, months: sort(keys(months)) };
		}
	},

	// ------------------------------------------------ network watch (B7 feature 11)
	// per WAN line: up | no_internet | no_modem | wan_down, since when; recent outages from the
	// event list (internet_down / internet_up)
	network: {
		call: function() {
			const lines = map(tsv('watch.tsv', true), f => ({
				line: f[0], state: f[1], since: +f[2], gateway: f[3] == '-' ? '' : f[3], checked: +f[4] }));
			let outages = [];
			// event line: id  time  synced  level  source  code  key=value;...
			for (let l in split(readfile('/etc/lg7200/events') ?? '', '\n')) {
				const f = split(l, '\t');
				if (length(f) < 6 || f[4] != 'homenet' || (f[5] != 'internet_down' && f[5] != 'internet_up')) continue;
				let kv = {};
				for (let p in split(f[6] ?? '', ';')) { const i = index(p, '='); if (i > 0) kv[substr(p, 0, i)] = substr(p, i + 1); }
				push(outages, { time: +f[1], kind: f[5] == 'internet_down' ? 'down' : 'up', line: kv.line ?? '',
				                reason: kv.reason ?? kv.was ?? '', seconds: kv.seconds ? +kv.seconds : null });
			}
			return { lines, events: slice(reverse(outages), 0, 50), traffic: wan_traffic(), uptime: uptime() };
		}
	},

	// ------------------------------------------------ user logins (B7.3a, section 11.2)
	users: {
		call: function() {
			let pname = {};
			for (let p in people_list()) pname[p.id] = p.name;
			return { users: map(user_rows(), u => ({ username: u.username, person: u.person, person_name: pname[u.person] ?? '' })) };
		}
	},
	// username: 3-16 of a-z 0-9 _ (starting with a letter); password: 8-64 characters;
	// person: the person whose devices this login may see
	user_add: {
		args: { username: '', password: '', person: '' },
		call: function(req) {
			const a = req.args, u = a.username ?? '', sys = 'vx_' + u;
			if (!match(u, USER_RE) || index(RESERVED, u) >= 0) return { result: false, error: 'invalid_username' };
			if (!pw_ok(a.password)) return { result: false, error: 'invalid_password' };
			if (!length(filter(people_list(), p => p.id == a.person))) return { result: false, error: 'unknown_person' };
			if (length(filter(user_rows(), x => x.username == u))) return { result: false, error: 'user_exists' };
			const c = cursor();
			let taken = false;
			c.foreach('rpcd', 'login', s => { if (s.username == u) taken = true; });
			const pw = readfile('/etc/passwd') ?? '';
			if (taken || match(pw, regexp(`(^|\n)${sys}:`))) return { result: false, error: 'user_exists' };
			let uid = 30000;
			for (let l in split(pw, '\n')) { const n = +(split(l, ':')[2] ?? 0); if (n >= uid && n < 40000) uid = n + 1; }
			if (!edit_account_file('/etc/passwd', sys, `${sys}:x:${uid}:65534:virox user:/var/empty:/bin/false`) ||
			    !edit_account_file('/etc/shadow', sys, `${sys}:*:0:0:99999:7:::`))
				return { result: false, error: 'write_failed' };
			if (!set_user_password(sys, a.password)) {
				edit_account_file('/etc/passwd', sys, null); edit_account_file('/etc/shadow', sys, null);
				return { result: false, error: 'passwd_failed' };
			}
			// uci add() does not load a config by itself (get/set/foreach do): load both first,
			// or the add fails silently (found by the VM test: the person link was never saved)
			c.load('rpcd'); c.load('homenet');
			const l = c.add('rpcd', 'login');
			c.set('rpcd', l, 'username', u);
			c.set('rpcd', l, 'password', `$p$${sys}`);
			c.set('rpcd', l, 'read', [ 'homenet-user' ]);
			c.set('rpcd', l, 'write', [ 'homenet-user' ]);
			c.commit('rpcd');
			const s = c.add('homenet', 'user');
			c.set('homenet', s, 'username', u);
			c.set('homenet', s, 'person', a.person);
			c.commit('homenet');
			return { result: true };
		}
	},
	user_password: {
		args: { username: '', password: '' },
		call: function(req) {
			const a = req.args;
			if (!length(filter(user_rows(), x => x.username == a.username))) return { result: false, error: 'unknown_user' };
			if (!pw_ok(a.password)) return { result: false, error: 'invalid_password' };
			return set_user_password('vx_' + a.username, a.password) ? { result: true } : { result: false, error: 'passwd_failed' };
		}
	},
	// the login, its system user and its open sessions end
	user_delete: {
		args: { username: '' },
		call: function(req) {
			const u = req.args.username ?? '', rows = filter(user_rows(), x => x.username == u);
			if (!length(rows)) return { result: false, error: 'unknown_user' };
			const c = cursor();
			let gone = [];
			c.foreach('rpcd', 'login', s => { if (s.username == u) push(gone, s['.name']); });
			for (let s in gone) c.delete('rpcd', s);
			c.commit('rpcd');
			for (let r in rows) c.delete('homenet', r.section);
			c.commit('homenet');
			edit_account_file('/etc/passwd', 'vx_' + u, null);
			edit_account_file('/etc/shadow', 'vx_' + u, null);
			// `session list` prints one object per session; destroy the ones of this user. In
			// the background: rpcd serves `session` itself and would deadlock waiting for it
			system(`( for s in $(ubus call session list 2>/dev/null | awk -v u=${shq(u)} '/"ubus_rpc_session"/ { gsub(/[",]/, "", $2); sid = $2 } /"username"/ { gsub(/[",]/, "", $2); if ($2 == u) print sid }'); do ubus call session destroy "{\\"ubus_rpc_session\\":\\"$s\\"}"; done ) >/dev/null 2>&1 &`);
			return { result: true };
		}
	},

	// who uses the internet now (owner 2026-11-22): bytes per second of each device at this
	// moment, biggest first (homenet/live, from the usage counters). id "ip:<addr>" = an address
	// without a device yet. seconds = the time measured over (about 1 to 20).
	live: {
		call: function() {
			let devices = [], total = { down: 0, up: 0 }, seconds = 0;
			for (let l in split(sh_out('/usr/libexec/homenet/live 2>/dev/null'), '\n')) {
				const f = split(l, ' ');
				if (f[0] == '@total') total = { down: +f[1], up: +f[2] };
				else if (f[0] == '@seconds') seconds = +f[1];
				else if (length(f) == 3 && f[0] != '') push(devices, { id: f[0], down_bps: +f[1], up_bps: +f[2] });
			}
			return { devices, down_bps: total.down, up_bps: total.up, seconds };
		}
	},

	// line quality over the last 24 hours (owner 2026-11-22), from homenet/quality: per line, in
	// buckets of `minutes` (5-240, default 30): ping average and worst (ms), jitter (ms), loss (%)
	// and how busy the line was (download / upload kbit/s); null where nothing was measured. now =
	// the last minute. down_kbit / up_kbit = the measured speed of the line, null when not measured.
	quality: {
		args: { minutes: 0 },
		call: function(req) {
			let m = int(+(req.args.minutes ?? 0)); if (!(m >= 5 && m <= 240)) m = 30;
			const c = cursor(), size = m * 60, num = x => x == '-' ? null : +x, rnd = x => int(x + 0.5);
			let per = {}, now = {};
			for (let l in split(sh_out('/usr/libexec/homenet/quality show 2>/dev/null'), '\n')) {
				const f = split(l, ' ');
				if (length(f) < 8) continue;
				const n = f[0], t = +f[1], r = { avg: num(f[2]), max: num(f[3]), jit: num(f[4]), loss: +f[5], rx: num(f[6]), tx: num(f[7]) };
				now[n] = { time: t, ping_ms: r.avg, worst_ms: r.max, jitter_ms: r.jit, loss_pct: r.loss, down_kbit: r.rx, up_kbit: r.tx };
				const k = int(t / size) * size;
				if (!per[n]) per[n] = {};
				if (!per[n][k]) per[n][k] = { t: k, n: 0, ok: 0, avg: 0, max: null, jit: 0, loss: 0, rxn: 0, rx: 0, tx: 0 };
				const b = per[n][k];
				b.n++; b.loss += r.loss;
				if (r.avg != null) { b.ok++; b.avg += r.avg; b.jit += r.jit ?? 0; if (b.max == null || r.max > b.max) b.max = r.max; }
				if (r.rx != null) { b.rxn++; b.rx += r.rx; b.tx += r.tx ?? 0; }
			}
			let lines = [];
			for (let n in sort(keys(per))) {
				// only a measured speed ("Measure and adjust"; before 2026-11-22 a value other than the
				// 30000 default): the shipped default made the page judge "house busy" on a guess
				const measured = c.get('lines', `line${n}`, 'measured') == '1' || (c.get('lines', `line${n}`, 'down_kbit') ?? '30000') != '30000';
				const sp = k => { const v = c.get('lines', `line${n}`, k); return measured && v != null && +v > 0 ? +v : null; };
				push(lines, { line: +n, now: now[n], down_kbit: sp('down_kbit'), up_kbit: sp('up_kbit'),
					buckets: map(sort(values(per[n]), (a, b) => a.t - b.t), b => ({
						time: b.t, ping_ms: b.ok ? rnd(b.avg / b.ok) : null, worst_ms: b.max, jitter_ms: b.ok ? rnd(b.jit / b.ok) : null,
						loss_pct: rnd(b.loss / b.n), down_kbit: b.rxn ? rnd(b.rx / b.rxn) : null, up_kbit: b.rxn ? rnd(b.tx / b.rxn) : null })) });
			}
			return { minutes: m, lines };
		}
	},

	// "Is it the Wi-Fi or the internet?" (owner 2026-11-22, homenet/wifitest): opens a 3-minute test
	// on this unit; the page (or the phone app) then downloads `download` and posts to `upload` and
	// times both itself. Admin and family logins.
	wifi_test: {
		call: function() {
			const f = split(sh_out('/usr/libexec/homenet/wifitest open 2>/dev/null'), ' ');
			if (f[0] != 'OK') return { result: false, error: f[1] ?? 'failed' };
			return { result: true, download: f[1], size: +f[2], upload: f[3], seconds: 180 };
		}
	},

	// night use (owner 2026-11-22, homenet/controls nightuse): the minutes a device, or all the
	// devices of a person, used the internet between 00:00 and 06:00, per hour, for the last 14
	// mornings, newest first: { days: [ { date, minutes, hours: [ { hour, minutes } ] } ] }
	night_use: {
		args: { target: '' },
		call: function(req) {
			const t = req.args.target ?? '';
			if (!match(t, /^[dp][0-9]+$/)) return { result: false, error: 'unknown_target' };
			let mine = {}; mine[t] = true;
			if (substr(t, 0, 1) == 'p') for (let f in tsv('devices.tsv', false)) if (f[2] == t) mine[f[0]] = true;
			let by = {};
			for (let l in split(readfile(`${RUN}/night.tsv`) ?? readfile(`${DATA}/night.tsv`) ?? '', '\n')) {
				const f = split(l, '\t');
				if (length(f) < 4 || !mine[f[1]]) continue;
				if (!by[f[0]]) by[f[0]] = {};
				// a person: the minutes of its devices are added, at most 60 per hour
				by[f[0]][f[2]] = min(60, (by[f[0]][f[2]] ?? 0) + +f[3]);
			}
			let days = [];
			for (let d in reverse(sort(keys(by)))) {
				let hours = [], total = 0;
				for (let h in sort(keys(by[d]), (a, b) => +a - +b)) { push(hours, { hour: +h, minutes: by[d][h] }); total += by[d][h]; }
				push(days, { date: d, minutes: total, hours });
			}
			return { target: t, days };
		}
	},

	// sites opened by kids devices (owner 2026-11-22): per device, or for a person all its
	// devices; day = YYYY-MM-DD (default today). days = the days that have rows. Only devices in
	// kids mode are logged, and only while homenet.main.kids_log is on (kids_log_set).
	kid_sites: {
		args: { target: '', day: '' },
		call: function(req) {
			const t = req.args.target ?? '', day = req.args.day || sh_out('date +%F');
			if (!match(t, /^[dp][0-9]+$/)) return { result: false, error: 'unknown_target' };
			if (!match(day, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) return { result: false, error: 'invalid_day' };
			let mine = {}; mine[t] = true;
			if (substr(t, 0, 1) == 'p') for (let f in tsv('devices.tsv', false)) if (f[2] == t) mine[f[0]] = true;
			let days = {}, by = {};
			for (let f in tsv('kidsites.tsv', true)) {
				if (!mine[f[1]]) continue;
				days[f[0]] = true;
				if (f[0] != day) continue;
				const s = by[f[2]];
				if (!s) by[f[2]] = { site: f[2], label: f[3] ?? '', first: f[4], last: f[5], count: +f[6] };
				else { if (f[4] < s.first) s.first = f[4]; if (f[5] > s.last) s.last = f[5]; s.count += +f[6]; }
			}
			return { day, days: sort(keys(days)), on: cursor().get('homenet', 'main', 'kids_log') != '0',
				sites: sort(values(by), (a, b) => a.last < b.last ? 1 : (a.last > b.last ? -1 : 0)) };
		}
	},
	kids_log_set: {
		args: { on: false },
		call: function(req) {
			const c = cursor();
			c.set('homenet', 'main', 'kids_log', req.args.on ? '1' : '0');
			c.commit('homenet');
			if (!req.args.on) system('rm -f /var/log/homenet-kids/*.log /tmp/homenet/kidsites.tsv /etc/homenet/data/kidsites.tsv');
			return plain(run_cmd(DNS_CMD, [ 'apply' ]));
		}
	},

	// ------------------------------------------------ the "user" role (B7.3a)
	// devices and usage of the person this login belongs to; nothing of anybody else
	me: {
		call: function(req) {
			if (!with_session_user(req, u => req.reply(me_reply(u))))
				return { result: false, error: 'not_a_user' };
			return req.defer();
		}
	},

	// the family login asks the admin for more time today: 30 or 60 minutes (owner 2026-11-22).
	// An event "time_request" with the person; the admin answers on Home. One per 10 minutes.
	me_ask_time: {
		args: { minutes: 0 },
		call: function(req) {
			const m = `${req.args.minutes ?? ''}`;
			if (!with_session_user(req, u => {
				const row = u ? filter(user_rows(), x => x.username == u)[0] : null;
				req.reply(row ? plain(controls_cmd('time-request', row.person, m)) : { result: false, error: 'not_a_user' });
			}))
				return { result: false, error: 'not_a_user' };
			return req.defer();
		}
	},


	// put back the previous version of the device / people / MAC records (B7.3c)
	restore_previous: { call: function() { return plain(devices_cmd('restore-previous')); } },

	// ------------------------------------------------ fixed addresses (B7.5b)
	reservations: {
		call: function() {
			return { reservations: reservations(cursor()) };
		}
	},

	reserve: {
		args: { mac: '', ip: '', name: '', replace: false },
		call: function(req) {
			const c = cursor();
			const mac = norm_mac(req.args.mac), ip = req.args.ip ?? '', name = req.args.name ?? '';
			const e = check(c, mac, ip, name, !!req.args.replace);
			if (e) return { result: false, ...e };
			// one MAC = one reservation: replace changes the section that already has it
			let sec = null;
			for (let h in reservations(c))
				if (h.mac == mac) sec = h.section;
			if (sec && length(host_macs(c.get_all('dhcp', sec))) > 1) {
				// a section with several MACs: take this MAC out, give it its own section
				c.set('dhcp', sec, 'mac', filter(host_macs(c.get_all('dhcp', sec)), x => x != mac));
				sec = null;
			}
			if (!sec) sec = c.add('dhcp', 'host');
			c.set('dhcp', sec, 'mac', mac);
			c.set('dhcp', sec, 'ip', ip);
			if (name != '') c.set('dhcp', sec, 'name', name);
			else c.delete('dhcp', sec, 'name');
			c.commit('dhcp');
			return { ...apply(), mac, ip };
		}
	},

	unreserve: {
		args: { mac: '' },
		call: function(req) {
			const c = cursor();
			const mac = norm_mac(req.args.mac);
			if (!mac) return { result: false, error: 'invalid_mac' };
			let found = false;
			for (let h in reservations(c)) {
				if (h.mac != mac) continue;
				found = true;
				const rest = filter(host_macs(c.get_all('dhcp', h.section)), x => x != mac);
				if (length(rest)) c.set('dhcp', h.section, 'mac', rest);
				else c.delete('dhcp', h.section);
			}
			if (!found) return { result: false, error: 'not_reserved' };
			c.commit('dhcp');
			return apply();
		}
	}
};

// the methods that only read; every other one changes something and clears the copy first
const HOMENET_READS = [ 'devices', 'people', 'guest', 'wifikeys', 'wifi_cards', 'controls', 'schedules', 'timelimits',
                        'settings', 'speed_limits', 'limits', 'usage', 'usage_range', 'kids', 'site_catalog', 'site_locks',
                        'filter', 'computers', 'wakes', 'outages', 'network', 'users', 'live', 'quality', 'night_use',
                        'kid_sites', 'me', 'reservations' ];
return { 'virox.homenet': clears_cache(homenet, HOMENET_READS) };
