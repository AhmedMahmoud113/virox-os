// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, two internet lines (BUILD-PLAN B9, docs/dualwan-spec.md section 8). Admin only.
// Error codes, not sentences: every client translates them.
//
//   virox.lines  status                                   both lines: on/off, up/down, use,
//                                                         package, forecast; assignments
//                enable {on}                              second line on (port -> wan2) / off
//                set_line {id, name, colour, package_mb, renew_day, warn, up_kbit, down_kbit}
//                renewed {id}                             package renewed early (new cycle)
//                calibrate {id, remaining_mb}             remaining at the ISP
//                set_default {line}                       the line of devices nobody assigned (spec 4.4)
//                assign {target, line}                    own line of a device / person (0 = default)
//                both {target, minutes}                   both lines (target "all" = everyone)
//                borrow {target, minutes, mb}             the other line, limited, ends by itself
//                end {target}                             end both / borrowing of a target
//                speedtest {id}                           download speed of one line (X3)

'use strict';

import { readfile, popen } from 'fs';
import { cursor } from 'uci';

const CMD = '/usr/libexec/homenet/lines';
const DATA = '/etc/homenet/data', RUN = '/tmp/homenet/lines';

function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }
function run(...args) {
	const fd = popen(join(' ', [ CMD, ...map(args, shq) ]) + ' >/dev/null 2>&1; echo $?');
	if (!fd) return false;
	const rc = trim(fd.read('all') ?? '');
	fd.close();
	return rc == '0';
}
function tsv(path) {
	return map(filter(split(readfile(path) ?? '', '\n'), l => l != ''), l => split(l, '\t'));
}
function ok(r) { return r ? { result: true } : { result: false, error: 'failed' }; }
function valid_target(t, all) { return (all && t == 'all') || match(t ?? '', /^[dp][0-9]+$/); }
function valid_line(id) { return id == 1 || id == 2 || id == '1' || id == '2'; }
// a line is shaped when its device has the cake qdisc (lines ln_shaper): only then do games and
// calls go first; one line is shaped after "Measure and adjust" (2026-11-21: the page said
// "always on" also when it was not)
function shaped(iface) {
	const fd = popen(`d=$(ubus call network.interface.${shq(iface)} status 2>/dev/null | jsonfilter -e @.l3_device); [ -n "$d" ] && tc qdisc show dev "$d" root 2>/dev/null | grep -c cake`);
	const n = +trim(fd?.read('all') ?? '0'); fd?.close();
	return n > 0;
}

