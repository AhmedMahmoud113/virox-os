// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Devices and people (BUILD-PLAN B7, sections 10.3, 10.7 and 10a items 2, 7, 9), in the layout of
// the "البيت" pages of the owner's main router (owner, 2026-11-19): the number tiles, a search
// field and filters, then one card per device with its internet switch; a click on a card opens
// the side sheet with everything for that device or person: internet and pause first, then name,
// person, speed limit, usage limit, daily time, kids mode, temporary site block, wake, fixed
// address, "this is the same device". Values come from virox.fmt (isolated, Arabic units).
// Every action is one virox.homenet call.
'use strict';
'require view';
'require ui';
'require homenet.ui as hn';
'require virox.fmt as fmt';

const SVG = 'http://www.w3.org/2000/svg';
function icon(d, cls) {
	const s = document.createElementNS(SVG, 'svg');
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('class', 'vx-icon' + (cls ? ' ' + cls : ''));
	s.setAttribute('aria-hidden', 'true');
	const p = document.createElementNS(SVG, 'path');
	p.setAttribute('d', d);
	s.appendChild(p);
	return s;
}
const I_CHEV = 'M9 6l6 6-6 6';
const I_WIFI = 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 19.5h.01';
const I_CABLE = 'M4 5h16v10H4zM2 19h20M9 15v4M15 15v4';

const PAUSES = [ 15, 30, 60, 120 ];

