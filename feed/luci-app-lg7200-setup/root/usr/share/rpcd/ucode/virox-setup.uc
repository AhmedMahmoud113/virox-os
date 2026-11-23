// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API (BUILD-PLAN section 11): the setup wizard's logic lives here; the LuCI page (and a
// future mobile app) only calls these methods. Documented in docs/api.md.
//
//   virox.info    info                      API version, product, versions        (any login)
//   virox.setup   status                    facts the wizard needs                (admin)
//                 validate {settings}       field -> error code, nothing changed  (admin)
//                 plan {settings}           validate, then return the uci operations
//                                           (set/delete/add) for these settings; the
//                                           client runs them via the uci object in
//                                           its session, uci apply+rollback, confirm (admin)
//                 set_password {password}   root password through passwd's stdin  (admin)
//                 set_language {lang}       LuCI language, committed at once      (admin)
//                 set_theme {look,mode,accent,base} the look (Argon / Vantage), light/dark, accent ('default' = the
//                                           base theme's own), base theme virox / slate / sand (guideline 8.3) (admin)
//                 theme                     the current look settings                 (admin)
//
// Error codes, not sentences: every client translates them itself.

'use strict';

import { readfile, popen } from 'fs';
import { cursor } from 'uci';


const API_VERSION = 3;   // 2: whole numbers only (kbit/s, MB), B7.3e item 6; 3: section 15 methods added

function shell_lines(cmd) {
	const fd = popen(cmd);
	if (!fd) return '';
	const out = fd.read('all');
	fd.close();
	return trim(out ?? '');
}

function root_has_password() {
	for (let line in split(readfile('/etc/shadow') ?? '', '\n')) {
		const f = split(line, ':');
		if (f[0] == 'root')
			return length(f[1] ?? '') > 0;
	}
	return false;
}

function unitcfg(keys) {
	let res = {};
	const out = shell_lines(`. /lib/functions/lg7200.sh; for k in ${join(' ', keys)}; do printf '%s=%s\\n' "$k" "$(unitcfg_get $k 2>/dev/null)"; done`);
	for (let line in split(out, '\n')) {
		const m = match(line, /^([a-z0-9_]+)=(.*)$/);
		if (m) res[m[1]] = m[2];
	}
	return res;
}

function release() {
	let res = {};
	for (let line in split(readfile('/etc/lg7200-release') ?? '', '\n')) {
		const m = match(line, /^([A-Z_]+)='(.*)'$/);
		if (m) res[lc(m[1])] = m[2];
	}
	return res;
}

