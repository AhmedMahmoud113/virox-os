// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, open a port for a device (port forwarding, BUILD-PLAN 15.4 item 2). Router mode only.
// The rule follows the device record, not an address: the device gets a reserved address when the
// rule is added (its current one), and the firewall rule uses whatever address is reserved for it.
//   list                                   rules (with their state), the address of each line and
//                                          whether it can be reached from outside                  (admin)
//   add {device, proto, ext, int, line, name}   proto tcp | udp | both; ext "N" or "N-M" (at most
//                                          1000 ports); int "" (same) or "N" (single ext only);
//                                          line both | 1 | 2 (two lines; both with one)            (admin)
//   set {id, enabled}                      switch one rule off / on                                 (admin)
//   remove {id}                                                                                      (admin)
// The work on the firewall is done by /usr/libexec/homenet/ports apply. Error codes, not sentences.
'use strict';

import { readfile, popen } from 'fs';
import { cursor } from 'uci';

const PORTS = '/usr/libexec/homenet/ports', DATA = '/etc/homenet/data', RUN = '/tmp/homenet';
const MAX_RULES = 64;
// the router's own ports on the WAN side (none listen there today; kept for the clash check)
const OWN = [];

function sh(cmd) { const fd = popen(cmd); if (!fd) return ''; const o = fd.read('all'); fd.close(); return trim(o ?? ''); }
function tsv(path) { return map(filter(split(readfile(path) ?? '', '\n'), l => l != ''), l => split(l, '\t')); }
function mode() { return cursor().get('lg7200', 'state', 'mode') ?? 'router'; }
function two_lines() { return cursor().get('lines', 'main', 'enabled') == '1'; }

function device(id) {
	for (let d in tsv(`${DATA}/devices.tsv`)) if (d[0] == id) return { id: d[0], name: d[1] ?? '' };
	return null;
}
function device_macs(id) {
	let m = {};
	for (let f in [ `${RUN}/device-macs.tsv`, `${DATA}/device-macs.tsv` ])
		for (let r in tsv(f)) if (r[1] == id) m[lc(r[0])] = r[4] ?? '';
	return m;
}
function name_of(id) {
	const d = device(id);
	if (d && d.name) return d.name;
	for (let mac, h in device_macs(id)) if (h) return h;
	return id;
}
function host_of(c, macs) {   // the dhcp host section of one of these MACs
	let found = null;
	c.foreach('dhcp', 'host', s => {
		let m = s.mac; if (type(m) != 'array') m = split(m ?? '', /\s+/);
		for (let x in m) if (macs[lc(x)] != null && !found) found = s;
	});
	return found;
}
function lease_ip(macs) {
	for (let l in split(readfile('/tmp/dhcp.leases') ?? '', '\n')) {
		const f = split(l, ' ');
		if (length(f) >= 3 && macs[lc(f[1])] != null) return f[2];
	}
	return null;
}
function range(s) {
	const m = match(`${s ?? ''}`, /^([0-9]{1,5})(-([0-9]{1,5}))?$/);
	if (!m) return null;
	const lo = +m[1], hi = m[3] ? +m[3] : lo;
	if (lo < 1 || hi > 65535 || hi < lo || hi - lo >= 1000) return null;
	return { lo, hi };
}
function protos(p) { return p == 'both' ? [ 'tcp', 'udp' ] : [ p ]; }
function lines_of(l) { return l == 'both' ? [ '1', '2' ] : [ l ]; }
function overlap(a, b) {
	if (a.hi < b.lo || b.hi < a.lo) return false;
	for (let p in protos(a.proto)) if (p in protos(b.proto))
		for (let l in lines_of(a.line)) if (l in lines_of(b.line)) return true;
	return false;
}
function rules(c) {
	const out = [];
	c.foreach('homenet', 'portfwd', s => { push(out, s); });
	return out;
}
function wan() {
	const out = [];
	for (let l in split(sh(`${PORTS} wan`), '\n')) {
		const f = split(l, ' ');
		if (length(f) == 3) push(out, { line: +f[0], ip: f[1] == '-' ? null : f[1], kind: f[2] });
	}
	return out;
}
function apply() { system(`${PORTS} apply >/dev/null 2>&1`); }