return view.extend({
	load() {
		return Promise.all([
			hn.api.devices(), hn.api.people().catch(() => ({ people: [] })),
			hn.api.siteCatalog().catch(() => ({ sites: [] })), hn.api.siteLocks().catch(() => ({ site_locks: [] })),
			hn.api.reservations().catch(() => ({ reservations: [] })),
			hn.api.lines().catch(() => null)
		]).catch(() => null);
	},

	reload() {
		return this.load().then(d => { if (d) { this.data = d; this.draw(); } });
	},

	// ------------------------------------------------------------- one device card
	statusBadges(d) {
		const b = [];
		const now = Date.now() / 1000;
		if (d.held) b.push(hn.badge('warn', _('Waiting for approval')));
		if (d.blocked) b.push(hn.badge('bad', _('Blocked')));
		if (d.paused_until && d.paused_until > now) b.push(hn.badge('warn', E('span', {}, [ _('Paused until'), ' ', fmt.time(d.paused_until) ])));
		if (d.scheduled_off) b.push(hn.badge('warn', _('Off by schedule')));
		if (d.time && d.time.up) b.push(hn.badge('bad', _('Daily time used up')));
		else if (d.time) b.push(hn.badge('info', E('span', {}, [ _('Time left today:'), ' ', fmt.minutes(Math.max(0, d.time.minutes - d.time.used_today)) ])));
		const lim = d.limit || d.person_limit;
		if (lim && lim.up) b.push(hn.badge('bad', _('Usage limit reached')));
		if (d.kids) b.push(hn.badge('info', _('Kids mode')));
		if ((d.site_locks || []).length) b.push(hn.badge('info', _('Sites locked')));
		if (d.speed || d.person_speed) b.push(hn.badge('info', _('Speed limited')));
		return b;
	},

	// restrictions the owner set on this device (the "restricted" filter and tile)
	restricted(d) {
		const now = Date.now() / 1000;
		return !!(d.blocked || (d.paused_until && d.paused_until > now) || d.scheduled_off || d.time || d.limit || d.person_limit ||
			d.kids || (d.site_locks || []).length || d.speed || d.person_speed);
	},

	deviceCard(d) {
		const now = Date.now() / 1000;
		const paused = d.paused_until && d.paused_until > now;
		const on = (d.macs || []).filter(m => m.online);
		const link = on.map(m => m.link)[0];
		const ip = on.map(m => m.ip).filter(x => x)[0] || ((d.macs || []).map(m => m.ip).filter(x => x)[0]);
		const name = hn.deviceName(d);
		// the internet switch of the card: on = not blocked (a held device is allowed from its sheet)
		const sw = E('input', { 'type': 'checkbox', 'role': 'switch', 'aria-label': _('Internet for %s').format(name) });
		sw.checked = !d.blocked && !d.held;
		sw.disabled = !!d.held;
		sw.addEventListener('change', () => {
			sw.disabled = true;
			const pr = sw.checked ? hn.act(hn.api.unblock(d.id), _('Unblocked.')) : hn.act(hn.api.block(d.id), _('Blocked.'));
			pr.then(() => this.reload());
		});
		const toggle = E('label', { 'class': 'vx-toggle', 'title': _('Internet on or off'), 'click': ev => ev.stopPropagation() }, [ sw, E('i') ]);
		const open = () => this.moreDialog(d.id, false);
		return E('article', { 'class': 'vx-device' + (d.online ? ' online' : ' is-off') + ((d.blocked || paused || d.scheduled_off) ? ' is-blocked' : ''),
			'data-id': d.id, 'role': 'button', 'tabindex': '0', 'aria-label': name,
			'click': open, 'keydown': ev => { if (ev.key == 'Enter' || ev.key == ' ') { ev.preventDefault(); open(); } } }, [
			E('div', { 'class': 'vx-dev-head' }, [
				E('span', { 'class': 'vx-dev-icon' }, [ icon(link == 'cable' ? I_CABLE : I_WIFI) ]),
				E('div', { 'class': 'vx-dev-title' }, [
					E('h3', {}, [ E('bdi', { 'dir': 'auto' }, [ name ]) ]),
					E('p', { 'class': 'vx-dev-sub' }, [ E('span', { 'class': 'vx-dot' + (d.online ? ' on' : ''), 'aria-hidden': 'true' }), ' ',
						d.online ? (link == 'wifi' ? _('Online (Wi-Fi)') : _('Online (cable)')) : _('Offline'),
						ip ? E('span', { 'class': 'vx-dev-ip' }, [ fmt.ltr(ip) ]) : '' ]),
					d.person_name ? E('p', { 'class': 'vx-dev-sub' }, [ _('Belongs to'), ' ', E('bdi', { 'dir': 'auto' }, [ d.person_name ]) ]) : '',
					// a router plugged in as a router hides its devices (owner 2026-11-20)
					d.behind_router ? E('p', { 'class': 'vx-dev-sub' }, [ hn.badge('warn', _('Router')), ' ',
						_('The devices behind it are counted together under this name. To see each one, set it to access point mode.') ]) : '',
					// B9 Y3: where the device is, to find weak spots in the house
					d.online && d.where ? E('p', { 'class': 'vx-dev-sub' }, [
						d.where.ap == 'main' ? _('On this router') : fmt.sentence(_('On %s'), [ fmt.name(d.where.name || d.where.ap) ]), ' ',
						hn.badge(d.where.signal >= -60 ? 'ok' : (d.where.signal >= -72 ? 'warn' : 'bad'),
							d.where.signal >= -60 ? _('Strong signal') : (d.where.signal >= -72 ? _('Fair signal') : _('Weak signal'))) ]) : ''
				]),
				toggle
			]),
			E('div', { 'class': 'vx-dev-body' }, [
				E('div', { 'class': 'vx-dev-usage' }, [ E('span', {}, [ _('Today') ]), E('b', {}, [ fmt.bytes(d.usage.today_down + d.usage.today_up) ]) ]),
				E('div', { 'class': 'vx-dev-usage' }, [ E('span', {}, [ _('This cycle') ]), E('b', {}, [ fmt.bytes(d.usage.cycle_down + d.usage.cycle_up) ]) ])
			]),
			E('div', { 'class': 'vx-badges' }, this.statusBadges(d).concat((d.macs || []).length > 1
				? [ hn.badge('muted', fmt.sentence(_('%s device numbers'), [ fmt.ltr(String(d.macs.length)) ])) ] : []))
		]);
	},

	pauseDialog(target, name) {
		const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
		const toMidnight = Math.min(1440, Math.max(1, Math.round((midnight - Date.now()) / 60000)));
		ui.showModal(_('Pause %s').format(name), [
			E('p', {}, [ _('No internet for:') ]),
			E('div', { 'class': 'vx-choice-row' }, PAUSES.map(m => E('button', { 'class': 'btn cbi-button', 'click': () => {
				ui.hideModal(); hn.act(hn.api.pause(target, m), _('Paused.')).then(() => this.reload());
			} }, [ fmt.minutes(m) ])).concat([
				E('button', { 'class': 'btn cbi-button', 'click': () => {
					ui.hideModal(); hn.act(hn.api.pause(target, toMidnight), _('Paused.')).then(() => this.reload());
				} }, [ _('Until midnight') ])
			])),
			E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, [ _('Cancel') ]) ])
		]);
	},

	// ------------------------------------------------------------- "More": one device or person
	moreDialog(target, isPerson) {
		const [ dv, pp, cat, locks, rs, ls ] = this.data;
		const devices = dv.devices, people = pp.people || [];
		const d = isPerson ? null : devices.filter(x => x.id == target)[0];
		const p = isPerson ? people.filter(x => x.id == target)[0] : null;
		if (!d && !p) return;
		const name = d ? hn.deviceName(d) : p.name;
		const sp = d ? d.speed : (dv.devices.map(x => x.person == target ? x.person_speed : null).filter(x => x)[0] || null);
		const lim = d ? d.limit : (dv.devices.map(x => x.person == target ? x.person_limit : null).filter(x => x)[0] || null);
		const kids = d ? (d.kids && !d.kids_via_person) : dv.devices.some(x => x.person == target && x.kids_via_person);
		const tl = d ? d.time : null;
		// the sheet in four short tabs instead of one long list (owner, 2026-11-19)
		const tabsOf = { net: [], limits: [], protect: [], device: [] };
		const add = (g, el) => tabsOf[g].push(el);
		const done = (r) => { if (r && r.result !== false) { ui.hideModal(); this.reload(); } };

		// internet: on or off, pause or resume (a device waiting for approval: allow)
		if (d) {
			const now = Date.now() / 1000;
			const paused = d.paused_until && d.paused_until > now;
			const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
			const toMidnight = Math.min(1440, Math.max(1, Math.round((midnight - Date.now()) / 60000)));
			const sw = E('input', { 'type': 'checkbox', 'role': 'switch' });
			sw.checked = !d.blocked;
			sw.addEventListener('change', () => {
				sw.disabled = true;
				(sw.checked ? hn.act(hn.api.unblock(d.id), _('Unblocked.')) : hn.act(hn.api.block(d.id), _('Blocked.'))).then(done);
			});
			add('net', E('section', { 'class': 'vx-card vx-sheet-internet' }, [
				E('h3', { 'class': 'vx-card-title' }, [ _('Internet') ]),
				d.held ? E('div', { 'class': 'vx-inline' }, [ hn.badge('warn', _('Waiting for approval')),
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.approve(d.id), _('Allowed.')).then(done) }, [ _('Allow') ]) ])
				: E('label', { 'class': 'vx-toggle' }, [ sw, E('i'), E('span', {}, [ d.blocked ? _('The internet is off for this device') : _('The internet is on') ]) ]),
				!d.held && !d.blocked ? (paused
					? E('div', { 'class': 'vx-inline' }, [ hn.badge('warn', E('span', {}, [ _('Paused until'), ' ', fmt.time(d.paused_until) ])),
						E('button', { 'class': 'btn cbi-button small', 'click': () => hn.act(hn.api.resume(d.id), _('Internet is back.')).then(done) }, [ _('Resume') ]) ])
					: E('div', { 'class': 'vx-inline' }, [ E('span', { 'class': 'vx-hint' }, [ _('Pause for:') ]) ].concat(PAUSES.map(m =>
						E('button', { 'class': 'btn cbi-button small', 'click': () => hn.act(hn.api.pause(d.id, m), _('Paused.')).then(done) }, [ fmt.minutes(m) ]))).concat([
						E('button', { 'class': 'btn cbi-button small', 'click': () => hn.act(hn.api.pause(d.id, toMidnight), _('Paused.')).then(done) }, [ _('Until midnight') ]) ]))) : '',
				E('div', { 'class': 'vx-stats' }, [
					E('div', { 'class': 'vx-stat' }, [ E('span', {}, [ _('Today') ]), E('b', {}, [ fmt.bytes(d.usage.today_down + d.usage.today_up) ]) ]),
					E('div', { 'class': 'vx-stat' }, [ E('span', {}, [ _('This cycle') ]), E('b', {}, [ fmt.bytes(d.usage.cycle_down + d.usage.cycle_up) ]) ])
				])
			]));
		}

		// name and person
		if (d) {
			const nm = E('input', { 'id': 'vx-m-name', 'type': 'text', 'maxlength': '40', 'value': d.name || '' });
			const ps = E('select', { 'id': 'vx-m-person' }, [ E('option', { 'value': '' }, [ _('Nobody') ]) ].concat(
				people.map(x => E('option', { 'value': x.id, 'selected': d.person == x.id ? '' : null }, [ x.name ]))));
			add('device', E('fieldset', {}, [
				E('legend', {}, [ _('Name', 'Virox') ]),
				hn.field('vx-m-name', _('Name', 'Virox'), nm),
				hn.field('vx-m-person', _('Belongs to'), ps),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () =>
					hn.act(hn.api.setName(d.id, nm.value), null).then(r => r && r.result !== false &&
						hn.act(hn.api.setPerson(d.id, ps.value), _('Saved.'))).then(done) }, [ _('Save') ])
			]));
		} else {
			const nm = E('input', { 'id': 'vx-m-pname', 'type': 'text', 'maxlength': '40', 'value': p.name });
			add('device', E('fieldset', {}, [
				E('legend', {}, [ _('Name', 'Virox') ]),
				hn.field('vx-m-pname', _('Name', 'Virox'), nm),
				E('div', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.personRename(p.id, nm.value), _('Saved.')).then(done) }, [ _('Save') ]),
					E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Remove %s?').format(p.name), _('The devices stay; only the person and the settings made for the person are removed.'), _('Remove', 'Virox'))
						.then(y => y && hn.act(hn.api.personDelete(p.id), _('Removed.')).then(done)) }, [ _('Remove person') ])
				])
			]));
		}

		// B9 internet line: its own line, both lines, borrowing (R2-R4); only with the second line on
		if (ls && ls.enabled) {
			const st = hn.lineState(ls, [ target ].concat(d && d.person ? [ d.person ] : []));
			const own = E('select', { 'id': 'vx-m-line' }, [ [ 0, _('As the default (%s)').format(hn.lineName(ls.lines[(ls.default_line || 1) - 1])) ],
				[ 1, hn.lineName(ls.lines[0]) ], [ 2, hn.lineName(ls.lines[1]) ] ].map(o => E('option', { 'value': o[0], 'selected': st.line == o[0] ? '' : null }, [ o[1] ])));
			const mins = E('select', { 'id': 'vx-m-lmin' }, [ [ 60, _('1 hour') ], [ 120, _('2 hours') ], [ 'midnight', _('Until midnight') ], [ 0, _('Until I end it') ] ]
				.map(o => E('option', { 'value': o[0] }, [ o[1] ])));
			const bmins = E('select', { 'id': 'vx-m-bmin' }, [ [ 60, _('1 hour') ], [ 120, _('2 hours') ], [ 'midnight', _('Until midnight') ], [ 0, _('No time limit') ] ]
				.map(o => E('option', { 'value': o[0] }, [ o[1] ])));
			const bgb = E('input', { 'id': 'vx-m-bgb', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '0.5', 'dir': 'ltr', 'value': '' });
			const minutesOf = v => {
				if (v != 'midnight') return +v;
				const m = new Date(); m.setHours(24, 0, 0, 0);
				return Math.max(1, Math.round((m - Date.now()) / 60000));
			};
			add('net', E('fieldset', {}, [
				E('legend', {}, [ _('Internet line') ]),
				hn.field('vx-m-line', _('Uses'), own),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.lineAssign(target, +own.value), _('Saved.')).then(done) }, [ _('Save') ]),
				E('h4', {}, [ _('Both lines') ]),
				E('p', { 'class': 'vx-hint' }, [ _('Many downloads together use both lines. One single download stays at the speed of one line.') ]),
				st.both ? E('p', {}, [ hn.badge('ok', _('Using both lines now')) ]) : hn.field('vx-m-lmin', _('For'), mins),
				st.both ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.linesEnd(target), _('Ended.')).then(done) }, [ _('End') ])
					: E('button', { 'class': 'btn cbi-button-action', 'click': () => hn.act(hn.api.linesBoth(target, minutesOf(mins.value)), _('Started.')).then(done) }, [ _('Start') ]),
				E('h4', {}, [ _('Borrow the other line') ]),
				E('p', { 'class': 'vx-hint' }, [ _('For a package that is used up, or when more speed is needed. It ends by itself at the time or amount you set.') ]),
				st.borrow ? E('p', {}, [ hn.badge('warn', _('Borrowing now')) ]) : E('div', {}, [ hn.field('vx-m-bmin', _('For'), bmins), hn.field('vx-m-bgb', _('Up to (GB), empty = no amount limit'), bgb) ]),
				st.borrow ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.linesEnd(target), _('Ended.')).then(done) }, [ _('End') ])
					: E('button', { 'class': 'btn cbi-button-action', 'click': () => hn.act(hn.api.lineBorrow(target, minutesOf(bmins.value), hn.mbFromGb(bgb.value) || 0), _('Started.')).then(done) }, [ _('Start') ])
			]));
		}

		// speed limit (Mbit/s on the page, kbit/s in the API)
		const sd = E('input', { 'id': 'vx-m-sdown', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'max': '1000', 'step': '0.1', 'dir': 'ltr', 'value': sp ? sp.down_kbit / 1000 : '' });
		const su = E('input', { 'id': 'vx-m-sup', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'max': '1000', 'step': '0.1', 'dir': 'ltr', 'value': sp ? sp.up_kbit / 1000 : '' });
		add('limits', E('fieldset', {}, [
			E('legend', {}, [ _('Speed limit') ]),
			E('p', { 'class': 'vx-hint' }, [ isPerson ? _('One limit shared by all devices of this person. Empty or 0 = no limit.') : _('Empty or 0 = no limit.') ]),
			hn.field('vx-m-sdown', _('Download (Mbit/s)'), sd),
			hn.field('vx-m-sup', _('Upload (Mbit/s)'), su),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.speedLimitSet(target,
				Math.round((+sd.value || 0) * 1000), Math.round((+su.value || 0) * 1000)), _('Saved.')).then(done) }, [ _('Save') ])
		]));

		// usage limit per billing cycle (GB on the page, MB in the API)
		const lg = E('input', { 'id': 'vx-m-lgb', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '0.5', 'dir': 'ltr', 'value': lim ? hn.gbFromMb(lim.mb) : '' });
		const lw = E('select', { 'id': 'vx-m-lwarn' }, [ 50, 70, 80, 90, 100 ].map(w => E('option', { 'value': w, 'selected': (lim ? lim.warn : 80) == w ? '' : null }, [ '%d %%'.format(w) ])));
		add('limits', E('fieldset', {}, [
			E('legend', {}, [ _('Usage limit per cycle') ]),
			lim ? E('p', {}, [ fmt.usedOf(lim.used || 0, lim.bytes) ]) : '',
			hn.field('vx-m-lgb', _('Limit (GB), empty or 0 = no limit'), lg),
			hn.field('vx-m-lwarn', _('Warn me at'), lw),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.limitSet(target, hn.mbFromGb(lg.value), +lw.value), _('Saved.')).then(done) }, [ _('Save') ])
		]));

		// daily internet time
		const tm = E('input', { 'id': 'vx-m-time', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'max': '1440', 'step': '5', 'dir': 'ltr', 'value': tl ? tl.minutes : '' });
		add('limits', E('fieldset', {}, [
			E('legend', {}, [ _('Daily internet time') ]),
			E('p', { 'class': 'vx-hint' }, [ _('Only minutes with real use count; a phone lying idle does not use the time.') ]),
			hn.field('vx-m-time', _('Minutes per day, empty or 0 = no limit'), tm),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.timelimitSet(target, Math.round(+tm.value || 0)), _('Saved.')).then(done) }, [ _('Save') ]),
			// extra time for today only (owner 2026-11-22)
			tl ? E('p', { 'class': 'vx-hint' }, [ tl.up ? _('The time of today is used up.') : fmt.sentence(_('Time left today: %s'), [ fmt.minutes(tl.left != null ? tl.left : Math.max(0, tl.minutes - tl.used_today)) ]) ]) : '',
			tl ? E('div', { 'class': 'vx-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.timelimitExtra(target, 30), _('30 more minutes for today.')).then(done) }, [ _('+30 minutes today') ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.timelimitExtra(target, 60), _('One more hour for today.')).then(done) }, [ _('+1 hour today') ])
			]) : ''
		]));

		// kids mode
		add('protect', E('fieldset', {}, [
			E('legend', {}, [ _('Kids mode') ]),
			E('p', { 'class': 'vx-hint' }, [ _('Safe search on Google, Bing and DuckDuckGo, YouTube in restricted mode, adult and kids-blocked sites closed, and the usual ways around the filter closed.') ]),
			d && d.kids_via_person ? E('p', {}, [ _('On through the person.') ]) : E('button', {
				'class': 'btn ' + (kids ? 'cbi-button' : 'cbi-button-positive'),
				'click': () => hn.act(hn.api.kidsSet(target, !kids), kids ? _('Kids mode is off.') : _('Kids mode is on.')).then(r => {
					if (r && r.suggest_policy == 'ask')
						hn.notify(_('Tip: a child can get around the rules by letting the phone show a new device number. On the Control page, under New devices, choose "Ask me first".'), 'warning');
					done(r);
				}) }, [ kids ? _('Turn off') : _('Turn on') ])
		]));

		// sites opened (owner 2026-11-22): kids devices only, loaded when the part is opened
		if (kids || (d && d.kids_via_person)) {
			const box = E('div', { 'class': 'vx-kidsites' }, [ E('p', { 'class': 'vx-hint' }, [ _('Checking…') ]) ]);
			const show = day => hn.api.kidSites(target, day || '').then(r => {
				if (!r || r.result === false) { box.replaceChildren(E('p', { 'class': 'vx-hint' }, [ _('The list could not be read.') ])); return; }
				const chips = (r.days || []).slice(-7).reverse().map(x => E('button', { 'class': 'btn cbi-button', 'aria-pressed': String(x == r.day), 'click': () => show(x) }, [ fmt.date(x) ]));
				box.replaceChildren(
					!r.on ? E('p', { 'class': 'vx-hint' }, [ _('Keeping the list is switched off (Control, Kids mode).') ]) : '',
					chips.length > 1 ? E('div', { 'class': 'vx-chips' }, chips) : '',
					(r.sites || []).length ? E('ul', { 'class': 'vx-list' }, r.sites.slice(0, 100).map(s => E('li', {}, [
						E('span', { 'class': 'vx-name' }, [ s.label ? fmt.name(s.label) : fmt.ltr(s.site), E('br'),
							E('span', { 'class': 'vx-hint' }, [ fmt.sentence(_('From %s to %s'), [ fmt.ltr(s.first), fmt.ltr(s.last) ]) ]) ])
					]))) : hn.empty(_('No site opened on this day.')));
			});
			add('protect', E('fieldset', {}, [
				E('legend', {}, [ _('Sites opened') ]),
				E('p', { 'class': 'vx-hint' }, [ _('Names of the sites and apps this kids device opened, kept for 7 days. Only names, never what was seen.') ]),
				box
			]));
			show('');
		}

		// site lock
		const groups = {};
		(cat.sites || []).forEach(s => { (groups[s.group] = groups[s.group] || []).push(s); });
		const checks = Object.keys(groups).map(g => E('div', { 'class': 'vx-sites' }, groups[g].map(s =>
			E('label', { 'class': 'vx-check' }, [ E('input', { 'type': 'checkbox', 'value': s.id }), ' ', hn.ltr(s.label) ]))));
		// 0 = until it is removed (owner 2026-11-22)
		const lmin = E('select', { 'id': 'vx-m-lmin' }, [ 15, 30, 60, 120, 180, 240, 480, 1440, 0 ].map(m => E('option', { 'value': m, 'selected': m == 60 ? '' : null },
			[ m ? fmt.minutesText(m) : _('Until I remove it') ])));
		const ldom = E('input', { 'id': 'vx-m-ldom', 'type': 'text', 'dir': 'ltr', 'placeholder': 'example.com' });
		const running = (locks.site_locks || []).filter(l => l.target == target);
		add('protect', E('fieldset', {}, [
			E('legend', {}, [ _('Lock sites and apps') ]),
			running.length ? E('ul', { 'class': 'vx-list' }, running.map(l => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ E('bdi', { 'dir': 'ltr' }, [ (l.sites || []).concat(l.domain ? [ l.domain ] : []).join(', ') ]),
					E('br'), E('span', { 'class': 'vx-hint' }, [ l.always ? _('Until you remove it') : fmt.sentence(_('%s left'), [ fmt.minutes(l.minutes_left) ]) ]) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.siteUnlock(l.id), _('Unlocked.')).then(done) }, [ _('Unlock') ])
			]))) : '',
			E('details', {}, [ E('summary', {}, [ _('Choose sites') ]), ...checks ]),
			hn.field('vx-m-ldom', _('Or type a site'), ldom),
			hn.field('vx-m-lmin', _('For'), lmin),
			E('button', { 'class': 'btn cbi-button-positive', 'click': ev => {
				const sites = Array.from(ev.target.closest('fieldset').querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
				hn.act(hn.api.siteLock(target, +lmin.value, sites, ldom.value.trim()), _('Locked.')).then(done);
			} }, [ _('Lock') ])
		]));

		if (d) {
			// wake, fixed address, MACs and "this is the same device"
			const others = devices.filter(x => x.id != d.id);
			const into = E('select', { 'id': 'vx-m-merge' }, [ E('option', { 'value': '' }, [ _('Choose…') ]) ].concat(
				others.map(x => E('option', { 'value': x.id }, [ hn.deviceName(x) ]))));
			const res = (rs.reservations || []).filter(r => (d.macs || []).some(m => m.mac == r.mac))[0];
			const fip = E('input', { 'id': 'vx-m-ip', 'type': 'text', 'dir': 'ltr', 'value': res ? res.ip : '', 'placeholder': '192.168.1.50' });
			add('device', E('fieldset', {}, [
				E('legend', {}, [ _('Device details') ]),
				E('ul', { 'class': 'vx-list vx-macs' }, (d.macs || []).map(m => E('li', {}, [
					E('dl', { 'class': 'vx-usage' }, [
						E('dt', {}, [ 'MAC' ]), E('dd', {}, [ fmt.ltr(m.mac) ]),
						m.ip ? E('dt', {}, [ 'IP' ]) : '', m.ip ? E('dd', {}, [ fmt.ltr(m.ip) ]) : '',
						m.hostname ? E('dt', {}, [ _('Name', 'Virox') ]) : '', m.hostname ? E('dd', {}, [ E('bdi', { 'dir': 'auto' }, [ m.hostname ]) ]) : ''
					])
				]))),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.wake(d.id, ''), _('Start signal sent.')) }, [ _('Switch on (Wake-on-LAN)') ]),
				hn.field('vx-m-ip', _('Fixed address (empty = automatic)'), fip),
				E('button', { 'class': 'btn cbi-button', 'click': () => {
					const mac = (d.macs[0] || {}).mac;
					const pr = fip.value.trim() ? hn.api.reserve(mac, fip.value.trim(), '', !!res) : (res ? hn.api.unreserve(res.mac) : Promise.resolve({ result: true }));
					hn.act(pr, _('Saved.')).then(done);
				} }, [ _('Save address') ]),
				hn.field('vx-m-merge', _('This is the same device as'), into,
					_('For a phone that came back with a new device number: its usage and settings move to the chosen device.')),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => into.value && hn.askConfirm(_('Join the two devices?'), _('This cannot be undone.'), _('Join'))
					.then(y => y && hn.act(hn.api.merge(d.id, into.value), _('Joined.')).then(done)) }, [ _('Join') ])
			]));
			// an old card of a device that is gone (owner 2026-11-20)
			add('device', hn.section(_('Remove from the list'), _('For a device that is gone. Its settings end with it; its usage stays in the totals as "Removed devices". If it connects again it comes back as a new device.'), [], [
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Remove this device from the list?'), _('Its block, limits and schedules end. Its usage stays in the totals.'), _('Remove', 'Virox'))
					.then(y => y && hn.act(hn.api.deviceForget(d.id), _('Removed.')).then(() => { ui.hideModal(); location.reload(); })) }, [ _('Remove from the list') ])
			], { 'class': 'vx-card vx-sec danger' }));
		}

		const sheet = ui.showModal(name, [
			E('button', { 'class': 'btn cbi-button small vx-sheet-close', 'aria-label': _('Close', 'Virox'), 'click': ui.hideModal }, [ '✕' ]),
			E('div', { 'class': 'vx-more' }, [ hn.tabs([
				[ 'net', _('Internet') ], [ 'limits', _('Limits') ], [ 'protect', _('Protection') ], [ 'device', d ? _('Device', 'Virox') : _('Person') ]
			].filter(t => tabsOf[t[0]].length).map(t => ({ id: t[0], label: t[1], pane: E('div', {}, tabsOf[t[0]]) }))) ]),
			E('div', { 'class': 'right' }, [ E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, [ _('Close', 'Virox') ]) ])
		]);
		// the side sheet of the main router's pages (on the side away from the menu)
		if (sheet) sheet.classList.add('vx-drawer');
	},

	// ------------------------------------------------------------- people
	peopleCard() {
		const [ dv, pp ] = this.data;
		const people = pp.people || [];
		const nm = E('input', { 'id': 'vx-p-new', 'type': 'text', 'maxlength': '40', 'placeholder': _('For example: Ahmed') });
		return hn.card(_('People'), [
			E('p', { 'class': 'vx-hint' }, [ _('Put the devices of one person together, then pause, limit or protect all of them at once.') ]),
			people.length ? E('ul', { 'class': 'vx-list' }, people.map(p => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ E('bdi', { 'dir': 'auto' }, [ p.name ]), E('br'), E('span', { 'class': 'vx-hint' }, [ fmt.sentence(_('Devices: %s'), [ fmt.ltr(String(p.devices.length)) ]) ]) ]),
				E('span', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': () => this.pauseDialog(p.id, p.name) }, [ _('Pause') ]),
					E('button', { 'class': 'btn cbi-button', 'click': () => this.moreDialog(p.id, true) }, [ _('More') ])
				])
			]))) : hn.empty(_('No people yet.')),
			E('div', { 'class': 'vx-inline' }, [
				nm,
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.personAdd(nm.value), _('Added.')).then(r => r && r.result !== false && this.reload()) }, [ _('Add person') ])
			])
		]);
	},

	draw() {
		const [ dv ] = this.data;
		const show = this.filter || 'all';
		const q = (this.query || '').toLowerCase();
		const all = dv.devices;
		let list = all.slice();
		if (show == 'online') list = list.filter(d => d.online);
		if (show == 'restricted') list = list.filter(d => this.restricted(d));
		if (q) list = list.filter(d => (hn.deviceName(d) + ' ' + (d.macs || []).map(m => [ m.mac, m.ip, m.hostname ].join(' ')).join(' ')).toLowerCase().indexOf(q) >= 0);
		list.sort((a, b) => (b.online - a.online) || ((b.usage.today_down + b.usage.today_up) - (a.usage.today_down + a.usage.today_up)) || hn.deviceName(a).localeCompare(hn.deviceName(b)));
		const tile = (label, value, cls) => E('div', { 'class': 'vx-stat' + (cls ? ' ' + cls : '') }, [ E('span', {}, [ label ]), E('b', {}, [ value ]) ]);
		if (!this.search) {
			this.search = E('input', { 'type': 'search', 'placeholder': _('Search by device name, IP or MAC'), 'aria-label': _('Search') });
			this.search.addEventListener('input', () => { this.query = this.search.value.trim(); this.draw(); });
		}
		const chips = E('div', { 'class': 'vx-chips', 'role': 'group', 'aria-label': _('Show') }, [
			[ 'all', _('All') ], [ 'online', _('Online now') ], [ 'restricted', _('Restricted') ], [ 'people', _('People') ]
		].map(c => E('button', { 'type': 'button', 'class': 'vx-chip', 'aria-pressed': String(show == c[0]),
			'click': () => { this.filter = c[0]; this.draw(); } }, [ c[1] ])));
		const focused = document.activeElement == this.search;
		this.root.replaceChildren(
			E('h1', {}, [ _('Devices') ]),
			E('p', { 'class': 'vx-sub' }, [ _('Every device in the house. Tap a card to control it: turn its internet off or pause it, limit its speed or usage, and more. The switch on a card turns its internet on or off.') ]),
			E('div', { 'class': 'vx-stats' }, [
				tile(_('Connected now'), fmt.ltr(String(all.filter(d => d.online).length)), 'blue'),
				tile(_('All devices'), fmt.ltr(String(all.length))),
				tile(_('Restricted'), fmt.ltr(String(all.filter(d => this.restricted(d)).length))),
				tile(_('Used today'), fmt.bytes(all.reduce((s, d) => s + d.usage.today_down + d.usage.today_up, 0)))
			]),
			E('div', { 'class': 'vx-toolbar' }, [ this.search, chips ]),
			show == 'people' ? this.peopleCard() : (list.length ? E('div', { 'class': 'vx-device-grid' }, list.map(d => this.deviceCard(d)))
				: hn.empty(q ? _('No device matches.') : (show == 'online' ? _('No device is connected right now.') : (show == 'restricted' ? _('No device has a restriction.') : _('No device has been seen yet.')))))
		);
		if (focused) this.search.focus();
	},

	render(data) {
		if (!data) return hn.failed();
		this.data = data;
		this.root = E('div', { 'class': 'vx-page vx-devices' });
		this.draw();
		// opened from the network map: #dev=<id> opens that device's sheet
		const m = /^#dev=(d[0-9]+)$/.exec(location.hash || '');
		if (m && (data[0].devices || []).some(d => d.id == m[1]))
			setTimeout(() => { history.replaceState(null, '', location.pathname + location.search); this.moreDialog(m[1], false); }, 0);
		// refresh, but never under the user's fingers (typing a name, a sheet open)
		hn.poll(() => {
			const a = document.activeElement;
			if (document.body.classList.contains('modal-overlay-active') || (a && this.root.contains(a) && a.tagName == 'INPUT'))
				return Promise.resolve();
			return this.reload();
		}, 15);
		return this.root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
