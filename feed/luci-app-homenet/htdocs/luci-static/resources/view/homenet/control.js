// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Control (BUILD-PLAN B7): everything that limits or protects, in one place, one section at a
// time (a phone screen is small): schedules, daily time (with the "active minute" threshold of
// B7.3d), speed and usage limits, kids mode, site locks, the house filter (B7.3e item 2 list
// sizes) and the new-devices policy. Per-device settings are also under Devices, "More".
// 10a: a row shows its name on one line and each detail on its own line (no "·" joins); values
// come from virox.fmt.
'use strict';
'require view';
'require ui';
'require homenet.ui as hn';
'require virox.fmt as fmt';

// one list row: a name, then each detail on its own line
function rowText(title, lines) {
	const out = [ E('strong', {}, [ title ]) ];
	lines.filter(l => l).forEach(l => out.push(E('span', { 'class': 'vx-row-line' }, [ l ])));
	return E('span', { 'class': 'vx-name vx-rows' }, out);
}

// owner 2026-11-19: seven tabs and forms always open were too much. Four tabs; a tab shows the
// lists of its parts, and the form of a new entry opens in a dialog only after "Add".
const GROUPS = [
	[ 'times', [ 'schedules', 'time' ] ],
	[ 'limits', [ 'limits' ] ],
	[ 'sites', [ 'kids', 'locks', 'filter' ] ],
	[ 'newdev', [ 'newdev' ] ]
];

function plusIcon() {
	const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('class', 'vx-icon'); e.setAttribute('aria-hidden', 'true');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M12 5v14M5 12h14'); e.appendChild(p);
	return e;
}

