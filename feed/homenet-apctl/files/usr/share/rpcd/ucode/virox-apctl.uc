// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, access points (BUILD-PLAN B9 Y1/Y3, docs/dualwan-spec.md section 5). Any number of
// access points: one uci section per paired unit, nothing fixed. Error codes, not sentences.
//
// On the main router (Router mode):
//   list                         paired access points: name, online, version, clients, channels  (admin)
//   pair_code                    a 6-digit code, valid 10 minutes, to pair a new access point     (admin)
//   set_ap {id, name, channel2, channel5}   name and channel override ("auto" or a channel)    (admin)
//   forget {id}                  unpair                                                          (admin)
//   update {id}                  update this access point's firmware at its next contact         (admin)
//   update_all                   update the whole house (BUILD-PLAN 15.3 item 2): this router
//                                downloads the update once and offers it on the LAN; access points
//                                one at a time, each must come back with the new version within
//                                10 minutes or the rest stop; this router last                     (admin)
//   update_status                progress of update_all: state, target version, each unit      (admin)
//   join_open {minutes}          a new access point without a cable may join for 10 minutes: an
//                                open network "Virox-Join" (isolated, only DHCP and the hello)  (admin)
//   join_close                   close it now                                                     (admin)
//   mesh_set {enabled}           the wireless link between Virox units on / off (on by default) (admin)
//   repeat {band, ssid, key}     (access point under a router that is not a Virox) repeat that
//                                router's Wi-Fi: 4-address client, relayd if it does not take it (admin)
//   repeat_off                                                                                     (admin)
//   scan                         the Wi-Fi networks in reach (for repeat)                         (admin)
//   addresses                    the two address ranges (Virox units, devices), the router address
//                                and the fixed address of each access point (BUILD-PLAN 15.9 item 4)(admin)
//   addresses_set {units_start, units_end, dev_start, dev_end}   last numbers of the LAN addresses;
//                                clashes refused (ranges overlap, the router address, a device's fixed
//                                address in the units range, an access point outside it)   (admin)
//   restart_aps                  after a scheduled restart of this router (lg7200 schedule): the
//                                access points restart one at a time, each must come back within
//                                10 minutes or the rest stop                                      (admin)
//   settings {roaming}           fast roaming (802.11r/k/v) on every Virox network               (admin)
//   pair {code, mac, model, version}       an access point pairs (anonymous; the code is the proof)
//   hello {mac, model, version, nonce}     an access point not joined yet announces itself every
//                                minute (anonymous); listed in "list" as found; once approved, its
//                                next hello with the same nonce gets id and token (owner 2026-11-19:
//                                no code typed on a new unit whose Wi-Fi password nobody knows)
//   approve {mac}                add an access point found on the LAN                            (admin)
//   sync {id, token, version, uptime, ip, clients}   an access point reports and gets its settings
//                                (Wi-Fi, guest network, channels, update)
//                                (anonymous; the token of the pairing is the proof)
//   peer                         who this unit is: MAC, mode, gateway kind, lead, joined (anonymous)
// On an access point (Access point mode). Under a router that is not a Virox the access points
// choose a lead (lowest MAC); the lead answers the main router's calls above for the others:
//   join {code}                  pair this unit with the main router (the gateway of the LAN)    (admin)
//   agent_status                 paired or not, main router, last contact                        (admin)

'use strict';

import { readfile, writefile, mkdir, popen, unlink, open, rename, stat } from 'fs';
import { cursor } from 'uci';

const RUN = '/tmp/homenet/apctl';
const CLIENTS = '/tmp/homenet/ap-clients.tsv';     // mac ap_id signal band epoch
const AGENT = '/usr/libexec/homenet/apctl';

function sh(cmd) { const fd = popen(cmd); if (!fd) return ''; const o = fd.read('all'); fd.close(); return trim(o ?? ''); }
function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }
function rnd(n) { return hexenc(readfile('/dev/urandom', n) ?? ''); }
function mode() { return cursor().get('lg7200', 'state', 'mode') ?? 'router'; }
// Access points under a router that is not a Virox (owner 2026-11-20: "one collects the others"):
// they find each other on the LAN and the one with the lowest MAC leads; the lead is the main
// router for the others (pairing, Wi-Fi settings, their devices and usage). Decided by the agent
// (apctl hello) and kept in RAM: RUN/role = lead | member.
function lead() { return mode() == 'ap' && trim(readfile(`${RUN}/role`) ?? '') == 'lead'; }
function is_main() { return mode() == 'router' || lead(); }
function my_version() {
	const m = match(readfile('/etc/openwrt_release') ?? '', /DISTRIB_RELEASE='([^']*)'/);
	return m ? m[1] : '';
}
function aps() {
	const out = [];
	cursor().foreach('apctl', 'ap', s => { push(out, s); });
	return sort(out, (a, b) => (+substr(a['.name'], 2)) - (+substr(b['.name'], 2)));
}
function status_of(id) { return json(readfile(`${RUN}/${id}.json`) ?? 'null'); }
// same length, every character compared
function same(a, b) {
	if (type(a) != 'string' || type(b) != 'string' || length(a) != length(b) || !length(a)) return false;
	let d = 0;
	for (let i = 0; i < length(a); i++) d |= ord(a, i) ^ ord(b, i);
	return d == 0;
}