const ports = {
	list: {
		call: function() {
			if (mode() == 'ap') return { router: false, rules: [], wan: [] };
			const c = cursor(), st = {};
			for (let l in split(sh(`${PORTS} status`), '\n')) { const f = split(l, ' '); if (length(f) == 3) st[f[0]] = { state: f[1], ip: f[2] == '-' ? null : f[2] }; }
			const out = [];
			for (let s in rules(c))
				push(out, {
					id: s['.name'], device: s.device, device_name: name_of(s.device), name: s.name ?? '', proto: s.proto, ext: s.ext,
					int: s.int ?? '', line: s.line ?? 'both', enabled: s.enabled != '0',
					state: st[s['.name']]?.state ?? 'off', ip: st[s['.name']]?.ip ?? null
				});
			return { router: true, two_lines: two_lines(), rules: out, wan: wan() };
		}
	},

	add: {
		args: { device: '', proto: '', ext: '', int: '', line: '', name: '' },
		call: function(req) {
			const a = req.args, c = cursor();
			if (mode() == 'ap') return { result: false, error: 'not_router' };
			if (!device(a.device ?? '')) return { result: false, error: 'unknown_device' };
			if (!(a.proto in [ 'tcp', 'udp', 'both' ])) return { result: false, error: 'invalid_proto' };
			const r = range(a.ext);
			if (!r) return { result: false, error: 'invalid_port' };
			let inner = `${a.int ?? ''}`;
			if (inner != '' && (r.lo != r.hi || !range(inner) || range(inner).lo != range(inner).hi)) return { result: false, error: 'invalid_port' };
			const line = two_lines() ? `${a.line || 'both'}` : 'both';
			if (!(line in [ 'both', '1', '2' ])) return { result: false, error: 'invalid_line' };
			const name = `${a.name ?? ''}`;
			if (length(name) > 32 || match(name, /[\t\n\r'"\\]/)) return { result: false, error: 'invalid_name' };
			const all = rules(c);
			if (length(all) >= MAX_RULES) return { result: false, error: 'too_many' };
			const me = { lo: r.lo, hi: r.hi, proto: a.proto, line };
			for (let o in OWN)
				if (overlap(me, { lo: o.lo, hi: o.hi, proto: o.proto, line: 'both' })) return { result: false, error: 'port_router' };
			for (let s in all) {
				const x = range(s.ext);
				if (x && overlap(me, { lo: x.lo, hi: x.hi, proto: s.proto, line: s.line ?? 'both' }))
					return { result: false, error: 'port_taken', by: name_of(s.device) };
			}
			// the rule follows the device: reserve its current address if it has none reserved
			const macs = device_macs(a.device);
			if (!length(keys(macs))) return { result: false, error: 'unknown_device' };
			if (!host_of(c, macs)) {
				const ip = lease_ip(macs);
				if (!ip) return { result: false, error: 'device_offline' };
				const h = c.add('dhcp', 'host');
				c.set('dhcp', h, 'mac', sort(keys(macs))[0]);
				c.set('dhcp', h, 'ip', ip);
				c.set('dhcp', h, 'name', 'vx-port-' + replace(a.device, /[^A-Za-z0-9]/g, ''));
				c.commit('dhcp');
				const rc = system('/usr/libexec/lg7200/dhcp-guard apply >/dev/null 2>&1');
				if (rc == 2) return { result: false, error: 'dhcp_restored' };
			}
			// a named section (pf<n>): unnamed sections get new generated names when another one is
			// deleted, and the id the page holds would point to another rule
			let n = +(c.get('homenet', 'main', 'pf_next') ?? 1);
			while (c.get('homenet', `pf${n}`) != null) n++;
			const id = `pf${n}`;
			c.set('homenet', id, 'portfwd');
			c.set('homenet', 'main', 'pf_next', `${n + 1}`);
			c.set('homenet', id, 'device', a.device);
			c.set('homenet', id, 'proto', a.proto);
			c.set('homenet', id, 'ext', r.lo == r.hi ? `${r.lo}` : `${r.lo}-${r.hi}`);
			if (inner != '' && +inner != r.lo) c.set('homenet', id, 'int', inner);
			c.set('homenet', id, 'line', line);
			c.set('homenet', id, 'name', name);
			c.set('homenet', id, 'enabled', '1');
			c.commit('homenet');
			apply();
			return { result: true, id };
		}
	},

	set: {
		args: { id: '', enabled: true },
		call: function(req) {
			const c = cursor();
			if (c.get('homenet', req.args.id ?? '') != 'portfwd') return { result: false, error: 'unknown_rule' };
			c.set('homenet', req.args.id, 'enabled', req.args.enabled ? '1' : '0');
			c.commit('homenet');
			apply();
			return { result: true };
		}
	},

	remove: {
		args: { id: '' },
		call: function(req) {
			const c = cursor();
			if (c.get('homenet', req.args.id ?? '') != 'portfwd') return { result: false, error: 'unknown_rule' };
			c.delete('homenet', req.args.id);
			c.commit('homenet');
			apply();
			return { result: true };
		}
	}
};

return { 'virox.ports': ports };