function is_ipv4(s) {
	const m = match(s ?? '', /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return false;
	for (let i = 1; i <= 4; i++)
		if (+m[i] > 255) return false;
	return true;
}

// settings: { mode: router|ap, wan: { proto: dhcp|pppoe|static, username, password,
//             ipaddr, netmask, gateway, dns }, ssid, key }
function validate(s) {
	let e = {};
	if (type(s) != 'object')
		return { settings: 'missing' };
	if (!(s.mode in [ 'router', 'ap' ]))
		e.mode = 'invalid';
	if (s.mode == 'router') {
		const w = s.wan ?? {};
		if (!(w.proto in [ 'dhcp', 'pppoe', 'static' ]))
			e['wan.proto'] = 'invalid';
		if (w.proto == 'pppoe') {
			if (!length(trim(w.username ?? ''))) e['wan.username'] = 'required';
			if (!length(w.password ?? '')) e['wan.password'] = 'required';
		}
		if (w.proto == 'static') {
			for (let k in [ 'ipaddr', 'netmask', 'gateway' ])
				if (!is_ipv4(w[k])) e[`wan.${k}`] = 'invalid_ipv4';
			if (length(w.dns ?? '') && !is_ipv4(w.dns)) e['wan.dns'] = 'invalid_ipv4';
		}
	}
	const ssid = s.ssid ?? '';
	if (!length(trim(ssid)) || length(ssid) > 32)    // ucode length() counts bytes
		e.ssid = 'length_1_32';
	if (!match(s.key ?? '', /^[ -~]{8,63}$/))
		e.key = 'wpa_key_8_63';
	return e;
}

// Build the list of uci operations for these settings. The backend decides everything; the
// client only executes the generic operations through the standard `uci` ubus object in its
// own session (set / delete / add), then `uci apply` with rollback and `uci confirm`.
// (rpcd serves both this plugin and `uci`, so the plugin must not call `uci` over ubus itself:
// that would deadlock rpcd.)
function plan(s) {
	let ops = [];
	const U = (op, args) => push(ops, { op, ...args });
	const lg = cursor();
	const all = (config) => { let r = {}; lg.foreach(config, null, (sec) => { r[sec['.name']] = sec; }); return r; };

	const net = all('network'), fw = all('firewall'), dhcp = all('dhcp'), wl = all('wireless');
	const lan = net.lan ?? {};
	const lan_ip = split(lan.ipaddr ?? lg.get('lg7200', 'lan', 'default_ip') ?? '192.168.72.1', '/')[0];
	const lan_dev = lan.device ?? 'br-lan';
	const wan_dev = net.wan?.device;

	let br = null;
	for (let k, v in net)
		if (v['.type'] == 'device' && v.name == lan_dev) br = v;
	const ports = type(br?.ports) == 'array' ? br.ports : (br?.ports ? split(br.ports, ' ') : []);

	let lan_zone = null;
	for (let k, v in fw)
		if (v['.type'] == 'zone' && v.name == 'lan') lan_zone = v;
	const zone_nets = type(lan_zone?.network) == 'array' ? lan_zone.network : (lan_zone?.network ? split(lan_zone.network, ' ') : []);

	if (s.mode == 'router') {
		U('set', { config: 'network', section: 'lan', values: { proto: 'static', ipaddr: `${lan_ip}/24` } });
		U('delete', { config: 'network', section: 'lan', option: 'netmask' });
		if (net.lan_fb) U('delete', { config: 'network', section: 'lan_fb' });
		if (br && wan_dev && wan_dev in ports)
			U('set', { config: 'network', section: br['.name'], values: { ports: filter(ports, p => p != wan_dev) } });
		for (let i in [ 'wan', 'wan6' ])
			if (net[i]) U('delete', { config: 'network', section: i, option: 'disabled' });
		if (dhcp.lan) U('delete', { config: 'dhcp', section: 'lan', options: [ 'ignore', 'dhcpv6', 'ra' ] });
		if (lan_zone && 'lan_fb' in zone_nets)
			U('set', { config: 'firewall', section: lan_zone['.name'], values: { network: filter(zone_nets, n => n != 'lan_fb') } });

		if (net.wan) {
			const w = s.wan;
			U('delete', { config: 'network', section: 'wan', options: [ 'username', 'password', 'ipaddr', 'netmask', 'gateway', 'dns' ] });
			let v = { proto: w.proto };
			if (w.proto == 'pppoe') { v.username = trim(w.username); v.password = w.password; }
			if (w.proto == 'static') {
				v.ipaddr = w.ipaddr; v.netmask = w.netmask; v.gateway = w.gateway;
				if (length(w.dns ?? '')) v.dns = [ w.dns ];
			}
			U('set', { config: 'network', section: 'wan', values: v });
		}
	}
	else {
		// Access point: one bridge, address from the main router, fixed fallback address
		if (br && wan_dev && !(wan_dev in ports))
			U('set', { config: 'network', section: br['.name'], values: { ports: [ ...ports, wan_dev ] } });
		U('set', { config: 'network', section: 'lan', values: { proto: 'dhcp' } });
		U('delete', { config: 'network', section: 'lan', options: [ 'ipaddr', 'netmask' ] });
		if (!net.lan_fb) U('add', { config: 'network', type: 'interface', name: 'lan_fb' });
		U('set', { config: 'network', section: 'lan_fb', values: { proto: 'static', device: lan_dev, ipaddr: `${lan_ip}/24` } });
		for (let i in [ 'wan', 'wan6' ])
			if (net[i]) U('set', { config: 'network', section: i, values: { disabled: '1' } });
		if (dhcp.lan) U('set', { config: 'dhcp', section: 'lan', values: { ignore: '1', dhcpv6: 'disabled', ra: 'disabled' } });
		if (lan_zone && !('lan_fb' in zone_nets))
			U('set', { config: 'firewall', section: lan_zone['.name'], values: { network: [ ...zone_nets, 'lan_fb' ] } });
	}

	const split = lg.get('lg7200', 'wifi', 'split') == '1';
	for (let k, v in wl)
		if (v['.type'] == 'wifi-iface' && v.mode == 'ap' && v.network != 'guest')
			U('set', { config: 'wireless', section: k, values: { ssid: (split && wl[v.device]?.band == '5g') ? ssid_5g(s.ssid) : s.ssid,
				key: s.key, encryption: 'psk2+ccmp', disabled: '0' } });	// WPA2 only (owner 2026-11-22: WPA2/WPA3 mixed kept the iPhone and many devices out)

	if (!lg.get('lg7200', 'state'))
		U('add', { config: 'lg7200', type: 'state', name: 'state' });
	U('set', { config: 'lg7200', section: 'state', values: { mode: s.mode, setup_done: '1', setup_time: `${time()}` } });
	return ops;
}

function set_password(pw) {
	if (type(pw) != 'string' || length(pw) < 6 ||  // owner 2026-11-21: 6 is enough (was 10)
	     match(pw, /[\n\r]/))
		return { result: false, error: 'password_short' };
	// through stdin only: the password never appears on a command line or in a log
	const fd = popen('/bin/busybox passwd root >/dev/null 2>&1', 'w');
	if (!fd)
		return { result: false, error: 'passwd_failed' };
	fd.write(pw + '\n');
	fd.flush();
	sleep(1000);
	fd.write(pw + '\n');
	const rc = fd.close();
	if (rc != 0 || !root_has_password())
		return { result: false, error: 'passwd_failed' };
	system('/etc/init.d/lg7200-gate reload >/dev/null 2>&1');
	return { result: true };
}

const info = {
	info: {
		call: function() {
			const r = release();
			// clock: ntp | approximate (HTTPS Date, B7.5b) | none (not synced yet)
			return { api: API_VERSION, product: r.product_name, version: r.product_version,
			         base: r.base, source: r.source_url,
			         clock: shell_lines('. /lib/functions/lg7200.sh; lg7200_time_state') };
		}
	}
};

const setup = {
	status: {
		call: function() {
			const uci = cursor();
			const u = unitcfg([ 'wifi_ssid', 'wifi_key' ]);
			return {
				api: API_VERSION,
				has_password: root_has_password(),
				setup_done: uci.get('lg7200', 'state', 'setup_done') == '1',
				mode: uci.get('lg7200', 'state', 'mode') ?? 'router',
				mac_source: uci.get('lg7200', 'state', 'mac_source') ?? '',
				lan_moved: uci.get('lg7200', 'state', 'lan_moved') ?? '',
				lan_ip: split(uci.get('network', 'lan', 'ipaddr') ?? '', '/')[0],
				has_wan: !!uci.get('network', 'wan'),
				storage: shell_lines('. /lib/functions/lg7200.sh; lg7200_unitcfg_backend'),
				unit_ssid: u.wifi_ssid ?? '',
				unit_key: u.wifi_key ?? ''
			};
		}
	},

	validate: {
		args: { settings: {} },
		call: function(req) {
			const e = validate(req.args.settings);
			return { ok: !length(keys(e)), errors: e };
		}
	},

	plan: {
		args: { settings: {} },
		call: function(req) {
			const e = validate(req.args.settings);
			if (length(keys(e)))
				return { ok: false, errors: e, ops: [] };
			return { ok: true, errors: {}, ops: plan(req.args.settings) };
		}
	},

	// back to a new router (owner 2026-11-22: from the Settings page, not only the button on the
	// unit). Everything set up goes: settings, people, usage history, passwords. The unit's own
	// data (its MAC, its Wi-Fi name and password, unitcfg) stays, and the setup network opens again
	// for 60 minutes. confirm must be "RESET" (a client cannot do it by one stray call). Never while
	// an update is being installed.
	factory_reset: {
		args: { confirm: '' },
		call: function(req) {
			if (req.args.confirm != 'RESET') return { result: false, error: 'confirm_needed' };
			if (shell_lines('pgrep -f "sysupgrade|lg7200-update install" 2>/dev/null | head -n 1') != '')
				return { result: false, error: 'update_running' };
			system('(sleep 3; firstboot -y && reboot) >/dev/null 2>&1 &');
			return { result: true, rebooting: true };
		}
	},

	set_password: {
		args: { password: '' },
		call: function(req) {
			return set_password(req.args.password);
		}
	},

	set_language: {
		args: { lang: '' },
		call: function(req) {
			if (!(req.args.lang in [ 'ar', 'en' ]))
				return { result: false, error: 'invalid' };
			const uci = cursor();
			uci.set('luci', 'main', 'lang', req.args.lang);
			uci.commit('luci');
			return { result: true };
		}
	},

	// BUILD-PLAN 10b item 4: the look (Vantage based = luci-theme-virox-vantage, the default and the
	// only one offered, owner 2026-11-19; Argon based = luci-theme-virox, kept for the API), light / dark / follow the device, and the accent
	// colour. Every argument is optional; only the given ones change. Stored in lg7200.ui (mode,
	// accent, accent_dark) and luci.main.mediaurlbase; the pages apply it from the next load.
	set_theme: {
		args: { look: '', mode: '', accent: '', base: '' },
		call: function(req) {
			const a = req.args;
			const LOOKS = { argon: '/luci-static/virox', vantage: '/luci-static/virox-vantage' };
			if ((a.look && !(a.look in keys(LOOKS))) || (a.mode && !(a.mode in [ 'normal', 'light', 'dark' ])) ||
			    (a.base && !(a.base in [ 'virox', 'slate', 'sand' ])) ||
			    (a.accent && a.accent != 'default' && !match(a.accent, /^#[0-9a-fA-F]{6}$/)))
				return { result: false, error: 'invalid' };
			if (a.look == 'vantage' && !readfile('/www/luci-static/virox-vantage/vantage.css', 1))
				return { result: false, error: 'not_installed' };
			const uci = cursor();
			if (uci.get('lg7200', 'ui') == null)
				uci.set('lg7200', 'ui', 'ui');
			if (a.mode) uci.set('lg7200', 'ui', 'mode', a.mode);
			if (a.base) uci.set('lg7200', 'ui', 'base', a.base);
			if (a.accent == 'default') {
				// back to the base theme's own accent (light and dark)
				uci.delete('lg7200', 'ui', 'accent');
				uci.delete('lg7200', 'ui', 'accent_dark');
			}
			else if (a.accent) {
				uci.set('lg7200', 'ui', 'accent', lc(a.accent));
				uci.delete('lg7200', 'ui', 'accent_dark');   // the dark variant is derived from it (head.ut)
			}
			uci.commit('lg7200');
			if (a.look) {
				uci.set('luci', 'main', 'mediaurlbase', LOOKS[a.look]);
				uci.commit('luci');
			}
			return { result: true };
		}
	},

	theme: {
		call: function() {
			const uci = cursor();
			const media = uci.get('luci', 'main', 'mediaurlbase');
			const DEF = { virox: '#0b7a5f', slate: '#2563eb', sand: '#b4552d' };
			let base = uci.get('lg7200', 'ui', 'base');
			if (!(base in keys(DEF))) base = 'slate';   // the default base (owner 2026-11-23)
			const accent = uci.get('lg7200', 'ui', 'accent');
			return {
				look: media == '/luci-static/virox-vantage' ? 'vantage' : 'argon',
				mode: uci.get('lg7200', 'ui', 'mode') ?? 'light',
				base: base,
				bases: keys(DEF),
				accent: accent ?? DEF[base],
				accent_custom: accent != null,
				looks: readfile('/www/luci-static/virox-vantage/vantage.css', 1) ? [ 'vantage' ] : [ 'argon' ]
			};
		}
	}
};

// ------------------------------------------------------------------ games mode (P4)
// miniupnpd shipped off; one switch. Lease list = who opened which port.
const gaming = {
	get: {
		call: function() {
			const uci = cursor();
			let leases = [];
			const f = uci.get('upnpd', 'config', 'upnp_lease_file') ?? '/var/run/miniupnpd.leases';
			for (let line in split(readfile(f) ?? '', '\n')) {
				// PROTO:EXTPORT:IP:INTPORT:EXPIRES:DESCRIPTION
				const p = split(line, ':', 6);
				if (length(p) >= 5)
					push(leases, { proto: p[0], ext_port: +p[1], ip: p[2], int_port: +p[3], expires: +p[4], description: p[5] ?? '' });
			}
			return { installed: !!uci.get('upnpd', 'config'),
			         enabled: uci.get('upnpd', 'config', 'enabled') == '1', leases };
		}
	},
	set: {
		args: { enabled: false },
		call: function(req) {
			const uci = cursor();
			if (!uci.get('upnpd', 'config'))
				return { result: false, error: 'not_installed' };
			const on = !!req.args.enabled;
			uci.set('upnpd', 'config', 'enabled', on ? '1' : '0');
			uci.commit('upnpd');
			system(on ? '/etc/init.d/miniupnpd enable; /etc/init.d/miniupnpd restart' :
			            '/etc/init.d/miniupnpd stop; /etc/init.d/miniupnpd disable');
			return { result: true, enabled: on };
		}
	}
};

// ------------------------------------------------------------------ Wi-Fi in simple words (13.8)
// Read with `iw` in a child process: the iwinfo ubus object lives in rpcd itself.
function signal_label(dbm) {
	if (dbm >= -60) return 'excellent';
	// -80 dBm is still two bars and a working link (owner 2026-11-22: a phone at -77 was "weak")
	if (dbm >= -80) return 'good';
	return 'weak';
}

// BUILD-PLAN 13.1: one name for both bands by default (usteer moves capable devices to 5 GHz);
// "separate names" gives the 5 GHz network the same name with "-5G" (within 32 bytes)
function ssid_5g(base) {
	return substr(base, 0, 32 - 3) + '-5G';
}


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

function wifi_status_read() {
	let radios = [];
	const uci = cursor();
	let iface_band = {};
	uci.foreach('wireless', 'wifi-device', (d) => { iface_band[d['.name']] = d.band; });

	const dev = shell_lines('iw dev 2>/dev/null');
	let cur = null;
	for (let line in split(dev, '\n')) {
		let m;
		if ((m = match(line, /^\s*Interface (\S+)/))) { cur = { ifname: m[1] }; push(radios, cur); }
		else if (cur && (m = match(line, /^\s*type (\S+)/))) cur.type = m[1];
		else if (cur && (m = match(line, /^\s*ssid (.*)$/))) cur.ssid = m[1];
		else if (cur && (m = match(line, /^\s*channel (\d+) \((\d+) MHz\), width: (\d+) MHz/))) { cur.channel = +m[1]; cur.freq = +m[2]; cur.width = +m[3]; }
	}
	// the guest network is not a home network: its interfaces (by the section's network) are left out
	let guest_if = {};
	try {
		const ws = json(shell_lines('ubus call network.wireless status 2>/dev/null') || '{}');
		for (let rn, rv in ws)
			for (let i in (rv?.interfaces ?? []))
				if (i.ifname && uci.get('wireless', i.section, 'network') == 'guest') guest_if[i.ifname] = true;
	} catch (e) {}
	radios = filter(radios, r => r.type == 'AP' && r.channel && !guest_if[r.ifname]);
	// iw prints bytes outside ASCII as \xNN: an Arabic name came out as "\xd8\xa7..." (owner 2026-11-20)
	for (let r in radios)
		if (r.ssid) r.ssid = replace(r.ssid, /\\x([0-9a-fA-F]{2})/g, (m, h) => chr(hex(h)));

	for (let r in radios) {
		r.band = r.freq < 3000 ? '2g' : '5g';
		// how busy the channel is: busy time / active time of the channel in use
		const sv = shell_lines(`iw dev ${r.ifname} survey dump 2>/dev/null`);
		for (let blk in split(sv, 'Survey data')) {
			if (!match(blk, /\[in use\]/)) continue;
			const a = match(blk, /channel active time:\s*(\d+)/), b = match(blk, /channel busy time:\s*(\d+)/);
			if (a && b && +a[1] > 0) r.busy_percent = int(+b[1] * 100 / +a[1]);
		}
		r.clients = [];
		const st = shell_lines(`iw dev ${r.ifname} station dump 2>/dev/null`);
		let c = null;
		for (let line in split(st, '\n')) {
			let m;
			if ((m = match(line, /^Station (\S+)/))) { c = { mac: m[1] }; push(r.clients, c); }
			else if (c && (m = match(line, /^\s*signal:\s*(-?\d+)/))) { c.signal = +m[1]; c.label = signal_label(c.signal); }
			else if (c && (m = match(line, /^\s*tx bitrate:\s*([\d.]+) MBit/))) c.tx_mbit = +m[1];
		}
		r.client_count = length(r.clients);
	}
	return radios;
}
// virox.wifi status runs iw for every interface (survey, stations): at most once every 3 seconds
function wifi_status() { return cached('wifi', 3, wifi_status_read); }

// the bands of this unit and whether the home Wi-Fi is on there (owner 2026-11-22: "where is the
// switch to turn 5 GHz off?"): { "2g": { on }, "5g": { on } }, only the bands that have a radio
function wifi_bands(c) {
	let out = {};
	c.foreach('wireless', 'wifi-device', (d) => {
		if (!(d.band in [ '2g', '5g' ])) return;
		let on = false;
		c.foreach('wireless', 'wifi-iface', (v) => {
			if (v.device == d['.name'] && v.mode == 'ap' && v.network == 'lan' && v.disabled != '1' && d.disabled != '1') on = true;
		});
		out[d.band] = { on };
	});
	return out;
}

const wifi = {
	status: { call: function() { const c = cursor(); return { radios: wifi_status(), split: c.get('lg7200', 'wifi', 'split') == '1', hidden_2g: (c.get('lg7200', 'wifi', 'hidden_2g') ?? c.get('lg7200', 'wifi', 'hidden')) == '1', hidden_5g: (c.get('lg7200', 'wifi', 'hidden_5g') ?? c.get('lg7200', 'wifi', 'hidden')) == '1',
	                                                   power_high: true /* always (owner 2026-11-22) */, bands: wifi_bands(c) }; } },
	// switch the home Wi-Fi of one band off or on again (owner 2026-11-22). Off: the home and guest
	// networks of that band are switched off; a Wi-Fi client on that radio (internet from another
	// router's Wi-Fi) keeps working. The last band that is on cannot be switched off (error
	// last_band: nobody could reach the router by Wi-Fi any more). On: the radio and the home network
	// come back; when the home network of that band was deleted (OpenWrt pages), it is made again
	// with the name and password of the other band (-5G with separate names). The guest network
	// comes back only when it is switched on. Access points follow at their next contact.
	band: {
		args: { band: '', on: false },
		call: function(req) {
			const uci = cursor(), on = !!req.args.on, band = req.args.band;
			if (!(band in [ '2g', '5g' ])) return { result: false, error: 'invalid_band' };
			let radio = null;
			uci.foreach('wireless', 'wifi-device', (d) => { if (d.band == band && radio == null) radio = d['.name']; });
			if (radio == null) return { result: false, error: 'no_wifi' };
			const bandof = dev => uci.get('wireless', dev, 'band');
			if (!on) {
				let other = 0;
				uci.foreach('wireless', 'wifi-iface', (v) => {
					if (v.mode == 'ap' && v.network == 'lan' && v.disabled != '1' && bandof(v.device) != band && uci.get('wireless', v.device, 'disabled') != '1') other++;
				});
				if (!other) return { result: false, error: 'last_band' };
				uci.foreach('wireless', 'wifi-iface', (v) => {
					if (v.mode == 'ap' && bandof(v.device) == band && (v.network == 'lan' || v.network == 'guest')) {
						uci.set('wireless', v['.name'], 'disabled', '1');
						// off for good: the Wi-Fi schedule must not bring the guest network back at its on-time
						uci.delete('wireless', v['.name'], 'lg7200_sched_off');
					}
				});
			}
			else {
				uci.set('wireless', radio, 'disabled', '0');
				let home = null, model = null;
				uci.foreach('wireless', 'wifi-iface', (v) => {
					if (v.mode != 'ap' || (v.network != 'lan' && v.network != 'guest')) return;
					if (bandof(v.device) == band) {
						if (v.network == 'lan') { home = v['.name']; uci.delete('wireless', v['.name'], 'disabled'); }
						else if (cursor().get('homenet', 'guest', 'enabled') == '1') uci.delete('wireless', v['.name'], 'disabled');
					}
					else if (v.network == 'lan' && model == null) model = v;
				});
				if (home == null) {
					if (model == null) return { result: false, error: 'no_wifi' };
					const s = `vx_home_${band}`;
					const split = uci.get('lg7200', 'wifi', 'split') == '1';
					const base = replace(model.ssid ?? '', /-5G$/, '');
					uci.set('wireless', s, 'wifi-iface');
					uci.set('wireless', s, 'device', radio);
					uci.set('wireless', s, 'mode', 'ap');
					uci.set('wireless', s, 'network', 'lan');
					uci.set('wireless', s, 'ssid', (band == '5g' && split) ? base + '-5G' : base);
					for (let k in [ 'encryption', 'key', 'ieee80211k', 'bss_transition', 'wps_pushbutton', 'wpa_psk_file' ])
						if (model[k] != null) uci.set('wireless', s, k, model[k]);
					// hidden: the setting of this band, not of the other one
					if ((uci.get('lg7200', 'wifi', `hidden_${band}`) ?? uci.get('lg7200', 'wifi', 'hidden')) == '1') uci.set('wireless', s, 'hidden', '1');
				}
			}
			uci.commit('wireless');
			if (uci.get('lg7200', 'wifi') == null) uci.set('lg7200', 'wifi', 'wifi');
			uci.set('lg7200', 'wifi', `off_${band}`, on ? '0' : '1');
			uci.commit('lg7200');
			system('(sleep 1; wifi reload) >/dev/null 2>&1 &');
			return { result: true };
		}
	},
	// hide the home network name of one band (2g / 5g) or of both (one name for both bands is one
	// network: the page sends "both"), not the guest network (it has its own switch, virox.homenet
	// guest_hidden; owner 2026-11-21: one checkbox per network). Devices that know it still
	// connect, new ones type the name by hand. Access points follow at their next contact.
	hidden: {
		args: { band: '', on: false },
		call: function(req) {
			const uci = cursor(), on = !!req.args.on, band = req.args.band;
			if (!(band in [ '2g', '5g', 'both' ])) return { result: false, error: 'invalid_band' };
			const bands = band == 'both' ? [ '2g', '5g' ] : [ band ];
			let n = 0;
			uci.foreach('wireless', 'wifi-iface', (v) => {
				if (v.mode == 'ap' && v.network == 'lan' && (uci.get('wireless', v.device, 'band') in bands)) {
					if (on) uci.set('wireless', v['.name'], 'hidden', '1'); else uci.delete('wireless', v['.name'], 'hidden');
					n++;
				}
			});
			if (!n) return { result: false, error: 'no_wifi' };
			uci.commit('wireless');
			if (uci.get('lg7200', 'wifi') == null) uci.set('lg7200', 'wifi', 'wifi');
			for (let b in bands) uci.set('lg7200', 'wifi', `hidden_${b}`, on ? '1' : '0');
			uci.delete('lg7200', 'wifi', 'hidden');
			uci.commit('lg7200');
			system('(sleep 1; wifi reload) >/dev/null 2>&1 &');
			return { result: true };
		}
	},
	// 13.1: separate names for the two bands, or one name again; the radios restart (seconds)
	split: {
		args: { on: false },
		call: function(req) {
			const uci = cursor();
			const on = !!req.args.on;
			let base = null;
			uci.foreach('wireless', 'wifi-iface', (v) => {
				if (v.mode == 'ap' && v.network != 'guest' && uci.get('wireless', v.device, 'band') != '5g' && base == null) base = v.ssid;
			});
			if (base == null)
				uci.foreach('wireless', 'wifi-iface', (v) => { if (v.mode == 'ap' && v.network != 'guest' && base == null) base = replace(v.ssid ?? '', /-5G$/, ''); });
			if (base == null) return { result: false, error: 'no_wifi' };
			uci.foreach('wireless', 'wifi-iface', (v) => {
				if (v.mode == 'ap' && v.network != 'guest' && uci.get('wireless', v.device, 'band') == '5g')
					uci.set('wireless', v['.name'], 'ssid', on ? ssid_5g(base) : base);
			});
			uci.commit('wireless');
			if (uci.get('lg7200', 'wifi') == null) uci.set('lg7200', 'wifi', 'wifi');
			uci.set('lg7200', 'wifi', 'split', on ? '1' : '0');
			uci.commit('lg7200');
			system('(sleep 1; wifi reload) >/dev/null 2>&1 &');
			return { result: true };
		}
	},
	// stronger 2.4 GHz signal (owner 2026-11-20: as the reseller's system, 25 dBm instead of 20).
	// The Egyptian rules (EG) allow 20 dBm on 2.4 GHz and the kernel holds every radio to the
	// country's limit, so "high" puts the radios on the US rules: 2.4 GHz up to the card's 25 dBm.
	// 5 GHz stays on the Egyptian rules (wifi-power: channels 36-64 only, 23 dBm on 36-48, 20 on
	// 52-64). Above the legal limit in Egypt on 2.4 GHz: the owner's decision (BUILD-PLAN 13, 15.2),
	// off in the release image, on at first boot in the owner image. Access points follow (sync).
	power: {
		args: { high: false },
		call: function(req) {
			const uci = cursor(), high = !!req.args.high;
			let n = 0;
			uci.foreach('wireless', 'wifi-device', () => { n++; });
			if (!n) return { result: false, error: 'no_wifi' };
			if (uci.get('lg7200', 'wifi') == null) uci.set('lg7200', 'wifi', 'wifi');
			uci.set('lg7200', 'wifi', 'power', high ? 'high' : 'normal');
			uci.commit('lg7200');
			// country, the 5 GHz channel list and the 52-64 cap: the helper the first boot and the
			// access points use too
			system('/usr/libexec/lg7200/wifi-power apply >/dev/null 2>&1');
			system('(sleep 1; wifi reload) >/dev/null 2>&1 &');
			return { result: true };
		}
	},
	// "choose the best channel now": restart the radios so ACS picks again (13.7)
	rescan: { call: function() { return { result: system('wifi reload >/dev/null 2>&1') == 0 }; } }
};

// ------------------------------------------------------------------ notices (PLAN 7.1, B6 items 1, 8)
// Alerts as data (section 11.4): the LuCI header and a future app read the same list.
function notices() {
	const uci = cursor();
	let n = [];
	// B6.2 revised: the generated MAC works normally; the admin sees it once (dismissible),
	// then only as a plain line on the Wi-Fi/advanced page (status.mac_source).
	if (uci.get('lg7200', 'state', 'mac_source') == 'generated' &&
	    uci.get('lg7200', 'state', 'mac_notice_dismissed') != '1')
		push(n, { code: 'mac_generated', level: 'info', dismissable: true });
	const moved = uci.get('lg7200', 'state', 'lan_moved');
	if (moved) {
		const p = split(moved, ' ');
		push(n, { code: 'lan_moved', level: 'info', dismissable: true, from: p[0], to: p[1], time: +p[2] });
	}
	// seen once is enough (owner 2026-11-20: it stayed on Home for good); a factory reset brings it back
	if (uci.get('lg7200', 'state', 'storage_notice_dismissed') != '1' &&
	    shell_lines('. /lib/functions/lg7200.sh; lg7200_unitcfg_backend') == 'file' &&
	    shell_lines('ls /sys/class/ubi 2>/dev/null | head -n 1') != '')
		push(n, { code: 'storage_file', level: 'info', dismissable: true });
	return n;
}

setup.notices = { call: function() { return { notices: notices() }; } };
setup.dismiss_notice = {
	args: { code: '' },
	call: function(req) {
		const uci = cursor();
		if (req.args.code == 'lan_moved') {
			uci.delete('lg7200', 'state', 'lan_moved');
			uci.commit('lg7200');
			return { result: true };
		}
		if (req.args.code == 'mac_generated') {
			if (!uci.get('lg7200', 'state')) uci.set('lg7200', 'state', 'state');
			uci.set('lg7200', 'state', 'mac_notice_dismissed', '1');
			uci.commit('lg7200');
			return { result: true };
		}
		if (req.args.code == 'storage_file') {
			if (!uci.get('lg7200', 'state')) uci.set('lg7200', 'state', 'state');
			uci.set('lg7200', 'state', 'storage_notice_dismissed', '1');
			uci.commit('lg7200');
			return { result: true };
		}
		return { result: false, error: 'not_dismissable' };
	}
};

// ------------------------------------------------------------------ provisioning (B6 item 12)
function mac_ok(m) {
	m = lc(replace(m ?? '', '-', ':'));
	if (!match(m, /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/)) return null;
	const first = hex(substr(m, 0, 2));
	if (first & 1) return null;                                   // multicast
	if (m == '00:00:00:00:00:00' || m == 'ff:ff:ff:ff:ff:ff') return null;
	return m;
}

const provision = {
	// facts read from this unit for the PC-side registry (tools/provision.sh)
	info: {
		call: function() {
			const u = unitcfg([ 'wifi_ssid', 'wifi_key', 'base_mac_override' ]);
			const fdev = shell_lines('. /lib/functions/lg7200.sh; lg7200_factory_dev');
			return {
				api: API_VERSION,
				factory_mac: shell_lines('. /lib/functions/lg7200.sh; lg7200_factory_mac'),
				factory_sha256: fdev ? split(shell_lines(`sha256sum ${fdev} 2>/dev/null`), ' ')[0] ?? '' : '',
				base_mac: split(shell_lines('. /lib/functions/lg7200.sh; lg7200_base_mac'), ' ')[0] ?? '',
				mac_source: split(shell_lines('. /lib/functions/lg7200.sh; lg7200_base_mac'), ' ')[1] ?? '',
				label_mac: u.base_mac_override ?? '',
				unit_ssid: u.wifi_ssid ?? '', unit_key: u.wifi_key ?? '',
				storage: shell_lines('. /lib/functions/lg7200.sh; lg7200_unitcfg_backend'),
				nand: shell_lines('ls /sys/class/ubi 2>/dev/null | head -n 1') != ''
			};
		}
	},

	// the MAC printed on the label: stored as the unit's base MAC override; applied at next boot
	// (applying now would drop the connection of the person doing it)
	set_label_mac: {
		args: { mac: '' },
		call: function(req) {
			const m = mac_ok(req.args.mac);
			if (!m)
				return { result: false, error: 'invalid_mac' };
			// only the MACs are re-applied at the next boot, never the rest of the first-boot defaults
			const rc = system(`. /lib/functions/lg7200.sh; unitcfg_set base_mac_override '${m}' && uci set lg7200.state.mac_reapply=1 && uci commit lg7200`);
			return rc == 0 ? { result: true, mac: m, applies: 'after_reboot' } : { result: false, error: 'store_failed' };
		}
	},

	// one-time self-upgrade that creates the provisioning volume (sysupgrade -P -n), F16 decision.
	// The image must already be in /tmp (uploaded through LuCI's cgi-upload). HARDWARE-UNTESTED.
	self_upgrade: {
		args: { path: '' },
		call: function(req) {
			const p = req.args.path;
			if (!match(p ?? '', /^\/tmp\/[A-Za-z0-9._-]+$/))
				return { result: false, error: 'invalid_path' };
			if (shell_lines('ls /sys/class/ubi 2>/dev/null | head -n 1') == '')
				return { result: false, error: 'no_nand' };
			// an image of the other board (GAPM-7200 / GAPD-7200, BUILD-PLAN 16) is refused by name
			if (system(`. /lib/functions/lg7200.sh; lg7200_image_for_board '${p}' >/dev/null 2>&1`) != 0)
				return { result: false, error: 'wrong_board' };
			if (system(`sysupgrade -T '${p}' >/dev/null 2>&1`) != 0)
				return { result: false, error: 'image_rejected' };
			system(`(sleep 3; sysupgrade -P -n '${p}') >/dev/null 2>&1 &`);
			return { result: true, rebooting: true };
		}
	}
};

// ------------------------------------------------------------------ shared event list (11.4)
// Written by lg7200_event_add (lg7200-base); read state = highest sequence number marked read.
const EVENTS = '/etc/lg7200/events';

function read_events() {
	let out = [];
	for (let line in split(readfile(EVENTS) ?? '', '\n')) {
		const f = split(line, '\t');
		if (length(f) < 6) continue;
		let data = {};
		for (let kv in split(f[6] ?? '', ';')) {
			const i = index(kv, '=');
			if (i > 0) data[substr(kv, 0, i)] = substr(kv, i + 1);
		}
		push(out, { id: f[0], seq: +split(f[0], '-')[1], time: +f[1], clock_synced: f[2] == '1',
		            level: f[3], source: f[4], code: f[5], data });
	}
	return out;
}

const events = {
	// newest first; { limit: n (default 50), unread_only: bool }
	list: {
		args: { limit: 0, unread_only: false },
		call: function(req) {
			const upto = +(cursor().get('lg7200', 'state', 'events_read_upto') ?? 0);
			let ev = reverse(read_events());
			for (let e in ev) e.read = e.seq <= upto;
			if (req.args.unread_only) ev = filter(ev, e => !e.read);
			const lim = req.args.limit > 0 ? req.args.limit : 50;
			return { events: slice(ev, 0, lim), unread: length(filter(ev, e => !e.read)) };
		}
	},
	// mark everything up to and including event id (or all) as read
	mark_read: {
		args: { id: '' },
		call: function(req) {
			const all = read_events();
			let upto = 0;
			if (req.args.id) {
				const m = match(req.args.id, /^\d+-(\d+)$/);
				if (!m) return { result: false, error: 'invalid_id' };
				upto = +m[1];
			}
			else
				for (let e in all) if (e.seq > upto) upto = e.seq;
			const uci = cursor();
			if (!uci.get('lg7200', 'state')) uci.set('lg7200', 'state', 'state');
			uci.set('lg7200', 'state', 'events_read_upto', `${upto}`);
			uci.commit('lg7200');
			return { result: true, read_upto: upto };
		}
	}
};

return { 'virox.info': info, 'virox.setup': setup, 'virox.gaming': gaming, 'virox.wifi': clears_cache(wifi, [ 'status' ]),
         'virox.provision': provision, 'virox.events': events };