return view.extend({
	load() {
		return Promise.all([
			hn.api.devices(), hn.api.people(), hn.api.schedules(), hn.api.timelimits(), hn.api.settings(),
			hn.api.speedLimits(), hn.api.limits(), hn.api.kids(), hn.api.siteLocks(), hn.api.filter(),
			hn.api.aps().catch(() => null)
		]).catch(() => null);
	},

	reload() { return this.load().then(d => { if (d) { this.data = d; this.draw(); } }); },
	done() { return r => { if (r && r.result !== false) { ui.hideModal(); this.reload(); } return r; }; },

	// a form under a list: its title becomes an "add" button that opens the form in a dialog
	folded(nodes) {
		return nodes.map(n => {
			if (!(n instanceof Element) || n.tagName != 'FIELDSET') return n;
			const legend = n.querySelector('legend');
			const label = legend ? legend.textContent : _('Add', 'Virox');
			if (legend) legend.remove();
			// the form's own button (Add, Save) goes to the bottom row, next to Close
			const go = [...n.children].filter(c => c.tagName == 'BUTTON').pop();
			if (go) go.remove();
			return E('div', { 'class': 'vx-add-row' }, [
				E('button', { 'class': 'btn cbi-button-action vx-add', 'click': () => ui.showModal(label, [ n,
					E('div', { 'class': 'button-row' }, [ E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, [ _('Close', 'Virox') ]), go || '' ]) ]) },
					[ plusIcon(), E('span', {}, [ label ]) ]) ]);
		});
	},
	tn(id) { return fmt.name(hn.targetName(id, this.data[0].devices, this.data[1].people)); },

	// ------------------------------------------------------------- schedules
	schedules() {
		const [ dv, pp, sc ] = this.data;
		const DAYS = hn.DAY_NAMES();
		const dayBoxes = E('div', { 'class': 'vx-days' }, DAYS.map((n, i) =>
			E('label', { 'class': 'vx-check' }, [ E('input', { 'type': 'checkbox', 'value': i, 'checked': (i >= 0 && i <= 4) ? '' : null }), ' ', n ])));
		const tgt = hn.targetSelect('vx-s-target', dv.devices, pp.people);
		const st = E('input', { 'id': 'vx-s-start', 'type': 'time', 'value': '22:00', 'dir': 'ltr' });
		const en = E('input', { 'id': 'vx-s-end', 'type': 'time', 'value': '07:00', 'dir': 'ltr' });
		const lb = E('input', { 'id': 'vx-s-label', 'type': 'text', 'maxlength': '60', 'placeholder': _('For example: bedtime') });
		const list = (sc.schedules || []).map(s => E('li', {}, [
			rowText(s.label ? fmt.name(s.label) : this.tn(s.target), [
				s.label ? this.tn(s.target) : '',
				s.days.split('').map(i => DAYS[+i]).join('، '),
				fmt.sentence(_('From %s to %s'), [ fmt.ltr(s.start), fmt.ltr(s.end) ]),
				s.active ? hn.badge('warn', _('In force now')) : ''
			]),
			E('span', { 'class': 'vx-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.scheduleEnable(s.id, !s.enabled), null).then(this.done()) },
					[ s.enabled ? _('Switch off') : _('Switch on') ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.scheduleRemove(s.id), _('Removed.')).then(this.done()) }, [ _('Remove', 'Virox') ])
			])
		]));
		return [
			E('p', { 'class': 'vx-hint' }, [ _('No internet on the chosen days between the two times. An end before the start runs past midnight.') ]),
			list.length ? E('ul', { 'class': 'vx-list' }, list) : hn.empty(_('No schedule yet.')),
			E('fieldset', {}, [
				E('legend', {}, [ _('New schedule') ]),
				hn.field('vx-s-target', _('For'), tgt),
				E('div', { 'class': 'vx-field' }, [ E('span', { 'class': 'vx-label' }, [ _('Days') ]), dayBoxes ]),
				hn.field('vx-s-start', _('From'), st), hn.field('vx-s-end', _('To'), en), hn.field('vx-s-label', _('Name (optional)'), lb),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
					const days = Array.from(dayBoxes.querySelectorAll('input:checked')).map(c => c.value).join('');
					hn.act(hn.api.scheduleAdd(tgt.value, days, st.value, en.value, lb.value), _('Added.')).then(this.done());
				} }, [ _('Add', 'Virox') ])
			])
		];
	},

	// ------------------------------------------------------------- daily time (B7.3d threshold here)
	time() {
		const [ dv, pp, , tl, set ] = this.data;
		const tgt = hn.targetSelect('vx-t-target', dv.devices, pp.people);
		const mins = E('input', { 'id': 'vx-t-min', 'type': 'number', 'lang': 'en', 'inputmode': 'numeric', 'min': '5', 'max': '1440', 'step': '5', 'dir': 'ltr', 'value': '120' });
		const kb = E('input', { 'id': 'vx-t-kb', 'type': 'number', 'lang': 'en', 'inputmode': 'numeric', 'min': '1', 'max': '10000', 'dir': 'ltr', 'value': set.active_kb });
		return [
			(tl.timelimits || []).length ? E('ul', { 'class': 'vx-list' }, tl.timelimits.map(t => E('li', {}, [
				rowText(this.tn(t.target), [
					fmt.sentence(_('%s a day'), [ fmt.minutes(t.minutes) ]),
					t.extra_today ? fmt.sentence(_('Extra today: %s'), [ fmt.minutes(t.extra_today) ]) : '',
					fmt.sentence(_('Used today: %s'), [ fmt.minutes(t.used_today) ]),
					t.up ? hn.badge('bad', _('Used up')) : '' ]),
				E('span', { 'class': 'vx-actions' }, [
					// extra time for today only (owner 2026-11-22)
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.timelimitExtra(t.target, 30), _('30 more minutes for today.')).then(this.done()) }, [ _('+30 minutes today') ]),
					E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.timelimitExtra(t.target, 60), _('One more hour for today.')).then(this.done()) }, [ _('+1 hour today') ]),
					E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.timelimitSet(t.target, 0), _('Removed.')).then(this.done()) }, [ _('Remove', 'Virox') ])
				])
			]))) : hn.empty(_('No daily time limit yet.')),
			E('fieldset', {}, [
				E('legend', {}, [ _('New daily time') ]),
				hn.field('vx-t-target', _('For'), tgt), hn.field('vx-t-min', _('Minutes per day'), mins),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.timelimitSet(tgt.value, Math.round(+mins.value || 0)), _('Saved.')).then(this.done()) }, [ _('Save') ])
			]),
			E('fieldset', {}, [
				E('legend', {}, [ _('What counts as a minute of use') ]),
				E('p', { 'class': 'vx-hint' }, [ _('A minute counts only when the device moved more than this much data in it. Phones send small amounts in the background all the time; those minutes do not count.') ]),
				hn.field('vx-t-kb', _('KB in a minute (normally 40)'), kb),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.settingsSet(undefined, undefined, undefined, Math.round(+kb.value || 0)), _('Saved.')).then(this.done()) }, [ _('Save') ])
			])
		];
	},

	// ------------------------------------------------------------- speed and usage limits (overview)
	limits() {
		const [ , , , , , sp, lm ] = this.data;
		const speeds = sp.speed_limits || [], limits = lm.limits || [];
		return [
			E('p', { 'class': 'vx-hint' }, [ _('Set these per device or person on the Devices page, under More.') ]),
			E('h3', {}, [ _('Speed limits') ]),
			speeds.length ? E('ul', { 'class': 'vx-list' }, speeds.map(s => E('li', {}, [
				rowText(this.tn(s.target), [
					fmt.sentence(_('Download: %s'), [ s.down_kbit ? fmt.speed(s.down_kbit) : _('no limit') ]),
					fmt.sentence(_('Upload: %s'), [ s.up_kbit ? fmt.speed(s.up_kbit) : _('no limit') ]) ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.speedLimitSet(s.target, 0, 0), _('Removed.')).then(this.done()) }, [ _('Remove', 'Virox') ])
			]))) : hn.empty(_('No speed limit.')),
			E('h3', {}, [ _('Usage limits per cycle') ]),
			limits.length ? E('ul', { 'class': 'vx-list' }, limits.map(l => E('li', {}, [
				rowText(this.tn(l.target), [ fmt.usedOf(l.used || 0, l.bytes), l.up ? hn.badge('bad', _('Reached')) : '' ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.limitSet(l.target, 0, 80), _('Removed.')).then(this.done()) }, [ _('Remove', 'Virox') ])
			]))) : hn.empty(_('No usage limit.'))
		];
	},

	// ------------------------------------------------------------- kids mode
	kids() {
		const [ dv, pp, , , , , , kd ] = this.data;
		const tgt = hn.targetSelect('vx-k-target', dv.devices, pp.people);
		const dom = E('input', { 'id': 'vx-k-dom', 'type': 'text', 'dir': 'ltr', 'placeholder': 'tiktok.com' });
		return [
			E('p', { 'class': 'vx-hint' }, [ _('Safe search, YouTube in restricted mode, the kids list below closed, and the usual ways around the filter closed (other DNS servers, encrypted DNS).') ]),
			(kd.targets || []).length ? E('ul', { 'class': 'vx-list' }, kd.targets.map(t => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ this.tn(t) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.kidsSet(t, false), _('Kids mode is off.')).then(this.done()) }, [ _('Turn off') ])
			]))) : hn.empty(_('No device in kids mode.')),
			E('div', { 'class': 'vx-inline' }, [ tgt, E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.kidsSet(tgt.value, true), _('Kids mode is on.')).then(r => {
				if (r && r.suggest_policy == 'ask') hn.notify(_('Tip: choose "Ask me first" for new devices, so a new device number does not get around the rules.'), 'warning');
				return this.done()(r);
			}) }, [ _('Turn on') ]) ]),
			// sites opened by kids devices (owner 2026-11-22): on by default, the list is per device
			E('label', { 'class': 'vx-switch' }, [ E('input', { 'type': 'checkbox', 'checked': kd.kids_log !== false ? '' : null,
				'change': ev => hn.act(hn.api.kidsLogSet(ev.target.checked), _('Saved.')).then(this.done()) }), ' ',
				E('span', {}, [ _('Keep the list of sites the kids devices open (7 days; see it on the Devices page, under More)') ]) ]),
			E('h3', {}, [ _('Sites closed for kids only') ]),
			(kd.blocklist || []).length ? E('ul', { 'class': 'vx-list' }, kd.blocklist.map(d => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ fmt.ltr(d) ]), E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.kidsUnblock(d), _('Removed.')).then(this.done()) }, [ _('Remove', 'Virox') ]) ]))) : hn.empty(_('None.')),
			E('div', { 'class': 'vx-inline' }, [ dom, E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.kidsBlock(dom.value), _('Added.')).then(this.done()) }, [ _('Close this site') ]) ])
		];
	},

	// ------------------------------------------------------------- site locks
	locks() {
		const locks = this.data[8].site_locks || [];
		return [
			E('p', { 'class': 'vx-hint' }, [ _('Lock sites and apps on the Devices page, under More: for a while, or until you remove the lock.') ]),
			locks.length ? E('ul', { 'class': 'vx-list' }, locks.map(l => E('li', {}, [
				rowText(this.tn(l.target), [
					fmt.ltr((l.sites || []).concat(l.domain ? [ l.domain ] : []).join(', ')),
					l.always ? _('Until you remove it') : fmt.sentence(_('%s left'), [ fmt.minutes(l.minutes_left) ]) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.siteUnlock(l.id), _('Unlocked.')).then(this.done()) }, [ _('Unlock') ])
			]))) : hn.empty(_('No site is locked now.'))
		];
	},

	// ------------------------------------------------------------- the house filter
	filter() {
		const f = this.data[9];
		const box = (id, label, on, hint) => E('label', { 'class': 'vx-switch' }, [
			E('input', { 'type': 'checkbox', 'id': id, 'checked': on ? '' : null }), ' ', E('span', {}, [ label ]),
			hint ? E('span', { 'class': 'vx-hint vx-row-line' }, [ hint ]) : '' ]);
		const lists = f.lists || {};
		const size = E('select', { 'id': 'vx-f-size' }, [
			[ 'light', _('Small (fewest names, least memory)') ], [ 'normal', _('Normal (recommended)') ],
			[ 'pro', _('Large') ], [ 'pro.plus', _('Very large (needs the most memory)') ]
		].map(o => E('option', { 'value': o[0], 'selected': f.ads_size == o[0] ? '' : null }, [ o[1] ])));
		const state = k => { const l = lists[k] || {}; return !l.on ? '' : (l.state == 'ok' ? fmt.count(l.domains || 0, 'site') : (l.state == 'failed' ? _('download failed, will retry') : _('downloading…'))); };
		const own = E('input', { 'id': 'vx-f-dom', 'type': 'text', 'dir': 'ltr', 'placeholder': 'example.com' });
		return [
			E('p', { 'class': 'vx-hint' }, [ _('Applies to every device in the house. The lists are downloaded by the router and refreshed every night.') ]),
			box('vx-f-ads', _('Ads, trackers and harmful sites'), lists.ads && lists.ads.on, state('ads')),
			hn.field('vx-f-size', _('List size'), size),
			f.ads_effective && f.ads_effective != f.ads_size && lists.ads && lists.ads.on
				? E('p', { 'class': 'vx-warn-text', 'role': 'status' }, [ _('The router memory is low, so a smaller list is in use for now.') ]) : '',
			box('vx-f-adult', _('Adult sites'), lists.adult && lists.adult.on, state('adult')),
			box('vx-f-gambling', _('Gambling sites'), lists.gambling && lists.gambling.on, state('gambling')),
			box('vx-f-bypass', _('Ways around the filter (VPN, proxy, encrypted DNS services)'), lists.bypass && lists.bypass.on, state('bypass')),
			box('vx-f-safe', _('Safe search for everyone'), f.safesearch),
			box('vx-f-yt', _('YouTube restricted mode for everyone'), f.youtube),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
				const v = id => document.getElementById(id).checked;
				hn.act(hn.api.filterSet(v('vx-f-ads'), v('vx-f-adult'), v('vx-f-gambling'), v('vx-f-bypass'), v('vx-f-safe'), v('vx-f-yt'), size.value),
					_('Saved. The lists are being prepared; this takes a minute or two.')).then(this.done());
			} }, [ _('Save') ]),
			f.error ? E('p', { 'class': 'vx-warn-text', 'role': 'alert' }, [ _('The last list could not be loaded; the filter kept its previous state.') ]) : '',
			E('h3', {}, [ _('My own list') ]),
			E('div', { 'class': 'vx-inline' }, [ own,
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.filterBlock(own.value), _('Closed.')).then(this.done()) }, [ _('Close this site') ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.filterAllow(own.value), _('Always open.')).then(this.done()) }, [ _('Never close this site') ]) ]),
			(f.blocked || []).length ? E('ul', { 'class': 'vx-list' }, f.blocked.map(d => E('li', {}, [ E('span', { 'class': 'vx-name' }, [ fmt.ltr(d) ]), hn.badge('bad', _('Closed')),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.filterUnblock(d), null).then(this.done()) }, [ _('Remove', 'Virox') ]) ]))) : '',
			(f.allowed || []).length ? E('ul', { 'class': 'vx-list' }, f.allowed.map(d => E('li', {}, [ E('span', { 'class': 'vx-name' }, [ fmt.ltr(d) ]), hn.badge('ok', _('Always open')),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.filterUnallow(d), null).then(this.done()) }, [ _('Remove', 'Virox') ]) ]))) : ''
		];
	},

	// ------------------------------------------------------------- new devices
	newdev() {
		const set = this.data[4];
		const ask = set.new_devices == 'ask';
		return [
			E('p', {}, [ ask ? _('Now: a new device gets no internet until you allow it.') : _('Now: every new device gets internet at once.') ]),
			E('p', { 'class': 'vx-hint' }, [ _('"Ask me first" stops a child from getting around the rules with a new device number. Every device connected now stays allowed.') ]),
			E('button', { 'class': 'btn ' + (ask ? 'cbi-button' : 'cbi-button-positive'), 'click': () =>
				hn.act(hn.api.setPolicy(ask ? 'allow' : 'ask'), _('Saved.')).then(this.done()) }, [ ask ? _('Let new devices in at once') : _('Ask me first') ])
		];
	},

	draw() {
		const titles = { schedules: _('Schedules'), time: _('Daily time'), limits: _('Limits'), kids: _('Kids mode'),
		                 locks: _('Site locks'), filter: _('House filter'), newdev: _('New devices'),
		                 times: _('Times'), sites: _('Sites and kids') };
		const want = this.section || (location.hash || '#times').substring(1);
		const g = GROUPS.filter(x => x[0] == want || x[1].indexOf(want) >= 0)[0] || GROUPS[0];
		this.root.replaceChildren(
			E('h1', {}, [ _('Control') ]),
			E('p', { 'class': 'vx-sub' }, [ _('Internet time and sites: off schedules, daily time, limits, sites and kids mode, and what happens to new devices.') ]),
			// an access point under a router that is not a Virox cannot catch the name lookups of the
			// devices (owner 2026-11-22: the page did not say so): kids mode, site locks and the house
			// filter need a Virox main router; times, pause and blocking work here
			hn.isAccessPoint(this.data[10]) && this.data[10].main_kind != 'virox'
				? E('div', { 'class': 'vx-alert info', 'role': 'status' }, [ _('This router is an access point under a router that is not a Virox. Kids mode, site locks and the house filter work only when the main router is a Virox; times, pausing and blocking a device work here.') ])
				: '',
			E('ul', { 'class': 'cbi-tabmenu vx-tabs', 'role': 'tablist' }, GROUPS.map(x => E('li', { 'class': x == g ? 'cbi-tab' : 'cbi-tab-disabled' }, [
				E('a', { 'href': '#' + x[0], 'role': 'tab', 'aria-selected': String(x == g),
					'click': ev => { ev.preventDefault(); this.section = x[0]; history.replaceState(null, '', '#' + x[0]); this.draw(); } }, [ titles[x[0]] ]) ]))),
			...g[1].map(s => hn.card(titles[s], this.folded(this[s]())))
		);
	},

	render(data) {
		hn.page(this);
		if (!data) return hn.failed();
		this.data = data;
		this.root = E('div', { 'class': 'vx-page vx-control' });
		this.draw();
		return this.root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
