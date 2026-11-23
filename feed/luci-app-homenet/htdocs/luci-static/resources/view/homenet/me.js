// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// "My devices" for a family login (the user role, BUILD-PLAN B7.3a, 11.2, 10a): only the devices
// and usage of the person this login belongs to, read through virox.homenet me. Nothing here can
// change anything except asking for more time today (me_ask_time, owner 2026-11-22); the backend
// refuses every other method for this login. Values via virox.fmt.
'use strict';
'require view';
'require homenet.ui as hn';
'require virox.fmt as fmt';

return view.extend({
	load() { return hn.api.me().catch(() => null); },

	render(me) {
		hn.page(this);
		if (!me) return hn.failed();
		if (me.result === false)
			return E('div', { 'class': 'vx-page' }, [ hn.empty(_('This page is for family logins.')) ]);
		const now = Date.now() / 1000;
		const cards = (me.devices || []).map(d => {
			const b = [];
			if (d.blocked) b.push(hn.badge('bad', _('Blocked')));
			if (d.paused_until && d.paused_until > now) b.push(hn.badge('warn', E('span', {}, [ _('Paused until'), ' ', fmt.time(d.paused_until) ])));
			if (d.scheduled_off) b.push(hn.badge('warn', _('Off by schedule')));
			if (d.time) b.push(d.time.up ? hn.badge('bad', _('Daily time used up'))
				: hn.badge('info', E('span', {}, [ _('Time left today:'), ' ', fmt.minutes(d.time.left != null ? d.time.left : Math.max(0, d.time.minutes - d.time.used_today)) ])));
			if (d.limit) b.push(hn.badge(d.limit.up ? 'bad' : 'info', fmt.usedOf(d.limit.used || 0, d.limit.bytes)));
			if (d.kids) b.push(hn.badge('info', _('Kids mode')));
			return E('article', { 'class': 'vx-card vx-device' + (d.online ? ' online' : '') }, [
				E('div', { 'class': 'vx-dev-head' }, [
					E('div', { 'class': 'vx-dev-title' }, [
						E('h3', {}, [ fmt.name(d.name || _('Unnamed device')) ]),
						E('p', { 'class': 'vx-dev-sub' }, [ E('span', { 'class': 'vx-dot' }), d.online ? _('Online') : _('Offline') ])
					])
				]),
				E('dl', { 'class': 'vx-usage' }, [
					E('dt', {}, [ _('Today') ]), E('dd', {}, [ fmt.bytes(d.usage.today_down + d.usage.today_up) ]),
					E('dt', {}, [ _('This cycle') ]), E('dd', {}, [ fmt.bytes(d.usage.cycle_down + d.usage.cycle_up) ])
				]),
				E('div', { 'class': 'vx-badges' }, b)
			]);
		});
		// ask the admin for more time today (owner 2026-11-22): only when a daily time applies
		const ask = (me.devices || []).some(d => d.time) ? E('section', { 'class': 'vx-card vx-sec' }, [
			E('h3', { 'class': 'vx-card-title' }, [ _('More time today') ]),
			E('p', { 'class': 'vx-hint' }, [ _('Ask the person who manages the router. They see your request on their page and decide.') ]),
			E('div', { 'class': 'vx-actions' }, [ 30, 60 ].map(m => E('button', { 'class': 'btn cbi-button-positive', 'click': ev => {
				ev.target.disabled = true;
				hn.act(hn.api.meAskTime(m), _('Sent. You will have the time as soon as it is allowed.')).then(() => { ev.target.disabled = false; });
			} }, [ m == 30 ? _('Ask for 30 minutes') : _('Ask for 1 hour') ])))
		]) : '';
		return E('div', { 'class': 'vx-page vx-me' }, [
			E('h1', {}, [ _('My devices') ]),
			me.person_name ? E('p', { 'class': 'vx-hint' }, [ fmt.name(me.person_name) ]) : '',
			ask,
			cards.length ? E('div', { 'class': 'vx-cards' }, cards) : hn.empty(_('No device belongs to you yet. Ask the person who manages the router.'))
		]);
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
