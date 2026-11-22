// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, computers (owner 2026-11-20: "very important"): shut down, restart, sleep, hibernate,
// lock, sign out or cancel a shutdown of a computer in the house from the router's pages. A router
// cannot do that by itself: a small Virox program on the computer (virox-pc.ps1, Windows) asks the
// router every few seconds whether there is a command for it, so nothing listens on the computer and
// no firewall rule is needed. It does only the fixed commands below, nothing else.
//
//   list                         computers: name, online, last command and its result      (admin)
//   code                         a 6-digit code, valid 10 minutes, for the setup file       (admin)
//   command {id, cmd}            shutdown | restart | sleep | hibernate | lock | signout | cancel (admin)
//   rename {id, name}, forget {id}                                                         (admin)
//   pair {code, name, host}      the program links itself (anonymous; the code is the proof) -> {id, token}
//   poll {id, token, host, user, macs, uptime, result}   the program asks for a command and reports
//                                the result of the previous one (anonymous; the token is the proof)
// Computers: uci homenet.<id>=pc (name, token, host); state in RAM, /tmp/homenet/pc/<id>.json.

'use strict';

import { readfile, writefile, mkdir, unlink } from 'fs';
import { cursor } from 'uci';

const RUN = '/tmp/homenet/pc';
const CMDS = [ 'shutdown', 'restart', 'sleep', 'hibernate', 'lock', 'signout', 'cancel' ];
const MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

