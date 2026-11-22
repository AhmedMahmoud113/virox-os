// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Home, in the layout of the "البيت" pages of the owner's main router (owner, 2026-11-19): the
// internet bar (state, how long, devices connected, live download and upload speed), the number
// tiles, then the package and the devices that used the most today side by side, then the
// internet outages of the last 7 days. What needs the owner now (a device waiting for approval,
// a new version, the newest alert) is one line under the bar (10a item 6).
'use strict';
'require view';
'require dom';
'require homenet.ui as hn';
'require virox.fmt as fmt';

const LINE_HINT = {
	no_internet: () => _('The modem answers, but the internet does not get through. The problem is at the provider or the line.'),
	no_modem: () => _('The modem does not answer. Check that it is switched on and its cable is plugged in.'),
	wan_down: () => _('No internet line: the cable to the modem is out or the line is down.')
};

function eventText(e) {
	const d = e.data || {};
	return ({
		new_device: () => fmt.sentence(_('A new device joined: %s'), [ fmt.name(d.name || d.mac || '') ]),
		new_device_held: () => fmt.sentence(_('A new device is waiting for your approval: %s'), [ fmt.name(d.name || d.mac || '') ]),
		time_limit_reached: () => _('A daily internet time is used up.'),
		usage_limit_warn: () => _('A device is close to its usage limit.'),
		usage_limit_reached: () => _('A device used up its usage limit and is cut until the next cycle.'),
		package_warn: () => _('Most of the internet package is used.'),
		package_used_up: () => _('The internet package is used up. The provider may slow down or stop the line.'),
		internet_down: () => _('The internet stopped.'),
		internet_up: () => fmt.sentence(_('The internet is back after %s.'), [ fmt.minutes(Math.round((+d.seconds || 0) / 60)) ]),
		filter_failed: () => _('A filter list could not be loaded; the previous state was kept.'),
		filter_memory: () => _('The router memory is low, so a smaller filter list is used.'),
		usage_mismatch: () => _('The usage count of one day does not add up; please send a help report.'),
		data_write_refused: () => _('An error was stopped before it could delete data.'),
		dhcp_restored: () => _('A network setting stopped address handout; the last working settings were put back.'),
		package_calibrated: () => _('The package now continues from the figure of the provider.'),
		device_autolinked: () => fmt.sentence(_('A device came back with a new address and was recognised: %s'), [ fmt.name(d.name || d.mac || '') ]),
		device_match_proposed: () => fmt.sentence(_('A new device may be one you know: %s'), [ fmt.name(d.name || d.mac || '') ]),
		device_person_from_key: () => _('A device was given to its person by the Wi-Fi password it used.'),
		line_down: () => fmt.sentence(_('Line %s stopped; its devices use the other line.'), [ fmt.ltr(String(d.line || '')) ]),
		line_up: () => fmt.sentence(_('Line %s is back.'), [ fmt.ltr(String(d.line || '')) ]),
		line_package_level: () => fmt.sentence(_('Line %s: most of the package is used.'), [ fmt.ltr(String(d.line || '')) ]),
		line_package_used_up: () => fmt.sentence(_('Line %s: the package is used up; its devices stopped. You can let them borrow the other line.'), [ fmt.ltr(String(d.line || '')) ]),
		line_renewed: () => fmt.sentence(_('Line %s: a new package cycle started.'), [ fmt.ltr(String(d.line || '')) ]),
		both_started: () => _('Both lines are in use.'),
		both_ended: () => _('Both lines: the time is over.'),
		borrow_started: () => _('Borrowing the other line started.'),
		borrow_ended: () => _('Borrowing the other line ended.'),
		// every other code the router raises (page checker, session 22: Home showed "ap_paired")
		ap_paired: () => _('A new access point joined the home network.'),
		ap_address_moved: () => _('An access point has a new address; the router found it again.'),
		restart_aps_failed: () => _('An access point did not come back after its restart; the others were not restarted.'),
		update_all_done: () => _('All access points are updated.'),
		update_all_skipped: () => _('The access points are updated, except those that were not reachable.'),
		update_all_failed: () => _('An access point did not come back after its update; the update of the others was stopped.'),
		device_merged: () => _('Two devices were joined into one.'),
		mac_linked: () => _('A device with a new address was joined to a device you know.'),
		device_forgotten: () => _('A device was removed from the list.'),
		data_restored: () => _('The usage records were restored from the last copy.'),
		import_done: () => _('The devices and people of the old router were brought in.'),
		dhcp_down: () => _('Devices cannot get an address from the router; please send a help report.'),
		backup_failed: () => _('The backup to the USB disk did not work.'),
		scheduled_restart: () => _('The router restarted at its scheduled time.'),
		settings_restored: () => _('The settings were restored from a backup.'),
		time_approximate: () => _('The router clock could not be checked on the internet; the time may be a little off.'),
		update_available: () => fmt.sentence(_('A new version is available: %s'), [ fmt.ltr(String(d.version || '')) ]),
		update_installing: () => _('The router is installing a new version and will restart.'),
		time_request: () => _('A family member asked for more time today.'),
		time_extra_given: () => _('Extra internet time was given for today.'),
		guest_auto_off: () => _('The guest network switched off by itself at the time you chose.')
	})[e.code] || (() => _('The router has a new notice.'));
}

