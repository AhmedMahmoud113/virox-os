// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, schedules (BUILD-PLAN 15.4 items 3-4). All off by default. The work is done every
// minute by /usr/libexec/lg7200/schedule tick; access points get the Wi-Fi and light schedules of
// the main router (apctl sync).
//   get                                   the Wi-Fi windows, the lights, the restart, what is off now (admin)
//   set_wifi {items: [{target, days, off, on, enabled}]}   replaces the list; target all | 2g | 5g |
//                                         guest; days [0-6] (0 = Sunday, the day of the off-time);
//                                         off / on "HH:MM" (on earlier than off = the next morning) (admin)
//   set_leds {mode, off, on}              mode on | off | night                                    (admin)
//   set_restart {enabled, every, day, time}   every daily | weekly; day 0-6; time "HH:MM"         (admin)
//   preview_wifi {items}                  the admin's own devices (they have these pages open now)
//                                         that are on a Wi-Fi these windows switch off             (admin)
'use strict';

import { popen } from 'fs';
import { cursor } from 'uci';

const SCHED = '/usr/libexec/lg7200/schedule', MAX = 16;
function sh(cmd) { const fd = popen(cmd); if (!fd) return ''; const o = fd.read('all'); fd.close(); return trim(o ?? ''); }
function kv(text) {
	let o = {};
	for (let l in split(text ?? '', '\n')) { const i = index(l, '='); if (i > 0) o[substr(l, 0, i)] = substr(l, i + 1); }
	return o;
}
function hm_ok(s) { return type(s) == 'string' && !!match(s, /^([01][0-9]|2[0-3]):[0-5][0-9]$/); }
function days_of(d) {
	if (type(d) != 'array' || !length(d) || length(d) > 7) return null;
	let seen = {};
	for (let x in d) { if (type(x) != 'int' || x < 0 || x > 6 || seen[x]) return null; seen[x] = true; }
	return sort(d);
}
function items(c) {
	const out = [];
	c.foreach('lg7200', 'wifisched', s => {
		push(out, { target: s.target, days: map(split(s.days ?? '', ' '), x => +x), off: s.off, on: s.on, enabled: s.enabled != '0' });
	});
	return out;
}
function check_items(list) {
	if (type(list) != 'array' || length(list) > MAX) return 'invalid_schedule';
	for (let it in list) {
		if (type(it) != 'object' || !(it.target in [ 'all', '2g', '5g', 'guest' ]) || !days_of(it.days) ||
		    !hm_ok(it.off) || !hm_ok(it.on) || it.off == it.on) return 'invalid_schedule';
	}
	return null;
}
function tick() { system(`${SCHED} tick >/dev/null 2>&1 &`); }