// channel plan for any number of units (section 13 item 9): 2.4 GHz rotates 6 / 11 / 1 (the main
// router keeps its automatic choice among 1 / 6 / 11); 5 GHz alternates the two 80 MHz blocks
// (the main router is on 36-48, so the first access point gets 52-64), and with more than two
// units on the network every unit gets a 40 MHz pair (36/40, 44/48, 52/56, 60/64). The owner may
// fix a channel per unit. Access points apply channel changes at night (03:00-03:59) only, except
// the first time. Transmit power (item 4): the owner's level per unit until measurements on the
// hardware allow automatic lowering.
const CH2 = [ 6, 11, 1 ], CH5_80 = [ 52, 36 ], CH5_40 = [ 44, 52, 60, 36 ];
// the wireless link (15.4 item 1): every unit on the main router's 5 GHz channel
function mesh_on(c) { return c.get('apctl', 'main', 'mesh') != '0' && !!c.get('apctl', 'main', 'mesh_id'); }
function main_channel() {
	const f = split(sh('. /usr/lib/homenet/apctl-mesh.sh; main_channel 2>/dev/null'), ' ');
	return length(f) == 2 && +f[0] >= 36 ? { ch: +f[0], ht: f[1] } : null;
}
function mesh_config(c) {
	if (!mesh_on(c)) return null;
	const mc = main_channel();
	return { id: c.get('apctl', 'main', 'mesh_id'), key: c.get('apctl', 'main', 'mesh_key'), channel: mc ? mc.ch : null, htmode: mc ? mc.ht : null };
}
function uplink_of(st) {
	const f = split(`${st.uplink ?? ''}`, ' ');
	if (!(f[0] in [ 'cable', 'wireless', 'repeat', 'none' ])) return { kind: null };
	const sig = length(f) > 1 ? +f[1] : null;
	return { kind: f[0], signal: sig, label: sig == null ? null : (sig >= -65 ? 'excellent' : (sig >= -75 ? 'good' : 'weak')) };
}
// transmit power of one access point: auto and high = the most the rules in force allow (20 dBm
// on 2.4 GHz under the Egyptian rules, 25 with the stronger signal of the Wi-Fi page); a fixed 20
// for high would have held an access point below the main router there (owner 2026-11-20)
const POWER = { auto: null, high: null, medium: 17, low: 14 };
function channels(list, s) {
	let i = 0;
	for (let a in list) { if (a['.name'] == s['.name']) break; i++; }
	const narrow = length(list) + 1 > 2;
	const ch5 = narrow ? CH5_40 : CH5_80;
	// the mesh needs one 5 GHz channel for every unit: the main router's
	const mc = mesh_on(cursor()) ? main_channel() : null;
	return {
		ch2: (s.channel2 && s.channel2 != 'auto') ? +s.channel2 : CH2[i % length(CH2)],
		ch5: mc ? mc.ch : ((s.channel5 && s.channel5 != 'auto') ? +s.channel5 : ch5[i % length(ch5)]),
		ht5: mc ? mc.ht : (narrow ? 'VHT40' : 'VHT80'),
		power: POWER[s.power ?? 'auto'] ?? null
	};
}

// the Wi-Fi settings every access point copies from the main router (home networks only)
function wifi_config(c) {
	let base = null, b5 = null, key = null, enc = null;
	c.foreach('wireless', 'wifi-iface', v => {
		if (v.mode != 'ap' || v.network == 'guest') return;
		const band = c.get('wireless', v.device, 'band');
		if (band == '5g') { if (b5 == null) b5 = v.ssid; }
		else if (base == null) { base = v.ssid; key = v.key; enc = c.get('homenet', 'main', `enc_${v['.name']}`) ?? v.encryption; }
	});
	if (base == null) { base = b5; }
	const keys = [];
	c.foreach('homenet', 'wifikey', s => { if (s.person && s.key) push(keys, { person: s.person, key: s.key }); });
	let mdid = 0;
	for (let i = 0; i < length(base ?? ''); i++) mdid = (mdid * 31 + ord(base, i)) % 65536;
	return {
		ssid: base ?? '', ssid5: b5 ?? base ?? '', key: key ?? '', encryption: enc ?? 'sae-mixed', keys: keys, hidden_2g: c.get('lg7200', 'wifi', 'hidden_2g') == '1', hidden_5g: c.get('lg7200', 'wifi', 'hidden_5g') == '1',
		roaming: c.get('apctl', 'main', 'roaming') == '1', mobility_domain: sprintf('%04x', mdid),
		power_high: true	// always: old access points (rc2) still read it (owner 2026-11-22)
	};
}

// ------------------------------------------------------------------ schedules (15.4 items 3-4)
// the Wi-Fi and light schedules every access point copies (its own tick switches them)
function sched_config(c) {
	const w = [];
	c.foreach('lg7200', 'wifisched', s => {
		push(w, { target: s.target ?? '', days: s.days ?? '', off: s.off ?? '', on: s.on ?? '', enabled: s.enabled != '0' });
	});
	return { wifi: w, leds: { mode: c.get('lg7200', 'leds', 'mode') ?? 'on', off: c.get('lg7200', 'leds', 'off') ?? '', on: c.get('lg7200', 'leds', 'on') ?? '' } };
}
// after a scheduled restart of this router: the access points one at a time (RUN/restart.json:
// { state: running | done | failed, current, current_started, done, skipped, failed })
const RST = `${RUN}/restart.json`;
function rst_tick(c) {
	let r = json(readfile(RST) ?? 'null');
	if (!r || r.state != 'running') return r;
	const now = time();
	if (r.current) {
		const st = status_of(r.current) ?? {};
		// back: it reported after it was asked, with an uptime shorter than the time since then
		if ((st.seen ?? 0) > r.current_started + 30 && (st.uptime ?? 999999999) < now - r.current_started) {
			push(r.done, r.current); r.current = null;
		} else if (now - r.current_started > 600) {
			r.state = 'failed'; r.failed = r.current; r.current = null;
			sh(`/usr/libexec/homenet/apctl event restart_aps_failed ${shq(r.failed)} >/dev/null 2>&1`);
			writefile(RST, sprintf('%J', r)); return r;
		} else { writefile(RST, sprintf('%J', r)); return r; }
	}
	for (let a in aps()) {
		const id = a['.name'];
		if (id in r.done || id in r.skipped) continue;
		if (now - ((status_of(id) ?? {}).seen ?? 0) >= 300) { push(r.skipped, id); continue; }
		r.current = id; r.current_started = now;
		writefile(RST, sprintf('%J', r)); return r;
	}
	r.state = 'done';
	writefile(RST, sprintf('%J', r));
	return r;
}