// seconds -> "5 days", "3 h", "12 min": the largest unit only, like the main router's pages
function since(sec) {
	sec = Math.max(0, Math.round(+sec || 0));
	if (sec >= 86400) return fmt.count(Math.floor(sec / 86400), 'day');
	if (sec >= 3600) return fmt.count(Math.floor(sec / 3600), 'hour');
	return fmt.minutes(Math.max(1, Math.round(sec / 60)));
}
function dayCount(n) { return fmt.countText(n, 'day'); }

const used = d => d.usage.today_down + d.usage.today_up;

function stat(label, value, cls) {
	return E('div', { 'class': 'vx-stat' + (cls ? ' ' + cls : '') }, [ E('span', {}, [ label ]), E('b', {}, [ value ]) ]);
}

function cardHead(title, action) {
	return E('div', { 'class': 'vx-card-head' }, [ E('h3', { 'class': 'vx-card-title' }, [ title ]), action || '' ]);
}

return view.extend({
	load() {
		return Promise.all([
			hn.api.network().catch(() => null),
			hn.api.devices().catch(() => null),
			hn.api.usage().catch(() => null),
			hn.api.events(5, true).catch(() => null),
			hn.api.updateStatus().catch(() => null),
			hn.api.lines().catch(() => null)
		]);
	},

	// the bar: one line or several (B9); the speed comes from two readings of the WAN counters
	hero(net, dv) {
		const lines = (net && net.lines) || [];
		const on = ((dv && dv.devices) || []).filter(d => d.online).length;
		const now = Date.now() / 1000;
		const ups = lines.filter(l => l.state == 'up'), first = lines[0];
		let cls = '', head, sub;
		if (!lines.length) {
			cls = ' wait'; head = _('Checking the internet…'); sub = _('The result appears within two minutes.');
		}
		else if (ups.length) {
			const t = ups.map(l => l.since).filter(x => x).sort()[0];
			head = _('The internet is working');
			sub = t ? fmt.sentence(_('Without a break for %s, %s devices connected'), [ since(now - t), fmt.ltr(String(on)) ])
				: fmt.sentence(_('%s devices connected'), [ fmt.ltr(String(on)) ]);
		}
		else {
			cls = ' down';
			const t = first.since;
			head = t ? fmt.sentence(_('The internet has been down for %s'), [ since(now - t) ]) : _('The internet is down');
			sub = (LINE_HINT[first.state] || LINE_HINT.wan_down)();
		}
		this.speedDown = this.speedDown || E('b', {}, [ '—' ]);
		this.speedUp = this.speedUp || E('b', {}, [ '—' ]);
		return E('div', { 'class': 'vx-hero' + cls, 'id': 'vx-internet' }, [
			E('span', { 'class': 'vx-pulse' }),
			E('div', { 'class': 'vx-hero-main' }, [
				E('strong', {}, [ head ]),
				E('small', {}, [ sub ]),
				lines.length > 1 ? E('small', { 'class': 'vx-hero-line' }, lines.map((l, i) => E('span', {}, [
					i ? ' · ' : '', _('Line'), ' ', fmt.ltr(l.line), ' ', l.state == 'up' ? _('working', 'Virox') : _('down', 'Virox')
				]))) : ''
			]),
			E('div', { 'class': 'vx-speed' }, [
				E('div', {}, [ E('span', {}, [ _('Download', 'Virox') ]), this.speedDown ]),
				E('div', {}, [ E('span', {}, [ _('Upload', 'Virox') ]), this.speedUp ])
			])
		]);
	},

	speed(net) {
		const t = net && net.traffic;
		if (!t || !t.time) return;
		const p = this.lastTraffic;
		this.lastTraffic = t;
		if (!p || t.time <= p.time || t.rx < p.rx || t.tx < p.tx) return;
		const s = t.time - p.time;
		// bytes per second, as download programs show it (30 Mbit/s = 3.75 MB/s)
		dom.content(this.speedDown, [ fmt.rate((t.rx - p.rx) / s) ]);
		dom.content(this.speedUp, [ fmt.rate((t.tx - p.tx) / s) ]);
	},

	stats(net, dv) {
		const all = (dv && dv.devices) || [];
		const nowSec = Date.now() / 1000;
		const stopped = all.filter(d => d.blocked || (d.paused_until && d.paused_until > nowSec)).length;
		return E('div', { 'class': 'vx-stats', 'id': 'vx-stats' }, [
			stat(_('Connected now'), fmt.ltr(String(all.filter(d => d.online).length)), 'blue'),
			stat(_('Used today'), fmt.bytes(all.reduce((s, d) => s + used(d), 0))),
			stat(_('Blocked or paused'), fmt.ltr(String(stopped))),
			stat(_('Router running for'), net && net.uptime != null ? since(net.uptime) : '—')
		]);
	},

	packageCard(us) {
		if (!us) return hn.card(_('Package'), hn.failed(), { 'id': 'vx-package' });
		const next = new Date(String(us.cycle.next) + 'T00:00:00'), start = new Date(String(us.cycle.start) + 'T00:00:00');
		const left = Math.max(0, Math.ceil((next - Date.now()) / 864e5));
		if (!us.package_mb)
			return E('section', { 'class': 'vx-card', 'id': 'vx-package' }, [
				cardHead(_('Package'), E('a', { 'class': 'btn cbi-button small', 'href': L.url('admin/internet') }, [ _('Set the package size') ])),
				E('p', { 'class': 'vx-pkg-used' }, [ E('b', {}, [ fmt.bytes(us.used) ]) ]),
				E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Used since the last renewal; renews in %s'), [ E('bdi', {}, [ dayCount(left) ]) ]) ])
			]);
		const limit = us.package_mb * fmt.MB, pct = Math.min(100, us.percent || 0);
		const days = Math.max(1, Math.round((next - start) / 864e5));
		const passed = Math.min(days, Math.max(0.01, (Date.now() - start) / 864e5));
		const projected = us.used / passed * days;
		const tone = pct >= 100 ? 'bad' : (pct >= us.package_warn ? 'warn' : 'info');
		return E('section', { 'class': 'vx-card', 'id': 'vx-package' }, [
			cardHead(_('Package')),
			E('div', { 'class': 'vx-pkg-top' }, [
				E('div', {}, [ E('b', { 'class': 'vx-pkg-used' }, [ fmt.bytes(us.used) ]), ' ',
					E('span', { 'class': 'vx-hint' }, [ fmt.sentence(_('of %s'), [ fmt.bytes(limit) ]) ]) ]),
				hn.badge(tone, fmt.percent(pct))
			]),
			E('div', { 'class': 'vx-meter', 'role': 'progressbar', 'aria-label': _('Package used'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, [
				E('div', { 'class': 'vx-meter-fill' + (pct >= 100 ? ' full' : (pct >= us.package_warn ? ' warn' : '')), 'style': 'inline-size:%d%%'.format(pct) })
			]),
			E('div', { 'class': 'vx-stats' }, [
				stat(_('Left', 'Virox'), fmt.bytes(us.remaining || 0)),
				stat(_('Renews in'), E('bdi', {}, [ dayCount(left) ])),
				stat(_('Expected at the end of the cycle'), fmt.bytes(projected), projected > limit ? 'warn' : '')
			])
		]);
	},

	topCard(dv) {
		const top = ((dv && dv.devices) || []).filter(d => used(d) > 0).sort((a, b) => used(b) - used(a)).slice(0, 6);
		const max = Math.max(1, ...top.map(used));
		return E('section', { 'class': 'vx-card', 'id': 'vx-top' }, [
			cardHead(_('Most used today'), E('a', { 'class': 'btn cbi-button small', 'href': L.url('admin/devices') }, [ _('All devices') ])),
			top.length ? E('div', { 'class': 'vx-topbars' }, top.map(d => E('div', { 'class': 'vx-topbar' }, [
				E('span', { 'class': 'vx-topbar-name' }, [ E('span', { 'class': 'vx-dot' + (d.online ? ' on' : ''), 'aria-hidden': 'true' }), fmt.name(hn.deviceName(d)) ]),
				E('span', { 'class': 'vx-topbar-track', 'aria-hidden': 'true' }, [ E('i', { 'style': 'inline-size:%.1f%%'.format(used(d) / max * 100) }) ]),
				E('b', {}, [ fmt.bytes(used(d)) ])
			]))) : E('p', { 'class': 'vx-empty' }, [ _('No usage yet today.') ])
		]);
	},

	// who uses the internet now (owner 2026-11-22): the speed of each device at this moment,
	// refreshed with the line speed every 5 s, so a slow game shows at once who is downloading
	nowCard(lv) {
		const all = ((lv && lv.devices) || []).filter(x => x.down_bps + x.up_bps >= 1250);   // from 10 kbit/s
		const top = all.slice(0, 5), max = Math.max(1, ...top.map(x => x.down_bps + x.up_bps));
		const kbit = bps => Math.round(bps * 8 / 1000);
		const name = id => id.indexOf('ip:') == 0 ? _('A new device') : this.targetName(id);
		return E('section', { 'class': 'vx-card', 'id': 'vx-now' }, [
			cardHead(_('Using the internet now'), E('a', { 'class': 'btn cbi-button small', 'href': L.url('admin/devices') }, [ _('All devices') ])),
			top.length ? E('div', { 'class': 'vx-topbars' }, top.map(x => E('div', { 'class': 'vx-topbar' }, [
				E('span', { 'class': 'vx-topbar-name' }, [ E('span', { 'class': 'vx-dot on', 'aria-hidden': 'true' }), fmt.name(name(x.id)) ]),
				E('span', { 'class': 'vx-topbar-track', 'aria-hidden': 'true' }, [ E('i', { 'style': 'inline-size:%.1f%%'.format((x.down_bps + x.up_bps) / max * 100) }) ]),
				E('b', {}, [ fmt.sentence(_('Download %s'), [ fmt.speed(kbit(x.down_bps)) ]) ]),
				E('small', { 'class': 'vx-hint' }, [ fmt.sentence(_('Upload %s'), [ fmt.speed(kbit(x.up_bps)) ]) ])
			]))) : E('p', { 'class': 'vx-empty' }, [ lv ? _('Nobody is using the internet right now.') : _('Checking…') ])
		]);
	},

	outagesCard(net) {
		const ev = (net && net.events) || [];
		const week = Date.now() / 1000 - 7 * 86400;
		const back = ev.filter(e => e.kind == 'up' && e.time >= week);
		const total = back.reduce((s, e) => s + (e.seconds || 0), 0);
		return E('section', { 'class': 'vx-card', 'id': 'vx-outages' }, [
			cardHead(_('Internet connection')),
			E('p', { 'class': 'vx-hint' }, [ back.length
				? fmt.sentence(_('%s outages in the last 7 days, %s in total'), [ fmt.ltr(String(back.length)), fmt.minutes(Math.round(total / 60)) ])
				: _('No outages in the last 7 days.') ]),
			ev.length ? E('div', { 'class': 'vx-items' }, ev.slice(0, 6).map(e => E('div', { 'class': 'vx-item' }, [
				E('span', {}, [
					hn.badge(e.kind == 'up' ? 'ok' : 'bad', e.kind == 'up' ? _('Back', 'Virox') : _('Stopped', 'Virox')), ' ',
					e.line && e.line != 'wan' ? fmt.ltr(e.line) : '',
					e.kind == 'up' && e.seconds ? E('span', { 'class': 'vx-hint' }, [ ' ', fmt.sentence(_('after %s'), [ fmt.minutes(Math.max(1, Math.round(e.seconds / 60))) ]) ]) : ''
				]),
				E('span', { 'class': 'vx-hint' }, [ fmt.date(e.time), ' ', fmt.time(e.time) ])
			]))) : ''
		]);
	},

	// B9: with the second line on, the package card shows both lines: state, use, what is left,
	// when it ends at this rate, and who uses both lines or borrows now (R3: always shown)
	linesCard(ls) {
		const rows = ls.lines.map(l => {
			const pkg = l.package_mb * fmt.MB, used = l.used_mb * fmt.MB;
			const pct = l.package_mb ? Math.min(100, Math.round(l.used_mb * 100 / l.package_mb)) : 0;
			return E('div', { 'class': 'vx-line' + (l.up ? '' : ' bad') }, [
				E('p', { 'class': 'vx-line-head' }, [ E('span', { 'class': 'vx-dot', 'style': 'background:%s'.format(l.colour || 'currentColor') }),
					E('strong', {}, [ fmt.name(hn.lineName(l)) ]), ' ',
					hn.badge(l.up ? (l.used_up ? 'bad' : 'ok') : 'bad', !l.up ? _('Line down') : (l.used_up ? _('Package used up') : _('Working'))) ]),
				l.package_mb ? E('p', {}, [ fmt.leftOf(Math.max(0, pkg - used), pkg) ]) : E('p', {}, [ fmt.sentence(_('Used since the last renewal: %s'), [ fmt.bytes(used) ]) ]),
				l.package_mb ? E('div', { 'class': 'vx-meter', 'role': 'progressbar', 'aria-label': _('Package used'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, [
					E('div', { 'class': 'vx-meter-fill' + (pct >= 100 ? ' full' : (pct >= l.warn ? ' warn' : '')), 'style': 'inline-size:%d%%'.format(pct) }) ]) : '',
				l.days_left != null && l.package_mb && !l.used_up ? E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('At this rate the package lasts about %s'), [ fmt.count(l.days_left, 'day') ]) ]) : ''
			]);
		});
		const active = (ls.assignments || []).filter(a => a.kind != 'line');
		return E('section', { 'class': 'vx-card', 'id': 'vx-package' }, [
			cardHead(_('Internet lines'), E('a', { 'class': 'btn cbi-button small', 'href': L.url('admin/internet') }, [ _('Line settings') ])),
			...rows,
			active.length ? E('ul', { 'class': 'vx-list' }, active.map(a => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ a.target == 'all' ? _('Everyone') : fmt.name(this.targetName(a.target)) ]),
				E('span', { 'class': 'vx-hint' }, [ a.kind == 'both' ? _('Both lines') : _('Borrowing the other line'),
					a.minutes_left != null ? ' ' : '', a.minutes_left != null ? fmt.sentence(_('%s left'), [ fmt.minutes(a.minutes_left) ]) : '' ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.linesEnd(a.target), _('Ended.')).then(() => location.reload()) }, [ _('End') ])
			]))) : '',
		]);
	},

	targetName(id) {
		const dv = (this.dv && this.dv.devices) || [];
		const d = dv.filter(x => x.id == id)[0];
		if (d) return hn.deviceName(d);
		const p = dv.filter(x => x.person == id)[0];
		return p ? p.person_name : id;
	},

	// one line under the bar: what needs the owner now, most important first
	alertLine(dv, up, ev) {
		const held = ((dv && dv.devices) || []).filter(d => d.held);
		if (held.length == 1) {
			const d = held[0];
			return E('div', { 'class': 'vx-alert', 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ fmt.sentence(_('A new device is waiting for your approval: %s'), [ fmt.name(hn.deviceName(d)) ]) ]),
				E('button', { 'class': 'btn cbi-button-positive', 'click': ev => {
					ev.target.disabled = true;
					hn.act(hn.api.approve(d.id), _('Allowed.')).then(() => location.reload());
				} }, [ _('Allow') ])
			]);
		}
		if (held.length > 1)
			return E('div', { 'class': 'vx-alert', 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ fmt.sentence(_('New devices waiting for your approval: %s'), [ fmt.ltr(String(held.length)) ]) ]),
				E('a', { 'class': 'btn cbi-button-positive', 'href': L.url('admin/devices') }, [ _('Show') ])
			]);
		// a family login asks for more time today (owner 2026-11-22): the newest unread request
		const tr = ((ev && ev.events) || []).filter(x => x.code == 'time_request' && x.data && x.data.person)[0];
		if (tr) {
			const m = +tr.data.minutes == 60 ? 60 : 30;
			const give = (min, text) => ev2 => {
				ev2.target.disabled = true;
				hn.act(hn.api.timelimitExtra(tr.data.person, min), text).then(() => hn.api.eventsRead(tr.id || '')).then(() => location.reload());
			};
			return E('div', { 'class': 'vx-alert info', 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ fmt.sentence(m == 60 ? _('%s asks for one more hour today.') : _('%s asks for 30 more minutes today.'),
					[ fmt.name(this.targetName(tr.data.person)) ]), ' ', E('span', { 'class': 'vx-hint' }, [ fmt.time(tr.time) ]) ]),
				E('button', { 'class': 'btn cbi-button-positive', 'click': give(m, m == 60 ? _('One more hour for today.') : _('30 more minutes for today.')) }, [ _('Allow') ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.eventsRead(tr.id || ''), null).then(() => location.reload()) }, [ _('Not now') ])
			]);
		}
		if (up && up.available)
			return E('div', { 'class': 'vx-alert info', 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ fmt.sentence(_('A new version is available: %s'), [ fmt.ltr(up.available) ]) ]),
				E('a', { 'class': 'btn cbi-button-positive', 'href': L.url('admin/settings') + '#vx-update' }, [ _('See and install') ])
			]);
		const e = ((ev && ev.events) || [])[0];
		if (e && e.code == 'device_match_proposed' && e.data && e.data.device_id) {
			const known = (((dv && dv.devices) || []).filter(x => x.id == e.data.device_id)[0]);
			return E('div', { 'class': 'vx-alert info', 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ fmt.sentence(_('Is the new device %s the same as %s?'),
					[ fmt.name(e.data.name || e.data.mac || ''), fmt.name(known ? hn.deviceName(known) : e.data.device_id) ]) ]),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.link(e.data.mac, e.data.device_id), _('Joined.'))
					.then(() => hn.api.eventsRead(e.id || '')).then(() => location.reload()) }, [ _('Same device') ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.eventsRead(e.id || ''), null).then(() => location.reload()) }, [ _('Not the same') ])
			]);
		}
		if (e)
			return E('div', { 'class': 'vx-alert' + (e.level == 'info' ? ' info' : (e.level == 'danger' ? ' danger' : '')), 'role': 'status' }, [
				E('span', { 'class': 'vx-alert-text' }, [ eventText(e)(), ' ', E('span', { 'class': 'vx-hint' }, [ fmt.time(e.time) ]) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.eventsRead(e.id || ''), null).then(() => location.reload()) }, [ _('Mark as read') ])
			]);
		return '';
	},

	render(data) {
		const [ net, dv, us, ev, up, ls ] = data;
		if (!net && !dv && !us) return hn.failed();
		this.dv = dv;
		const pkg = (u, l) => (l && l.enabled) ? this.linesCard(l) : this.packageCard(u);
		this.speed(net);
		const alert = this.alertLine(dv, up, ev);
		const root = E('div', { 'class': 'vx-page vx-home' }, [
			this.hero(net, dv),
			alert ? E('div', { 'class': 'vx-alerts' }, [ alert ]) : '',
			this.stats(net, dv),
			E('div', { 'class': 'vx-grid' }, [ pkg(us, ls), this.nowCard(null), this.topCard(dv) ]),
			this.outagesCard(net)
		]);
		const swap = (id, el) => { const old = root.querySelector('#' + id); if (old) old.replaceWith(el); };
		// the speed every 5 s (the fastest refresh of section 10.9); the rest every 30 s
		let n = 0;
		hn.poll(() => Promise.all([ hn.api.network(), hn.api.live().catch(() => null) ]).then(([ r, lv ]) => {
			this.speed(r);
			swap('vx-now', this.nowCard(lv));
			if (n++ % 6) return;
			return Promise.all([ hn.api.devices(), hn.api.usage(), hn.api.lines().catch(() => null) ]).then(([ d, u, l ]) => {
				this.dv = d;
				swap('vx-internet', this.hero(r, d));
				swap('vx-stats', this.stats(r, d));
				swap('vx-package', pkg(u, l));
				swap('vx-top', this.topCard(d));
				swap('vx-outages', this.outagesCard(r));
			});
		}).catch(() => {}), 5);
		return root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
