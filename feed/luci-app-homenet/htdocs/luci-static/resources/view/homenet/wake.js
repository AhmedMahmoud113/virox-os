// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Computers (owner 2026-11-19, 2026-11-20, 2026-11-21): the computers of the house only (virox.homenet
// computers: found by the Virox program on them, by their name, or added here). Switch on now
// (Wake-on-LAN), shut down, sleep, restart, hibernate, lock, sign out through the Virox program on
// the computer (virox.pc), and at a time on chosen days: switch on, shut down or sleep
// (virox.homenet wake_add with action). Every action is one API call.
'use strict';
'require view';
'require homenet.ui as hn';
'require virox.fmt as fmt';

return view.extend({
	load() {
		return Promise.all([ hn.api.computers(), hn.api.wakes().catch(() => ({ wakes: [] })), hn.api.pcs().catch(() => ({ pcs: [] })) ]).catch(() => null);
	},

	render(data) {
		hn.page(this);
		if (!data) return hn.failed();
		const [ cp, wk, pc ] = data;
		const pcs = pc.pcs || [];
		const comps = (cp.computers || []).slice().sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
		const others = (cp.others || []).slice().sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name));
		// a Virox program whose computer the router does not know yet (no MAC seen since a restart)
		const loose = pcs.filter(p => !comps.some(c => c.pc == p.id));
		this.pcById = {};
		pcs.forEach(p => { this.pcById[p.id] = p; });
		return E('div', { 'class': 'vx-page vx-wake' }, [
			E('h1', {}, [ _('Computers') ]),
			E('p', { 'class': 'vx-sub' }, [ _('Switch the computers of the house on, off or to sleep from here, now or at a time you choose.') ]),
			this.listSection(comps, loose),
			this.timesSection(comps, wk.wakes || []),
			this.addSection(others)
		]);
	},

	CMD() {
		return [
			[ 'shutdown', _('Shut down'), true ], [ 'sleep', _('Sleep') ], [ 'restart', _('Restart'), true ],
			[ 'hibernate', _('Hibernate') ], [ 'lock', _('Lock the screen') ], [ 'signout', _('Sign out'), true ], [ 'cancel', _('Cancel shutdown') ] ];
	},

	after(r, ms) { if (r && r.result !== false) hn.refresh(ms || 800); return r; },

	// one row per computer: on or off, Wake when off, the commands when its program answers
	listSection(comps, loose) {
		const CMD = this.CMD();
		const word = c => (CMD.filter(x => x[0] == c)[0] || [ c, c ])[1];
		const last = p => {
			if (!p) return '';
			if (p.pending) return hn.badge('warn', _('Waiting for the computer'));
			if (!p.last) return '';
			return hn.badge(p.last.ok ? 'ok' : 'bad', fmt.sentence(p.last.ok ? _('%s: done') : _('%s: failed'), [ word(p.last.cmd) ]));
		};
		const send = (p, name, c) => {
			const go = () => hn.act(hn.api.pcCommand(p.id, c[0]), _('Sent. The computer does it within a few seconds.')).then(r => this.after(r, 4000));
			// shutting down, restarting or signing out loses unsaved work: ask first
			if (c[2]) hn.askConfirm(c[1], fmt.sentence(_('%s: %s?'), [ c[1], fmt.name(name) ]), c[1]).then(y => { if (y) go(); });
			else go();
		};
		const commands = (p, name) => E('div', { 'class': 'vx-chips' }, CMD.map(c =>
			E('button', { 'type': 'button', 'class': 'btn cbi-button' + (c[0] == 'shutdown' ? '-negative' : ''), 'click': () => send(p, name, c) }, [ c[1] ])));
		const forgetPc = (p, name) => hn.askConfirm(_('Remove', 'Virox'), fmt.sentence(_('Remove %s? The program on it removes itself.'), [ fmt.name(name) ]), _('Remove', 'Virox'))
			.then(y => { if (y) hn.act(hn.api.pcForget(p.id), _('Removed.')).then(r => this.after(r)); });
		const notPc = c => hn.act(hn.api.computerSet(c.device, false), _('Removed from the list.')).then(r => this.after(r));
		const rows = comps.map(c => {
			const p = c.pc ? this.pcById[c.pc] : null;
			const on = c.online || (p && p.online);
			const state = [ on ? hn.badge('ok', _('On now')) : hn.badge('bad', _('Off or asleep')), ' ', last(p) ];
			const line = p ? '' : _('Switch on only: for shut down and sleep, add the Virox program on it (below).');
			return E('div', { 'class': 'vx-pc', 'data-device': c.device }, [
				hn.row(fmt.name(c.name || c.device), line, [
					E('span', {}, state),
					E('div', { 'class': 'vx-actions' }, [
						on ? '' : E('button', { 'class': 'btn cbi-button-action', 'click': () => hn.act(hn.api.wake(c.device, ''), _('Start signal sent.')) }, [ _('Wake') ]),
						p ? E('button', { 'class': 'btn cbi-button-negative small', 'click': () => forgetPc(p, c.name) }, [ _('Remove', 'Virox') ])
						  : E('button', { 'class': 'btn cbi-button small', 'click': () => notPc(c) }, [ _('Not a computer') ])
					])]),
				p && p.online ? commands(p, c.name) : ''
			]);
		});
		loose.forEach(p => rows.push(E('div', { 'class': 'vx-pc' }, [
			hn.row(fmt.name(p.name), '', [ E('span', {}, [ p.online ? hn.badge('ok', _('On now')) : hn.badge('bad', _('Off or asleep')), ' ', last(p) ]),
				E('button', { 'class': 'btn cbi-button-negative small', 'click': () => forgetPc(p, p.name) }, [ _('Remove', 'Virox') ]) ]),
			p.online ? commands(p, p.name) : ''
		])));
		return hn.section(_('Your computers'),
			_('Switching on needs the computer on a cable with Wake-on-LAN turned on in its settings. Shut down and sleep need the small Virox program on the computer.'),
			rows.length ? rows : [ hn.empty(_('No computer found yet. Add one below.')) ]);
	},

	// at a time on chosen days: switch on, shut down or sleep
	timesSection(comps, wakes) {
		const ACT = [ [ 'wake', _('Switch on') ], [ 'shutdown', _('Shut down') ], [ 'sleep', _('Sleep') ] ];
		const actWord = a => (ACT.filter(x => x[0] == (a || 'wake'))[0] || ACT[0])[1];
		const nameOf = id => { const c = comps.filter(x => x.device == id)[0]; return c ? (c.name || id) : id; };
		const pick = E('select', { 'id': 'vx-w-dev' }, comps.map(c => E('option', { 'value': c.device }, [ c.name || c.device ])));
		const act = E('select', { 'id': 'vx-w-act' }, ACT.map(a => E('option', { 'value': a[0] }, [ a[1] ])));
		const time = E('input', { 'id': 'vx-w-time', 'type': 'time', 'value': '07:00', 'dir': 'ltr' });
		const days = hn.DAY_NAMES().map((n, i) => {
			const b = E('button', { 'type': 'button', 'class': 'vx-chip', 'aria-pressed': i <= 4 ? 'true' : 'false',
				'click': () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') == 'true' ? 'false' : 'true') }, [ n ]);
			b.dataset.day = String(i);
			return b;
		});
		const list = wakes.map(w => hn.row(fmt.name(nameOf(w.device)),
			E('span', {}, [ actWord(w.action), ' ', fmt.ltr(w.time), ' ', w.days.split('').map(i => hn.DAY_NAMES()[+i]).join('، ') ]),
			E('button', { 'class': 'btn cbi-button-negative small', 'click': () => hn.act(hn.api.wakeRemove(w.id), _('Removed.')).then(r => this.after(r)) }, [ _('Remove', 'Virox') ])));
		if (!comps.length)
			return hn.section(_('At a time'), _('For example: switch the office computer on every working day at 7:00 and put it to sleep at 23:00.'), list.length ? list : [ hn.empty(_('Add a computer first.')) ]);
		return hn.section(_('At a time'), _('For example: switch the office computer on every working day at 7:00 and put it to sleep at 23:00.'), [
			hn.field('vx-w-dev', _('Computer'), pick),
			hn.field('vx-w-act', _('What'), act),
			hn.field('vx-w-time', _('Time'), time),
			hn.row(_('Days'), '', E('div', { 'class': 'vx-chips' }, days)),
			...list
		], [ E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
			const d = days.filter(b => b.getAttribute('aria-pressed') == 'true').map(b => b.dataset.day).join('');
			if (!d) return hn.notify(_('Choose at least one day.'), 'warning');
			hn.act(hn.api.wakeAdd(pick.value, time.value, d, act.value), _('Saved.')).then(r => this.after(r));
		} }, [ _('Add', 'Virox') ]) ]);
	},

	// the Virox program (for shut down and sleep), and a computer the router did not recognise
	addSection(others) {
		const add = () => hn.act(hn.api.pcCode()).then(r => {
			if (!r || r.result === false) return;
			// the setup file: the router's address and a code for 10 minutes; it fetches the program
			// from the router and links this computer (homenet/pc/virox-pc-setup.ps1)
			const url = 'http://' + location.hostname + '/luci-static/resources/homenet/pc/virox-pc-setup.ps1';
			const text = [ '@echo off', 'rem Virox: links this computer to the router (run once)',
				'set VX_ROUTER=' + location.hostname, 'set VX_CODE=' + r.code,
				'powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object Net.WebClient).DownloadString(\'' + url + '\'))"',
				'pause', '' ].join('\r\n');
			const a = E('a', { 'href': URL.createObjectURL(new Blob([ text ], { type: 'application/octet-stream' })), 'download': 'Virox-computer.cmd' });
			document.body.appendChild(a); a.click(); a.remove();
			hn.notify(_('Downloaded. Open the file on this computer within 10 minutes.'), 'success');
		});
		const pick = E('select', { 'id': 'vx-c-dev' }, others.map(d => E('option', { 'value': d.device }, [ (d.name || d.device) + (d.online ? '' : ' (' + _('Off or asleep') + ')') ])));
		return hn.section(_('Add a computer'), '', [
			E('h3', {}, [ _('The Virox program (Windows)') ]),
			E('p', { 'class': 'vx-hint' }, [ _('Open these pages on the computer itself and press the button: a small file downloads; open it once. The computer can then be shut down, put to sleep or locked from here.') ]),
			E('div', { 'class': 'vx-actions' }, [ E('button', { 'class': 'btn cbi-button-positive', 'click': add }, [ _('Add this computer') ]) ]),
			others.length ? E('h3', {}, [ _('A computer that is not in the list') ]) : '',
			others.length ? hn.field('vx-c-dev', _('Device', 'Virox'), pick) : '',
			others.length ? E('div', { 'class': 'vx-actions' }, [ E('button', { 'class': 'btn cbi-button', 'click': () =>
				hn.act(hn.api.computerSet(pick.value, true), _('Added.')).then(r => this.after(r)) }, [ _('It is a computer') ]) ]) : ''
		]);
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