// ------------------------------------------------------------------ update all (15.3 item 2)
// State in RAM (RUN/rolling.json): { state: preparing | updating | main | done | failed | error,
// target, started, current, current_started, done: [ids], skipped: [ids], failed, error }.
// preparing: `apctl update-prepare` checks, downloads and offers the update here (lg7200-update
// serve) and writes RUN/update-prep "ok <version>" or "err <code>". updating: one access point at a
// time gets install + install_url (this router) in its sync answer; it is done when it reports the
// target version; no report with it within 10 minutes = failed, the rest stop and the page names
// it. An access point offline when its turn comes is skipped (listed). main: the access points are
// done, this router installs last (or done when it is on the target version already).
const ROLL = `${RUN}/rolling.json`, ROLL_WAIT = 600;
function roll_read() { return json(readfile(ROLL) ?? 'null'); }
function roll_write(r) { mkdir('/tmp/homenet'); mkdir(RUN); writefile(ROLL, sprintf('%J', r)); }
function lan_ip() {
	const dev = cursor().get('network', 'lan', 'device') ?? 'br-lan';
	const m = match(sh(`ip -4 -o addr show dev ${shq(dev)} 2>/dev/null`), /inet ([0-9.]+)\//);
	return m ? m[1] : null;
}
function roll_event(code, id) { sh(`/usr/libexec/homenet/apctl event ${shq(code)} ${shq(id ?? '')} >/dev/null 2>&1`); }
function roll_tick(c) {
	let r = roll_read();
	if (!r || !(r.state in [ 'preparing', 'updating' ])) return r;
	const now = time();
	if (r.state == 'preparing') {
		const p = split(trim(readfile(`${RUN}/update-prep`) ?? ''), ' ');
		if (p[0] == '') {
			if (now - (r.started ?? now) > 1800) { r.state = 'error'; r.error = 'prepare_timeout'; }
			roll_write(r); return r;
		}
		unlink(`${RUN}/update-prep`);
		if (p[0] != 'ok' || !p[1]) { r.state = 'error'; r.error = p[1] ?? 'failed'; roll_write(r); return r; }
		r.state = 'updating'; r.target = p[1];
	}
	if (r.current) {
		const st = status_of(r.current) ?? {};
		if (st.version == r.target && (st.seen ?? 0) >= (r.current_started ?? 0)) {
			push(r.done, r.current);
			if (c.get('apctl', r.current) != null) { c.set('apctl', r.current, 'update', '0'); c.commit('apctl'); }
			r.current = null;
		} else if (now - (r.current_started ?? now) > ROLL_WAIT) {
			// it did not come back: stop here, the house keeps working on the old version
			r.state = 'failed'; r.failed = r.current;
			if (c.get('apctl', r.current) != null) { c.set('apctl', r.current, 'update', '0'); c.commit('apctl'); }
			r.current = null;
			sh('/usr/sbin/lg7200-update unserve >/dev/null 2>&1');
			roll_event('update_all_failed', r.failed);
			roll_write(r); return r;
		} else { roll_write(r); return r; }
	}
	// the next access point: online, not on the target version yet
	for (let a in aps()) {
		const id = a['.name'];
		if (id in r.done || id in r.skipped) continue;
		const st = status_of(id) ?? {};
		if (st.version == r.target) { push(r.done, id); continue; }
		if (now - (st.seen ?? 0) >= 300) { push(r.skipped, id); continue; }
		c.set('apctl', id, 'update', '1'); c.commit('apctl');
		r.current = id; r.current_started = now;
		roll_write(r); return r;
	}
	// every access point is done: this router last
	sh('/usr/sbin/lg7200-update unserve >/dev/null 2>&1');
	if (my_version() != r.target) {
		r.state = 'main';
		sh('(sleep 5; /usr/sbin/lg7200-update install) >/dev/null 2>&1 &');
	} else r.state = 'done';
	roll_event(length(r.skipped) ? 'update_all_skipped' : 'update_all_done', join(' ', r.skipped));
	roll_write(r);
	return r;
}

// ------------------------------------------------------------------ addresses (15.9 item 4)
// Two ranges of the LAN (last number of the address, the router itself is .1): Virox units
// (default 2-49) and devices (the DHCP pool, default 100-249). Every approved access point gets
// the lowest free address of the units range as a fixed address (dhcp host "vxap_<id>"), by itself;
// it is freed when the unit is forgotten. Main router in router mode only (under a router that is
// not a Virox the access points take what that router gives).
function ranges(c) {
	return { us: +(c.get('lg7200', 'addr', 'units_start') ?? 2), ue: +(c.get('lg7200', 'addr', 'units_end') ?? 49),
	         ds: +(c.get('dhcp', 'lan', 'start') ?? 100), de: +(c.get('dhcp', 'lan', 'start') ?? 100) + +(c.get('dhcp', 'lan', 'limit') ?? 150) - 1 };
}
function lan_base(c) {
	let a = c.get('network', 'lan', 'ipaddr'); if (type(a) == 'array') a = a[0];
	const m = match(split(a ?? '', '/')[0], /^([0-9]+\.[0-9]+\.[0-9]+)\.([0-9]+)$/);
	return m ? { net: m[1], host: +m[2] } : null;
}
function hosts(c) {
	const out = [];
	c.foreach('dhcp', 'host', s => {
		let m = s.mac; if (type(m) != 'array') m = split(m ?? '', /\s+/);
		push(out, { sec: s['.name'], ip: s.ip ?? '', macs: map(filter(m, x => x), lc), ap: s.vxap ?? null });
	});
	return out;
}
function last_of(ip, base) {
	const m = match(ip ?? '', /^([0-9]+\.[0-9]+\.[0-9]+)\.([0-9]+)$/);
	return (m && base && m[1] == base.net) ? +m[2] : null;
}
function dhcp_apply() { sh('/usr/libexec/lg7200/dhcp-guard apply >/dev/null 2>&1 &'); }
// the fixed address of an access point: kept when it has one in the units range, moved into it
// when it has one elsewhere (reported), made when it has none; null + error when the range is full
function ap_address(c, id, mac) {
	if (mode() != 'router') return { ip: null };
	const b = lan_base(c); if (!b) return { ip: null };
	const r = ranges(c), hs = hosts(c);
	let mine = null;
	for (let h in hs) if (mac in h.macs) mine = h;
	if (mine) {
		const n = last_of(mine.ip, b);
		if (n != null && n >= r.us && n <= r.ue) { c.set('dhcp', mine.sec, 'vxap', id); c.commit('dhcp'); return { ip: mine.ip }; }
	}
	const used = {};
	for (let h in hs) { const n = last_of(h.ip, b); if (n != null && (!mine || h.sec != mine.sec)) used[n] = true; }
	used[b.host] = true;
	let free = null;
	for (let n = r.us; n <= r.ue && free == null; n++) if (!used[n]) free = n;
	if (free == null) return { ip: null, error: 'units_full' };
	const ip = `${b.net}.${free}`;
	let sec = mine ? mine.sec : null, moved = mine ? mine.ip : null;
	if (!sec) { sec = `vxap_${id}`; c.set('dhcp', sec, 'host'); c.set('dhcp', sec, 'mac', mac); }
	c.set('dhcp', sec, 'ip', ip); c.set('dhcp', sec, 'name', `virox-${id}`); c.set('dhcp', sec, 'vxap', id);
	c.commit('dhcp');
	dhcp_apply();
	if (moved) sh(`/usr/libexec/homenet/apctl event ap_address_moved ${shq(id)} >/dev/null 2>&1`);
	return { ip, moved };
}
function ap_address_free(c, id) {
	let n = 0;
	c.foreach('dhcp', 'host', s => { if (s.vxap == id) { c.delete('dhcp', s['.name']); n++; } });
	if (n) { c.commit('dhcp'); dhcp_apply(); }
}

// creates (or reuses, for a unit that joins again) the section of an access point; id and token
// (its fixed address from the units range, 15.9 item 4; units_full when there is none left)
function add_ap(mac, model) {
	const c = cursor();
	let id = null;
	c.foreach('apctl', 'ap', s => { if (s.mac == mac) id = s['.name']; });
	if (!id && mode() == 'router') {
		// is there an address for a new unit? (nothing is written before it is sure)
		const b = lan_base(c), r = ranges(c), used = {};
		if (b) {
			let has = false;
			for (let h in hosts(c)) { const n = last_of(h.ip, b); if (n != null) used[n] = true; if (mac in h.macs && n != null && n >= r.us && n <= r.ue) has = true; }
			used[b.host] = true;
			let free = has;
			for (let n = r.us; n <= r.ue && !free; n++) if (!used[n]) free = true;
			if (!free) return { error: 'units_full' };
		}
	}
	if (!id) {
		let n = +(c.get('apctl', 'main', 'next') ?? 1);
		id = `ap${n}`;
		c.set('apctl', 'main', 'next', `${n + 1}`);
		c.set('apctl', id, 'ap');
		c.set('apctl', id, 'name', sprintf('%s %d', 'AP', n));
	}
	const token = rnd(16);
	c.set('apctl', id, 'mac', mac);
	c.set('apctl', id, 'model', substr(`${model ?? ''}`, 0, 40));
	c.set('apctl', id, 'token', token);
	c.commit('apctl');
	const ad = ap_address(cursor(), id, mac);
	sh(`/usr/libexec/homenet/apctl event ap_paired ${shq(id)} >/dev/null 2>&1`);
	return { id, token, ip: ad.ip };
}
// access points that said hello in the last 5 minutes and are not joined: mac -> { model, version, nonce, seen, ok }
const FOUND = `${RUN}/found.json`;
function found_read() {
	const f = json(readfile(FOUND) ?? '{}') ?? {}, now = time(), out = {};
	for (let m in f) if (now - (f[m].seen ?? 0) < 300 || f[m].ok) out[m] = f[m];
	return out;
}
function found_write(f) { mkdir('/tmp/homenet'); mkdir(RUN); writefile(FOUND, sprintf('%J', f)); }

const apctl = {
	list: {
		call: function() {
			roll_tick(cursor()); rst_tick(cursor());
			const now = time(), list = aps(), out = [];
			for (let a in list) {
				const st = status_of(a['.name']) ?? {};
				push(out, {
					id: a['.name'], name: a.name ?? '', mac: a.mac ?? '', model: a.model ?? '',
					online: (now - (st.seen ?? 0)) < 180, seen: st.seen ?? null, version: st.version ?? '',
					uptime: st.uptime ?? null, clients: length(st.clients ?? []),
					channels: channels(list, a), channel2: a.channel2 ?? 'auto', channel5: a.channel5 ?? 'auto', power: a.power ?? 'auto',
					updating: a.update == '1', uplink: uplink_of(st)
				});
			}
			const f = found_read(), found = [];
			for (let m in f) if (!f[m].ok) push(found, { mac: m, model: f[m].model ?? '', version: f[m].version ?? '', seen: f[m].seen });
			// on an access point: joined or not, and whether the gateway answered as a Virox main
			// router ('virox' / 'other'; null before the first try, a minute after start)
			const c = cursor(), kind = trim(readfile(`${RUN}/main-kind`) ?? '');
			// a lead access point shows the main router's page (mode "router"), with lead: true
			const ju = +(c.get('apctl', 'main', 'join_until') ?? 0);
			const rp = c.get('apctl', 'repeat') ? { ssid: c.get('wireless', 'vx_repeat', 'ssid') ?? '', mode: c.get('apctl', 'repeat', 'mode') ?? '' } : null;
			return { mode: lead() ? 'router' : mode(), lead: lead(), version: my_version(), roaming: c.get('apctl', 'main', 'roaming') == '1', aps: out, found: found,
			         mesh: c.get('apctl', 'main', 'mesh') != '0', join_until: ju > time() ? ju : null, repeat: rp,
			         uplink: mode() == 'ap' ? uplink_of({ uplink: sh('/usr/libexec/homenet/apctl uplink 2>/dev/null') }) : null,
			         paired: !!c.get('apctl', 'agent', 'token'), via: c.get('apctl', 'agent', 'via') ?? null,
			         main_ip: c.get('apctl', 'agent', 'main') ?? null, role: trim(readfile(`${RUN}/role`) ?? '') || null,
			         lead_ip: trim(readfile(`${RUN}/lead-ip`) ?? '') || null, main_kind: (kind in [ 'virox', 'other' ]) ? kind : null };
		}
	},

	// who is this unit, for access points looking for each other under a router that is not a
	// Virox (anonymous, read-only: the LAN MAC, the mode, what its gateway is, whether it leads or
	// is joined already)
	peer: {
		call: function() {
			const c = cursor(), dev = c.get('network', 'lan', 'device') ?? 'br-lan';
			const kind = trim(readfile(`${RUN}/main-kind`) ?? '');
			return { result: true, mac: lc(trim(readfile(`/sys/class/net/${dev}/address`) ?? '')), mode: mode(),
			         main_kind: (kind in [ 'virox', 'other' ]) ? kind : null, lead: lead(),
			         paired: !!c.get('apctl', 'agent', 'token'), version: my_version() };
		}
	},

	pair_code: {
		call: function() {
			if (!is_main()) return { result: false, error: 'not_main' };
			mkdir('/tmp/homenet'); mkdir(RUN);
			const b = readfile('/dev/urandom', 4) ?? '\0\0\0\0';
			const code = sprintf('%06d', ((ord(b, 0) << 16) | (ord(b, 1) << 8) | ord(b, 2)) % 1000000);
			writefile(`${RUN}/code`, sprintf('%s %d 0\n', code, time() + 600));
			return { result: true, code: code, minutes: 10 };
		}
	},

	pair: {
		args: { code: '', mac: '', model: '', version: '' },
		call: function(req) {
			if (!is_main()) return { result: false, error: 'not_main' };
			const f = split(trim(readfile(`${RUN}/code`) ?? ''), ' ');
			if (length(f) != 3 || +f[1] < time()) return { result: false, error: 'no_code' };
			if (!same(`${req.args.code}`, f[0])) {
				// five wrong tries end the code
				if (+f[2] >= 4) unlink(`${RUN}/code`);
				else writefile(`${RUN}/code`, sprintf('%s %s %d\n', f[0], f[1], +f[2] + 1));
				return { result: false, error: 'wrong_code' };
			}
			unlink(`${RUN}/code`);
			const mac = lc(req.args.mac ?? '');
			if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) return { result: false, error: 'invalid_mac' };
			const r = add_ap(mac, req.args.model);
			if (r.error) return { result: false, error: r.error };
			return { result: true, id: r.id, token: r.token };
		}
	},

	hello: {
		args: { mac: '', model: '', version: '', nonce: '' },
		call: function(req) {
			if (!is_main()) return { result: false, error: 'not_main' };
			const mac = lc(req.args.mac ?? ''), nonce = `${req.args.nonce ?? ''}`;
			if (!match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)) return { result: false, error: 'invalid_mac' };
			if (!match(nonce, /^[0-9a-zA-Z]{16,64}$/)) return { result: false, error: 'invalid_nonce' };
			const f = found_read();
			const e = f[mac];
			// approved: the answer goes to the unit that announced itself (the same nonce), once
			if (e && e.ok && same(nonce, e.nonce)) {
				delete f[mac]; found_write(f);
				return { result: true, id: e.id, token: e.token };
			}
			// approved for the unit that announced itself: another nonce changes nothing
			if (e && e.ok) return { result: false, error: 'waiting' };
			if (length(f) >= 32 && !e) return { result: false, error: 'busy' };
			f[mac] = { model: substr(`${req.args.model ?? ''}`, 0, 40), version: substr(`${req.args.version ?? ''}`, 0, 32), nonce: nonce, seen: time() };
			found_write(f);
			return { result: false, error: 'waiting' };
		}
	},

	approve: {
		args: { mac: '' },
		call: function(req) {
			if (!is_main()) return { result: false, error: 'not_main' };
			const mac = lc(req.args.mac ?? ''), f = found_read();
			if (!f[mac] || f[mac].ok) return { result: false, error: 'not_found' };
			const r = add_ap(mac, f[mac].model);
			if (r.error) return { result: false, error: r.error };
			f[mac].ok = true; f[mac].id = r.id; f[mac].token = r.token;
			found_write(f);
			return { result: true, id: r.id };
		}
	},

	sync: {
		args: { id: '', token: '', version: '', uptime: 0, ip: '', clients: [], usage: [], uplink: '' },
		call: function(req) {
			const c = cursor(), a = req.args;
			if (!match(a.id ?? '', /^ap[0-9]+$/)) return { result: false, error: 'unknown_ap' };
			if (!same(a.token, c.get('apctl', a.id, 'token'))) return { result: false, error: 'unknown_ap' };
			mkdir('/tmp/homenet'); mkdir(RUN);
			const now = time();
			const cl = filter(type(a.clients) == 'array' ? a.clients : [], x => type(x) == 'object' && match(lc(x.mac ?? ''), /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/));
			const prev = status_of(a.id) ?? {};
			const ip = match(a.ip ?? '', /^([0-9]{1,3}\.){3}[0-9]{1,3}$/) ? a.ip : null;
			const ul = match(`${a.uplink ?? ''}`, /^(cable|none|(wireless|repeat) -?[0-9]{1,3})$/) ? a.uplink : '';
			writefile(`${RUN}/${a.id}.json`, sprintf('%J', { seen: now, version: substr(`${a.version ?? ''}`, 0, 40), uptime: +a.uptime, ip: ip, clients: cl, uplink: ul }));
			// Y3: which access point each device is on (the other access points' rows are kept)
			let rows = filter(split(readfile(CLIENTS) ?? '', '\n'), l => l != '' && split(l, '\t')[1] != a.id);
			for (let x in cl)
				push(rows, join('\t', [ lc(x.mac), a.id, `${+x.signal}`, x.band == '5g' ? '5g' : '2g', `${now}` ]));
			writefile(CLIENTS, join('\n', rows) + '\n');
			// a lead (no Virox main router): the member's own counting of its devices, booked here
			// (apctl usage-import: the growth since its last report, on the device with that MAC)
			if (lead() && type(a.usage) == 'array') {
				let us = [];
				for (let x in a.usage) {
					if (type(x) != 'object' || length(us) >= 300) continue;
					const mac = lc(x.mac ?? ''), up = `${x.up ?? ''}`, down = `${x.down ?? ''}`;
					if (!match(x.day ?? '', /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) || !match(mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/) ||
					    !match(up, /^[0-9]{1,15}$/) || !match(down, /^[0-9]{1,15}$/)) continue;
					push(us, join('\t', [ x.day, mac, up, down, substr(replace(`${x.name ?? ''}`, /[\t\n\r"\\]/g, ' '), 0, 40) ]));
				}
				writefile(`${RUN}/usage-${a.id}.tsv`, length(us) ? join('\n', us) + '\n' : '');
				sh(`${AGENT} usage-import ${shq(a.id)} >/dev/null 2>&1 &`);
			}
			// R5 layer 3 on an access point: the person whose password a device used
			for (let x in cl)
				if (match(x.keyid ?? '', /^p[0-9]+$/)) sh(`/usr/libexec/homenet/apctl keyid ${shq(lc(x.mac))} ${shq(x.keyid)} >/dev/null 2>&1`);
			// a finished update of this one unit (not part of update all): the version changed
			const roll = roll_tick(c);
			const in_roll = roll && roll.state == 'updating' && roll.current == a.id;
			if (!in_roll && c.get('apctl', a.id, 'update') == '1' && prev.version && prev.version != a.version) {
				c.set('apctl', a.id, 'update', '0'); c.commit('apctl');
			}
			const list = aps(), me = filter(list, x => x['.name'] == a.id)[0];
			// Y2 on access points: the same guest network, carried to this router's guest bridge
			const guest = c.get('homenet', 'guest', 'enabled') == '1'
				? { enabled: true, ssid: c.get('homenet', 'guest', 'ssid') ?? '', key: c.get('homenet', 'guest', 'key') ?? '', band: c.get('homenet', 'guest', 'band') ?? '2g', hidden: c.get('homenet', 'guest', 'hidden') == '1', vni: 7373 } : { enabled: false };
			const rst = rst_tick(c);
			const ans = { result: true, wifi: wifi_config(c), guest: guest, channels: channels(list, me), install: me.update == '1',
			              schedule: sched_config(c), restart: !!(rst && rst.state == 'running' && rst.current == a.id),
			              mesh: mesh_config(c) };
			// update all: from this router (one download for the house); the unit still checks the
			// signature and the sha256 with its own keys
			if (in_roll && lan_ip()) ans.install_url = `http://${lan_ip()}/virox-update`;
			return ans;
		}
	},

	set_ap: {
		args: { id: '', name: '', channel2: '', channel5: '', power: '' },
		call: function(req) {
			const c = cursor(), a = req.args;
			if (!match(a.id ?? '', /^ap[0-9]+$/) || c.get('apctl', a.id) == null) return { result: false, error: 'unknown_ap' };
			if (a.name) {
				if (length(a.name) > 32 || match(a.name, /[\t\n]/)) return { result: false, error: 'invalid_name' };
				c.set('apctl', a.id, 'name', a.name);
			}
			for (let k in [ [ 'channel2', [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 ] ], [ 'channel5', [ 36, 40, 44, 48, 52, 56, 60, 64 ] ] ]) {
				// 5 GHz: the Egyptian channels only (36-64), also with the stronger 2.4 GHz switch (15.2)
				const v = a[k[0]];
				if (v == null || v == '') continue;
				if (v != 'auto' && !(+v in k[1])) return { result: false, error: 'invalid_channel' };
				c.set('apctl', a.id, k[0], `${v}`);
			}
			if (a.power) {
				if (!(a.power in keys(POWER))) return { result: false, error: 'invalid_power' };
				c.set('apctl', a.id, 'power', a.power);
			}
			c.commit('apctl');
			return { result: true };
		}
	},

	forget: {
		args: { id: '' },
		call: function(req) {
			const c = cursor();
			if (!match(req.args.id ?? '', /^ap[0-9]+$/) || c.get('apctl', req.args.id) == null) return { result: false, error: 'unknown_ap' };
			c.delete('apctl', req.args.id); c.commit('apctl');
			unlink(`${RUN}/${req.args.id}.json`);
			// its fixed address goes back to the units range (15.9 item 4)
			ap_address_free(cursor(), req.args.id);
			return { result: true };
		}
	},

	addresses: {
		call: function() {
			const c = cursor(), b = lan_base(c), r = ranges(c), aps_ip = [];
			for (let h in hosts(c)) if (h.ap) push(aps_ip, { id: h.ap, name: c.get('apctl', h.ap, 'name') ?? h.ap, ip: h.ip });
			return { router: mode() == 'router', net: b ? b.net : null, router_ip: b ? `${b.net}.${b.host}` : null,
			         units_start: r.us, units_end: r.ue, dev_start: r.ds, dev_end: r.de, aps: aps_ip };
		}
	},

	addresses_set: {
		args: { units_start: 0, units_end: 0, dev_start: 0, dev_end: 0 },
		call: function(req) {
			const a = req.args, c = cursor(), b = lan_base(c);
			if (mode() != 'router') return { result: false, error: 'not_router' };
			if (!b) return { result: false, error: 'no_lan' };
			const us = +a.units_start, ue = +a.units_end, ds = +a.dev_start, de = +a.dev_end;
			for (let v in [ us, ue, ds, de ]) if (type(v) != 'int' || v < 2 || v > 254) return { result: false, error: 'invalid_range' };
			if (us > ue || ds > de) return { result: false, error: 'invalid_range' };
			if (!(ue < ds || de < us)) return { result: false, error: 'range_overlap' };
			if ((b.host >= us && b.host <= ue) || (b.host >= ds && b.host <= de)) return { result: false, error: 'range_router' };
			if (de - ds + 1 < 10) return { result: false, error: 'range_small' };
			for (let h in hosts(c)) {
				const n = last_of(h.ip, b);
				if (n == null) continue;
				if (h.ap && (n < us || n > ue)) return { result: false, error: 'range_ap_outside', ip: h.ip };
				if (!h.ap && n >= us && n <= ue) return { result: false, error: 'range_reserved', ip: h.ip };
			}
			if (c.get('lg7200', 'addr') == null) c.set('lg7200', 'addr', 'addr');
			c.set('lg7200', 'addr', 'units_start', `${us}`); c.set('lg7200', 'addr', 'units_end', `${ue}`);
			c.commit('lg7200');
			c.set('dhcp', 'lan', 'start', `${ds}`); c.set('dhcp', 'lan', 'limit', `${de - ds + 1}`);
			c.commit('dhcp');
			const rc = system('/usr/libexec/lg7200/dhcp-guard apply >/dev/null 2>&1');
			if (rc == 2) return { result: false, error: 'dhcp_restored' };
			return { result: true };
		}
	},

	update: {
		args: { id: '' },
		call: function(req) {
			const c = cursor();
			if (!match(req.args.id ?? '', /^ap[0-9]+$/) || c.get('apctl', req.args.id) == null) return { result: false, error: 'unknown_ap' };
			c.set('apctl', req.args.id, 'update', '1'); c.commit('apctl');
			return { result: true };
		}
	},

	update_all: {
		call: function() {
			if (!is_main()) return { result: false, error: 'not_main' };
			const r = roll_read();
			if (r && r.state in [ 'preparing', 'updating', 'main' ] && (r.state != 'main' || time() - (r.started ?? 0) < 3600))
				return { result: false, error: 'busy' };
			unlink(`${RUN}/update-prep`);
			roll_write({ state: 'preparing', started: time(), target: null, current: null, done: [], skipped: [], failed: null, error: null });
			sh(`${AGENT} update-prepare >/dev/null 2>&1 &`);
			return { result: true };
		}
	},

	join_open: {
		args: { minutes: 10 },
		call: function(req) {
			if (!is_main()) return { result: false, error: 'not_main' };
			const c = cursor(), m = +(req.args.minutes ?? 10);
			if (m < 1 || m > 30) return { result: false, error: 'invalid_minutes' };
			c.set('apctl', 'main', 'join_until', `${time() + m * 60}`);
			c.set('apctl', 'main', 'mesh', '1');
			c.commit('apctl');
			sh(`${AGENT} mesh >/dev/null 2>&1 &`);
			return { result: true, until: time() + m * 60 };
		}
	},

	join_close: {
		call: function() {
			const c = cursor();
			c.delete('apctl', 'main', 'join_until'); c.commit('apctl');
			sh(`${AGENT} mesh >/dev/null 2>&1 &`);
			return { result: true };
		}
	},

	mesh_set: {
		args: { enabled: true },
		call: function(req) {
			if (!is_main()) return { result: false, error: 'not_main' };
			const c = cursor();
			c.set('apctl', 'main', 'mesh', req.args.enabled ? '1' : '0'); c.commit('apctl');
			sh(`${AGENT} mesh >/dev/null 2>&1 &`);
			return { result: true };
		}
	},

	repeat: {
		args: { band: '', ssid: '', key: '' },
		call: function(req) {
			const a = req.args;
			if (mode() != 'ap') return { result: false, error: 'not_ap' };
			if (!(a.band in [ '2g', '5g' ])) return { result: false, error: 'invalid_band' };
			if (!length(a.ssid ?? '') || length(a.ssid) > 32) return { result: false, error: 'invalid_ssid' };
			const k = `${a.key ?? ''}`;
			if (k != '' && (length(k) < 8 || length(k) > 63)) return { result: false, error: 'invalid_key' };
			const out = sh(`${AGENT} repeat ${shq(a.band)} ${shq(a.ssid)} ${shq(k)} 2>/dev/null`);
			if (match(out, /^OK/)) return { result: true };
			const e = match(out, /^ERR ([a-z_]+)/);
			return { result: false, error: e ? e[1] : 'failed' };
		}
	},

	repeat_off: {
		call: function() { sh(`${AGENT} repeat-off >/dev/null 2>&1`); return { result: true }; }
	},

	scan: {
		call: function() {
			if (mode() != 'ap') return { result: false, error: 'not_ap' };
			const out = [];
			for (let l in split(sh(`${AGENT} scan 2>/dev/null`), '\n')) {
				const m = match(l, /^(2g|5g) (-?[0-9]+) (.+)$/);
				if (m) push(out, { band: m[1], signal: +m[2], ssid: m[3] });
			}
			return { result: true, networks: out };
		}
	},

	restart_aps: {
		call: function() {
			if (!is_main()) return { result: false, error: 'not_main' };
			mkdir('/tmp/homenet'); mkdir(RUN);
			writefile(RST, sprintf('%J', { state: 'running', started: time(), current: null, done: [], skipped: [], failed: null }));
			rst_tick(cursor());
			return { result: true };
		}
	},

	update_status: {
		call: function() {
			const c = cursor(), r = roll_tick(c) ?? { state: 'idle' };
			const units = [];
			for (let a in aps()) {
				const id = a['.name'], st = status_of(id) ?? {};
				let s = 'waiting';
				if (id in (r.done ?? [])) s = 'done';
				else if (id in (r.skipped ?? [])) s = 'skipped';
				else if (r.failed == id) s = 'failed';
				else if (r.current == id) s = 'updating';
				push(units, { id: id, name: a.name ?? id, version: st.version ?? '', state: s });
			}
			return { state: r.state, target: r.target ?? null, error: r.error ?? null, failed: r.failed ?? null,
			         current: r.current ?? null, wait_minutes: ROLL_WAIT / 60, version: my_version(), units: units };
		}
	},

	settings: {
		args: { roaming: false },
		call: function(req) {
			const c = cursor();
			c.set('apctl', 'main', 'roaming', req.args.roaming ? '1' : '0'); c.commit('apctl');
			// the main router's own networks follow at once; the access points at their next contact
			sh(`${AGENT} roaming-local >/dev/null 2>&1`);
			return { result: true };
		}
	},

	// P7 item 1: the main router's nightly backup is kept by a paired access point, and every access
	// point's backup is kept by the main router. Over the LAN only, with the pairing token; files
	// readable by root only (they hold Wi-Fi passwords). Chunks of 48 KB, base64.
	backup_get: {
		args: { id: '', token: '', offset: 0 },
		call: function(req) {
			const c = cursor(), a = req.args;
			if (!match(a.id ?? '', /^ap[0-9]+$/) || !same(a.token, c.get('apctl', a.id, 'token'))) return { result: false, error: 'unknown_ap' };
			const f = `${RUN}/main-backup.tar.gz`;
			if (+a.offset == 0) {
				const st = stat(f);
				if (!st || time() - st.mtime > 3600) sh(`/usr/libexec/lg7200/backup create ${f} >/dev/null 2>&1; chmod 600 ${f}`);
			}
			const st = stat(f);
			if (!st) return { result: false, error: 'no_backup' };
			const fd = open(f, 'r');
			if (!fd) return { result: false, error: 'no_backup' };
			fd.seek(+a.offset);
			const d = fd.read(49152) ?? '';
			fd.close();
			return { result: true, size: st.size, data: b64enc(d), done: +a.offset + length(d) >= st.size };
		}
	},

	backup_put: {
		args: { id: '', token: '', offset: 0, data: '', final: false },
		call: function(req) {
			const c = cursor(), a = req.args;
			if (!match(a.id ?? '', /^ap[0-9]+$/) || !same(a.token, c.get('apctl', a.id, 'token'))) return { result: false, error: 'unknown_ap' };
			const dir = '/etc/homenet/ap-backups', part = `${dir}/${a.id}.part`;
			mkdir('/etc/homenet'); mkdir(dir, 0700);
			const d = b64dec(a.data ?? '') ?? '';
			const cur = stat(part)?.size ?? 0;
			if (+a.offset == 0) unlink(part);
			else if (cur != +a.offset) return { result: false, error: 'bad_offset' };
			if (+a.offset + length(d) > 4194304) { unlink(part); return { result: false, error: 'too_big' }; }
			const fd = open(part, 'a');
			if (!fd) return { result: false, error: 'failed' };
			fd.write(d); fd.close();
			sh(`chmod 600 ${part}`);
			if (a.final) rename(part, `${dir}/${a.id}.tar.gz`);
			return { result: true };
		}
	},

	join: {
		args: { code: '' },
		call: function(req) {
			if (mode() != 'ap') return { result: false, error: 'not_ap' };
			if (!match(`${req.args.code}`, /^[0-9]{6}$/)) return { result: false, error: 'wrong_code' };
			const out = sh(`${AGENT} join ${shq(req.args.code)} 2>/dev/null`);
			if (match(out, /^OK/)) return { result: true };
			const e = match(out, /^ERR ([a-z_]+)/);
			return { result: false, error: e ? e[1] : 'failed' };
		}
	},

	agent_status: {
		call: function() {
			const c = cursor();
			return { mode: mode(), paired: !!c.get('apctl', 'agent', 'token'), main: c.get('apctl', 'agent', 'main') ?? null,
			         id: c.get('apctl', 'agent', 'id') ?? null, last: +(readfile(`${RUN}/agent-last`) ?? 0) || null };
		}
	}
};

return { 'virox.apctl': apctl };