function rnd(n) { return hexenc(readfile('/dev/urandom', n) ?? ''); }
// same length, every character compared
function same(a, b) {
	if (type(a) != 'string' || type(b) != 'string' || length(a) != length(b) || !length(a)) return false;
	let d = 0;
	for (let i = 0; i < length(a); i++) d |= ord(a, i) ^ ord(b, i);
	return d == 0;
}
// (control characters by class: a \x00 in the pattern ends it for the regex library)
function clean(s, n) { return substr(replace(`${s ?? ''}`, /[[:cntrl:]"\\]/g, ' '), 0, n); }
function state(id) { return json(readfile(`${RUN}/${id}.json`) ?? 'null') ?? {}; }
function state_write(id, st) { mkdir('/tmp/homenet'); mkdir(RUN); writefile(`${RUN}/${id}.json`, sprintf('%J', st)); }
function pcs() {
	const out = [];
	cursor().foreach('homenet', 'pc', s => { push(out, s); });
	return out;
}
function is_pc(c, id) { return match(id ?? '', /^pc[0-9]+$/) && c.get('homenet', id) == 'pc'; }
// the homenet device of a computer, by one of the MACs it reported
function device_of(macs) {
	const want = {};
	for (let m in macs ?? []) want[m] = true;
	for (let l in split(readfile('/tmp/homenet/device-macs.tsv') ?? readfile('/etc/homenet/data/device-macs.tsv') ?? '', '\n')) {
		const f = split(l, '\t');
		if (want[f[0]]) return f[1];
	}
	return null;
}

const pc = {
	list: {
		call: function() {
			const now = time(), out = [];
			for (let s in pcs()) {
				const st = state(s['.name']);
				push(out, {
					id: s['.name'], name: s.name ?? '', host: s.host ?? '', user: st.user ?? '',
					online: now - (st.seen ?? 0) < 20, seen: st.seen ?? null, macs: st.macs ?? [],
					device: device_of(st.macs), pending: st.pending?.cmd ?? null, last: st.last ?? null
				});
			}
			return { pcs: out, commands: CMDS };
		}
	},

	code: {
		call: function() {
			mkdir('/tmp/homenet'); mkdir(RUN);
			const b = readfile('/dev/urandom', 4) ?? '\0\0\0\0';
			const code = sprintf('%06d', ((ord(b, 0) << 16) | (ord(b, 1) << 8) | ord(b, 2)) % 1000000);
			writefile(`${RUN}/code`, sprintf('%s %d 0\n', code, time() + 600));
			return { result: true, code: code, minutes: 10 };
		}
	},

	command: {
		args: { id: '', cmd: '' },
		call: function(req) {
			const c = cursor(), id = req.args.id, cmd = req.args.cmd;
			if (!is_pc(c, id)) return { result: false, error: 'unknown_pc' };
			if (!(cmd in CMDS)) return { result: false, error: 'invalid_command' };
			const st = state(id);
			if (time() - (st.seen ?? 0) >= 20) return { result: false, error: 'offline' };
			st.pending = { cmd: cmd, nonce: rnd(8), at: time() };
			state_write(id, st);
			return { result: true };
		}
	},

	rename: {
		args: { id: '', name: '' },
		call: function(req) {
			const c = cursor(), id = req.args.id, name = clean(req.args.name, 40);
			if (!is_pc(c, id)) return { result: false, error: 'unknown_pc' };
			if (!length(trim(name))) return { result: false, error: 'invalid_name' };
			c.set('homenet', id, 'name', trim(name)); c.commit('homenet');
			return { result: true };
		}
	},

	forget: {
		args: { id: '' },
		call: function(req) {
			const c = cursor(), id = req.args.id;
			if (!is_pc(c, id)) return { result: false, error: 'unknown_pc' };
			// the program finds out at its next question (unknown_pc) and removes itself
			c.delete('homenet', id); c.commit('homenet');
			unlink(`${RUN}/${id}.json`);
			return { result: true };
		}
	},

	pair: {
		args: { code: '', name: '', host: '' },
		call: function(req) {
			const f = split(trim(readfile(`${RUN}/code`) ?? ''), ' ');
			if (length(f) != 3 || +f[1] < time()) return { result: false, error: 'no_code' };
			if (!same(`${req.args.code}`, f[0])) {
				// five wrong tries end the code
				if (+f[2] >= 4) unlink(`${RUN}/code`);
				else writefile(`${RUN}/code`, sprintf('%s %s %d\n', f[0], f[1], +f[2] + 1));
				return { result: false, error: 'wrong_code' };
			}
			unlink(`${RUN}/code`);
			const c = cursor(), host = clean(req.args.host, 40);
			let n = +(c.get('homenet', 'main', 'next_pc') ?? 1);
			const id = `pc${n}`, token = rnd(16);
			c.set('homenet', 'main', 'next_pc', `${n + 1}`);
			c.set('homenet', id, 'pc');
			c.set('homenet', id, 'name', length(trim(clean(req.args.name, 40))) ? trim(clean(req.args.name, 40)) : (host || id));
			c.set('homenet', id, 'host', host);
			c.set('homenet', id, 'token', token);
			c.commit('homenet');
			system(`logger -t homenet "computer ${id} (${replace(host, /[^A-Za-z0-9._-]/g, '')}) linked"`);
			return { result: true, id: id, token: token };
		}
	},

	poll: {
		args: { id: '', token: '', host: '', user: '', macs: [], uptime: 0, result: {} },
		call: function(req) {
			const c = cursor(), a = req.args;
			if (!is_pc(c, a.id) || !same(a.token, c.get('homenet', a.id, 'token'))) return { result: false, error: 'unknown_pc' };
			const st = state(a.id), now = time();
			st.seen = now; st.user = clean(a.user, 40); st.uptime = +a.uptime;
			st.macs = filter(map(type(a.macs) == 'array' ? slice(a.macs, 0, 8) : [], m => lc(replace(`${m}`, /-/g, ':'))), m => match(m, MAC));
			if (length(clean(a.host, 40)) && c.get('homenet', a.id, 'host') != clean(a.host, 40)) { c.set('homenet', a.id, 'host', clean(a.host, 40)); c.commit('homenet'); }
			// the result of the command it got before
			const r = a.result;
			if (type(r) == 'object' && st.sent && same(`${r.nonce ?? ''}`, st.sent.nonce)) {
				st.last = { cmd: st.sent.cmd, ok: !!r.ok, error: r.ok ? null : clean(r.error, 40), at: now };
				delete st.sent;
			}
			// a command waits 2 minutes at most (the computer may have gone off)
			if (st.pending && now - st.pending.at > 120) {
				st.last = { cmd: st.pending.cmd, ok: false, error: 'not_picked_up', at: now };
				delete st.pending;
			}
			let cmd = null;
			if (st.pending) { cmd = { name: st.pending.cmd, nonce: st.pending.nonce }; st.sent = st.pending; delete st.pending; }
			state_write(a.id, st);
			return { result: true, cmd: cmd, interval: 3 };
		}
	}
};

return { 'virox.pc': pc };