const lines = {
	status: {
		call: function() {
			const c = cursor();
			const health = {};
			for (let l in split(readfile(`${RUN}/health`) ?? '', '\n')) {
				const f = split(l, ' ');
				if (length(f) == 2) health[f[0]] = f[1];
			}
			const usage = {};
			for (let f in tsv(`${RUN}/usage.tsv`) ?? []) usage[f[0]] = { cycle_start: f[1], used: +f[2] };
			const days = tsv(`${RUN}/days.tsv`);
			const lt = localtime();
			const today = sprintf('%04d-%02d-%02d', lt.year, lt.mon, lt.mday);
			const out = [];
			for (let id in [ 1, 2 ]) {
				const s = c.get_all('lines', `line${id}`) ?? {};
				const pkg = (+(s.package_mb ?? 0)) * 1048576;
				const used = usage[`${id}`]?.used ?? 0;
				// forecast (X2): average of the last 7 full days
				const past = filter(days, d => d[1] == `${id}` && d[0] != today);
				const last7 = slice(past, -7);
				let per_day = 0;
				for (let d in last7) per_day += +d[2];
				per_day = length(last7) ? per_day / length(last7) : 0;
				out[id - 1] = {
					id: id, iface: s.iface, name: s.name ?? '', colour: s.colour ?? '',
					up: (health[`${id}`] ?? 'up') == 'up',
					package_mb: +(s.package_mb ?? 0), renew_day: +(s.renew_day ?? 1), warn: +(s.warn ?? 80),
					up_kbit: +(s.up_kbit ?? 30000), down_kbit: +(s.down_kbit ?? 30000),
					// the line is shaped now (cake on its device): games and calls go first
					shaping: shaped(s.iface ?? (id == 1 ? 'wan' : 'wan2')),
					used_mb: int(used / 1048576), cycle_start: usage[`${id}`]?.cycle_start,
					today_mb: int((+(filter(days, d => d[1] == `${id}` && d[0] == today)[0]?.[2] ?? 0)) / 1048576),
					used_up: pkg > 0 && used >= pkg,
					days_left: (pkg > 0 && per_day > 0) ? int((pkg > used ? pkg - used : 0) / per_day) : null
				};
			}
			const now = time();
			const assigns = map(filter(tsv(`${DATA}/lines-assign.tsv`), a => a[1] == 'line' || +a[3] == 0 || +a[3] > now), a => ({
				target: a[0], kind: a[1], line: a[1] == 'line' ? +a[2] : null,
				minutes_left: +a[3] ? int((+a[3] - now) / 60) : null,
				mb_limit: +a[4] ? int(+a[4] / 1048576) : null
			}));
			// the line each MAC uses now (owner 2026-11-23: "show me which line each device is on"):
			// the same plan the routing is built from (lines plan: own line, person, default, both,
			// borrowing, a line that is down or used up), mac -> l1 | l2 | both | stop
			const enabled = c.get('lines', 'main', 'enabled') == '1';
			const plan = {};
			if (enabled) {
				const fd = popen('/usr/libexec/homenet/lines plan 2>/dev/null');
				if (fd) {
					for (let l in split(fd.read('all') ?? '', '\n')) {
						const p = split(l, '\t');
						if (length(p) == 2 && match(lc(p[0]), /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/) && match(p[1], /^(l1|l2|both|stop)$/))
							plan[lc(p[0])] = p[1];
					}
					fd.close();
				}
			}
			return {
				enabled: enabled,
				default_line: +(c.get('lines', 'main', 'default_line') ?? 1),
				lines: out, assignments: assigns, plan: plan
			};
		}
	},

	enable: {
		args: { on: false },
		call: function(req) { return ok(run(req.args.on ? 'enable' : 'disable')); }
	},

	set_line: {
		// the numbers are numbers (the page sends numbers; ubus refuses another type with
		// "Invalid argument" before the method runs); one left out is not changed
		args: { id: 0, name: '', colour: '', package_mb: 0, renew_day: 0, warn: 0, up_kbit: 0, down_kbit: 0 },
		call: function(req) {
			const a = req.args;
			if (!valid_line(a.id)) return { result: false, error: 'invalid_line' };
			const c = cursor(), s = `line${a.id}`;
			if (a.name != null && a.name != '') {
				if (length(a.name) > 32 || match(a.name, /[\t\n]/)) return { result: false, error: 'invalid_name' };
				c.set('lines', s, 'name', a.name);
			}
			if (a.colour) {
				if (!match(a.colour, /^#[0-9a-fA-F]{6}$/)) return { result: false, error: 'invalid_colour' };
				c.set('lines', s, 'colour', a.colour);
			}
			for (let k in [ [ 'package_mb', 0, 10485760 ], [ 'renew_day', 1, 31 ], [ 'warn', 50, 99 ], [ 'up_kbit', 1000, 10000000 ], [ 'down_kbit', 1000, 10000000 ] ]) {
				const v = a[k[0]];
				if (v == null) continue;
				if (!match(`${v}`, /^[0-9]+$/) || +v < k[1] || +v > k[2]) return { result: false, error: `invalid_${k[0]}` };
				c.set('lines', s, k[0], `${+v}`);
			}
			c.commit('lines');
			return ok(run('apply'));
		}
	},

	renewed: {
		args: { id: 0 },
		call: function(req) { return valid_line(req.args.id) ? ok(run('renewed', `${req.args.id}`)) : { result: false, error: 'invalid_line' }; }
	},

	calibrate: {
		args: { id: 0, remaining_mb: 0 },
		call: function(req) {
			if (!valid_line(req.args.id)) return { result: false, error: 'invalid_line' };
			const r = +req.args.remaining_mb;
			if (!(r >= 0)) return { result: false, error: 'invalid_remaining' };
			if (!+cursor().get('lines', `line${req.args.id}`, 'package_mb')) return { result: false, error: 'no_package' };
			return ok(run('calibrate', `${req.args.id}`, `${int(r)}`));
		}
	},

	assign: {
		args: { target: '', line: 0 },
		call: function(req) {
			if (!valid_target(req.args.target, false)) return { result: false, error: 'invalid_target' };
			const l = +req.args.line;
			if (!(l == 0 || l == 1 || l == 2)) return { result: false, error: 'invalid_line' };
			return ok(run('assign', req.args.target, 'line', `${l}`, '0', '0'));
		}
	},

	// the line of devices nobody assigned yet, new devices included (spec 4.4)
	set_default: {
		args: { line: 0 },
		call: function(req) {
			const l = +req.args.line;
			if (!(l == 1 || l == 2)) return { result: false, error: 'invalid_line' };
			const c = cursor();
			c.set('lines', 'main', 'default_line', `${l}`);
			c.commit('lines');
			return ok(run('apply'));
		}
	},

	both: {
		args: { target: '', minutes: 0 },
		call: function(req) {
			if (!valid_target(req.args.target, true)) return { result: false, error: 'invalid_target' };
			const m = +req.args.minutes;
			if (!(m >= 0 && m <= 43200)) return { result: false, error: 'invalid_minutes' };
			return ok(run('assign', req.args.target, 'both', '-', `${int(m)}`, '0'));
		}
	},

	borrow: {
		args: { target: '', minutes: 0, mb: 0 },
		call: function(req) {
			if (!valid_target(req.args.target, false)) return { result: false, error: 'invalid_target' };
			const m = +req.args.minutes, mb = +req.args.mb;
			if (!(m >= 0 && m <= 43200) || !(mb >= 0 && mb <= 10485760)) return { result: false, error: 'invalid_limit' };
			// R3: borrowing is always limited, by time or by volume
			if (!m && !mb) return { result: false, error: 'limit_required' };
			return ok(run('assign', req.args.target, 'borrow', '-', `${int(m)}`, `${int(mb)}`));
		}
	},

	speedtest: {
		args: { id: 0 },
		call: function(req) {
			if (!valid_line(req.args.id)) return { result: false, error: 'invalid_line' };
			const fd = popen(`${CMD} speedtest ${+req.args.id} 2>/dev/null`);
			const out = trim(fd?.read('all') ?? ''); fd?.close();
			const m = match(out, /^OK ([0-9]+)$/);
			if (m) return { result: true, down_kbit: +m[1] };
			const e = match(out, /^ERR ([a-z_]+)/);
			return { result: false, error: e ? e[1] : 'failed' };
		}
	},

	// P5 "adjust ping automatically": measure download and upload, then shape at about 90 % (one
	// line works too). About 20 s, so it runs in the background: tune starts it, tune_state tells
	tune: {
		args: { id: 0 },
		call: function(req) {
			if (!valid_line(req.args.id)) return { result: false, error: 'invalid_line' };
			const fd = popen(`${CMD} tune ${+req.args.id} 2>/dev/null`);
			const out = trim(fd?.read('all') ?? ''); fd?.close();
			if (out == 'OK started') return { result: true, state: 'running' };
			const e = match(out, /^ERR ([a-z_]+)/);
			return { result: false, error: e ? e[1] : 'failed' };
		}
	},
	tune_state: {
		args: { id: 0 },
		call: function(req) {
			if (!valid_line(req.args.id)) return { result: false, error: 'invalid_line' };
			const fd = popen(`${CMD} tune-state ${+req.args.id} 2>/dev/null`);
			const out = trim(fd?.read('all') ?? ''); fd?.close();
			if (out == 'RUN') return { state: 'running' };
			const m = match(out, /^OK ([0-9]+) ([0-9]+)$/);
			if (m) return { state: 'done', down_kbit: +m[1], up_kbit: +m[2] };
			const e = match(out, /^ERR ([a-z_]+)/);
			return { state: e && e[1] == 'none' ? 'none' : 'failed', error: e ? e[1] : 'failed' };
		}
	},

	end: {
		args: { target: '' },
		call: function(req) {
			if (!valid_target(req.args.target, true)) return { result: false, error: 'invalid_target' };
			return ok(run('assign', req.args.target, 'off', '-', '0', '0'));
		}
	}
};

return { 'virox.lines': lines };