// Wi-Fi stations: mac -> band ('2g' | '5g' | 'guest')
function stations() {
	const c = cursor(), out = {}, guest = {};
	try {
		const ws = json(sh('ubus call network.wireless status 2>/dev/null') || '{}');
		for (let rn, rv in ws)
			for (let i in (rv?.interfaces ?? []))
				if (i.ifname) guest[i.ifname] = c.get('wireless', i.section, 'network') == 'guest';
	} catch (e) {}
	let cur = null, band = null;
	for (let line in split(sh('iw dev 2>/dev/null'), '\n')) {
		let m;
		if ((m = match(line, /^\s*Interface (\S+)/))) { cur = m[1]; band = null; }
		else if (cur && (m = match(line, /^\s*channel \d+ \((\d+) MHz/))) {
			band = guest[cur] ? 'guest' : (+m[1] < 3000 ? '2g' : '5g');
			for (let l2 in split(sh(`iw dev ${cur} station dump 2>/dev/null`), '\n')) {
				const s = match(l2, /^Station ([0-9a-f:]{17})/);
				if (s) out[s[1]] = band;
			}
		}
	}
	return out;
}
// the devices that have these pages open now: TCP connections to the router's ports 80/443
function admin_macs() {
	const ips = {}, macs = {};
	for (let l in split(sh('netstat -tn 2>/dev/null'), '\n')) {
		const m = match(l, /^tcp\s+\d+\s+\d+\s+\S+:(80|443)\s+([0-9.]+):\d+\s+ESTABLISHED/);
		if (m) ips[m[2]] = true;
	}
	for (let l in split(sh('ip -4 neigh show 2>/dev/null'), '\n')) {
		const m = match(l, /^([0-9.]+) .* lladdr ([0-9a-f:]{17})/);
		if (m && ips[m[1]]) macs[m[2]] = m[1];
	}
	return macs;
}

const schedule = {
	get: {
		call: function() {
			const c = cursor(), st = kv(sh(`${SCHED} state`));
			return {
				wifi: items(c),
				leds: { mode: c.get('lg7200', 'leds', 'mode') ?? 'on', off: c.get('lg7200', 'leds', 'off') ?? '23:00', on: c.get('lg7200', 'leds', 'on') ?? '07:00' },
				restart: { enabled: c.get('lg7200', 'restart', 'enabled') == '1', every: c.get('lg7200', 'restart', 'every') ?? 'daily',
				           day: +(c.get('lg7200', 'restart', 'day') ?? 5), time: c.get('lg7200', 'restart', 'time') ?? '04:00' },
				now: { wifi_all: st.wifi_all ?? 'on', wifi_2g: st.wifi_2g ?? 'on', wifi_5g: st.wifi_5g ?? 'on', wifi_guest: st.wifi_guest ?? 'on', leds: st.leds ?? 'on' },
				// an access point managed by a main router follows its schedules
				managed: c.get('lg7200', 'state', 'mode') == 'ap' && !!c.get('apctl', 'agent', 'token')
			};
		}
	},

	set_wifi: {
		args: { items: [] },
		call: function(req) {
			const list = req.args.items ?? [], e = check_items(list);
			if (e) return { result: false, error: e };
			const c = cursor();
			const old = [];
			c.foreach('lg7200', 'wifisched', s => { push(old, s['.name']); });
			for (let s in old) c.delete('lg7200', s);
			for (let it in list) {
				const s = c.add('lg7200', 'wifisched');
				c.set('lg7200', s, 'target', it.target);
				c.set('lg7200', s, 'days', join(' ', days_of(it.days)));
				c.set('lg7200', s, 'off', it.off);
				c.set('lg7200', s, 'on', it.on);
				c.set('lg7200', s, 'enabled', it.enabled === false ? '0' : '1');
			}
			c.commit('lg7200');
			tick();
			return { result: true };
		}
	},

	set_leds: {
		args: { mode: '', off: '', on: '' },
		call: function(req) {
			const a = req.args;
			if (!(a.mode in [ 'on', 'off', 'night' ])) return { result: false, error: 'invalid_schedule' };
			if (a.mode == 'night' && (!hm_ok(a.off) || !hm_ok(a.on) || a.off == a.on)) return { result: false, error: 'invalid_schedule' };
			const c = cursor();
			if (c.get('lg7200', 'leds') == null) c.set('lg7200', 'leds', 'leds');
			c.set('lg7200', 'leds', 'mode', a.mode);
			if (a.mode == 'night') { c.set('lg7200', 'leds', 'off', a.off); c.set('lg7200', 'leds', 'on', a.on); }
			c.commit('lg7200');
			tick();
			return { result: true };
		}
	},

	set_restart: {
		args: { enabled: false, every: '', day: 0, time: '' },
		call: function(req) {
			const a = req.args, c = cursor();
			if (a.enabled) {
				if (!(a.every in [ 'daily', 'weekly' ]) || !hm_ok(a.time)) return { result: false, error: 'invalid_schedule' };
				if (a.every == 'weekly' && (type(a.day) != 'int' || a.day < 0 || a.day > 6)) return { result: false, error: 'invalid_schedule' };
			}
			if (c.get('lg7200', 'restart') == null) c.set('lg7200', 'restart', 'restart');
			c.set('lg7200', 'restart', 'enabled', a.enabled ? '1' : '0');
			if (a.enabled) {
				c.set('lg7200', 'restart', 'every', a.every);
				c.set('lg7200', 'restart', 'time', a.time);
				if (a.every == 'weekly') c.set('lg7200', 'restart', 'day', `${a.day}`);
			}
			c.commit('lg7200');
			return { result: true };
		}
	},

	preview_wifi: {
		args: { items: [] },
		call: function(req) {
			const list = req.args.items ?? [], e = check_items(list);
			if (e) return { result: false, error: e };
			let bands = {};
			for (let it in list) {
				if (it.enabled === false) continue;
				if (it.target == 'all') { bands['2g'] = bands['5g'] = bands.guest = true; }
				else bands[it.target] = true;
			}
			const st = stations(), mine = admin_macs(), you = [];
			for (let mac, ip in mine)
				if (st[mac] && bands[st[mac]]) push(you, { mac, ip, band: st[mac] });
			return { result: true, you };
		}
	}
};

return { 'virox.schedule': schedule };
