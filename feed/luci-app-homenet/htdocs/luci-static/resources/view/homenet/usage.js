// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Usage (BUILD-PLAN B7, B7.3e item 5c, 10a), in the layout of the "البيت" pages of the owner's
// main router (owner, 2026-11-19): the number tiles of this billing cycle, the cycle day by day
// as columns, who used what as bars with their share, then the package with the "remaining at
// the provider" calibration. Numbers come from virox.homenet usage / devices and are written by
// virox.fmt (Arabic units, Western digits, each value isolated); GB = 1024 MB.
'use strict';
'require view';
'require homenet.ui as hn';
'require virox.fmt as fmt';

return view.extend({
	load() {
		return Promise.all([ hn.api.usage(), hn.api.devices(), hn.api.people().catch(() => ({ people: [] })) ]).catch(() => null);
	},

	packageCard(us) {
		const rem = E('input', { 'id': 'vx-u-rem', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '0.01', 'dir': 'ltr' });
		const body = [];
		if (us.package_mb) {
			const pct = Math.min(100, us.percent || 0);
			body.push(
				E('p', { 'class': 'vx-big' }, [ fmt.leftOf(us.remaining, us.package_mb * fmt.MB) ]),
				E('div', { 'class': 'vx-meter', 'role': 'progressbar', 'aria-label': _('Package used'), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, [
					E('div', { 'class': 'vx-meter-fill' + (pct >= 100 ? ' full' : (pct >= us.package_warn ? ' warn' : '')), 'style': 'inline-size:%d%%'.format(pct) }) ]),
				E('p', {}, [ fmt.usedOf(us.used, us.package_mb * fmt.MB) ]));
		}
		else
			body.push(E('p', { 'class': 'vx-big' }, [ fmt.sentence(_('Used since the last renewal: %s'), [ fmt.bytes(us.used) ]) ]));
		body.push(E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Package cycle from %s to %s'), [ fmt.date(us.cycle.start), fmt.date(us.cycle.next) ]) ]));
		if (us.calibration)
			body.push(
				E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Counted by the router itself: %s'), [ fmt.bytes(us.router_used) ]) ]),
				E('p', { 'class': 'vx-hint' }, [ _('corrected with the provider figure') ]));
		if (us.package_mb)
			body.push(E('details', {}, [
				E('summary', {}, [ _('The provider shows a different amount left?') ]),
				E('p', { 'class': 'vx-hint' }, [ _('Type what the provider (its app, website or SMS) shows as remaining now. The package then continues from that figure until the next renewal.') ]),
				hn.field('vx-u-rem', _('Remaining at the provider (GB)'), rem),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.packageCalibrate(hn.mbFromGb(rem.value)), _('Saved.')).then(r => r && r.result !== false && hn.refresh()) }, [ _('Save') ])
			]));
		return hn.card(_('Package'), body);
	},

	tiles(us) {
		const days = us.days || [];
		const down = days.reduce((s, d) => s + d.down, 0), up = days.reduce((s, d) => s + d.up, 0);
		const start = new Date(String(us.cycle.start) + 'T00:00:00');
		const passed = Math.max(1, Math.ceil((Date.now() - start) / 864e5));
		const tile = (label, value, cls) => E('div', { 'class': 'vx-stat' + (cls ? ' ' + cls : '') }, [ E('span', {}, [ label ]), E('b', {}, [ value ]) ]);
		return E('div', { 'class': 'vx-stats' }, [
			tile(_('Total this cycle'), fmt.bytes(down + up), 'blue'),
			tile(_('Download', 'Virox'), fmt.bytes(down)),
			tile(_('Upload', 'Virox'), fmt.bytes(up)),
			tile(_('Daily average'), fmt.bytes((down + up) / passed))
		]);
	},

	// the cycle day by day: one column per day, today in the strong colour
	daysCard(us) {
		const days = us.days || [];
		const head = E('div', { 'class': 'vx-card-head' }, [ E('h3', { 'class': 'vx-card-title' }, [ _('Day by day') ]),
			E('span', { 'class': 'vx-hint' }, [ fmt.sentence(_('Package cycle from %s to %s'), [ fmt.date(us.cycle.start), fmt.date(us.cycle.next) ]) ]) ]);
		if (!days.length) return E('section', { 'class': 'vx-card' }, [ head, hn.empty(_('No usage in this cycle yet.')) ]);
		const max = Math.max(...days.map(d => d.up + d.down), 1);
		const today = new Date(); const iso = '%04d-%02d-%02d'.format(today.getFullYear(), today.getMonth() + 1, today.getDate());
		return E('section', { 'class': 'vx-card' }, [
			head,
			E('div', { 'class': 'vx-chart', 'role': 'img', 'aria-label': _('Usage per day') }, days.map(d => {
				const t = d.up + d.down;
				return E('div', { 'class': 'vx-chart-col', 'title': fmt.bytesText(t) }, [
					E('i', { 'class': d.day == iso ? 'today' : '', 'style': 'block-size:%.1f%%'.format(Math.max(1, t * 100 / max)) }) ]);
			})),
			E('div', { 'class': 'vx-chart-labels', 'aria-hidden': 'true' }, days.map(d => E('span', { 'dir': 'ltr' }, [ d.day.slice(8) + '/' + d.day.slice(5, 7) ])))
		]);
	},

	// who used what this cycle: one bar per device (and the router itself, guests, unknown)
	whoCard(dv, pp) {
		const rows = dv.devices.map(d => ({ name: fmt.name(hn.deviceName(d)), online: d.online, cycle: d.usage.cycle_up + d.usage.cycle_down }));
		const router = dv.router, unk = dv.unknown, gst = dv.guest;
		if (router && (router.cycle_up + router.cycle_down) > 0)
			rows.push({ name: _('The router itself'), cycle: router.cycle_up + router.cycle_down, special: true });
		if (gst && (gst.cycle_up + gst.cycle_down) > 0)
			rows.push({ name: _('Guests'), cycle: gst.cycle_up + gst.cycle_down, special: true });
		if (unk && (unk.cycle_up + unk.cycle_down) > 0)
			rows.push({ name: _('Unknown', 'Virox'), cycle: unk.cycle_up + unk.cycle_down, special: true });
		const shown = rows.filter(r => r.cycle > 0).sort((a, b) => b.cycle - a.cycle);
		const total = shown.reduce((s, r) => s + r.cycle, 0) || 1, max = Math.max(1, ...shown.map(r => r.cycle));
		const people = (pp.people || []).map(p => {
			const mine = dv.devices.filter(d => d.person == p.id);
			return { name: p.name, cycle: mine.reduce((s, d) => s + d.usage.cycle_up + d.usage.cycle_down, 0) };
		}).sort((a, b) => b.cycle - a.cycle);
		const bar = r => E('div', { 'class': 'vx-topbar' + (r.special ? ' vx-special' : '') }, [
			E('span', { 'class': 'vx-topbar-name' }, [ r.special ? '' : E('span', { 'class': 'vx-dot' + (r.online ? ' on' : ''), 'aria-hidden': 'true' }), r.name ]),
			E('span', { 'class': 'vx-topbar-track', 'aria-hidden': 'true' }, [ E('i', { 'style': 'inline-size:%.1f%%'.format(r.cycle * 100 / max) }) ]),
			E('b', {}, [ fmt.bytes(r.cycle), ' ', E('span', { 'class': 'vx-hint' }, [ fmt.percent(r.cycle * 100 / total) ]) ])
		]);
		return E('section', { 'class': 'vx-card' }, [
			E('h3', { 'class': 'vx-card-title' }, [ _('By device') ]),
			shown.length ? E('div', { 'class': 'vx-topbars' }, shown.map(bar)) : hn.empty(_('No usage in this cycle yet.')),
			people.length ? E('h3', {}, [ _('People') ]) : '',
			people.length ? E('div', { 'class': 'vx-topbars' }, people.map(p => bar({ name: fmt.name(p.name), cycle: p.cycle, special: true }))) : '',
			E('p', { 'class': 'vx-hint' }, [ _('"The router itself" is its own traffic (clock, name lookups, updates). "Unknown" is traffic that could not be given to a device.') ])
		]);
	},

	// one device, one person or the house between two days (owner 2026-11-20): pick, then the
	// totals, the days as columns and, for the house or a person, who used what
	rangeCard(dv, pp, us) {
		const iso = d => '%04d-%02d-%02d'.format(d.getFullYear(), d.getMonth() + 1, d.getDate());
		const today = new Date(), ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
		const nameOf = id => {
			if (id == 'router') return _('The router itself');
			if (id == 'guest') return _('Guests');
			if (id == 'unknown') return _('Unknown', 'Virox');
			if (id == 'removed') return _('Removed devices');
			const d = (dv.devices || []).filter(x => x.id == id)[0];
			return d ? fmt.name(hn.deviceName(d)) : fmt.ltr(id);
		};
		const opt = (v, t) => E('option', { 'value': v }, [ t ]);
		const sel = E('select', { 'id': 'vx-r-target' }, [
			opt('', _('The whole house')),
			(pp.people || []).length ? E('optgroup', { 'label': _('People') }, pp.people.map(p => opt(p.id, p.name))) : '',
			E('optgroup', { 'label': _('Devices') }, (dv.devices || []).map(d => opt(d.id, hn.deviceName(d)))),
			E('optgroup', { 'label': _('Other') }, [ opt('router', _('The router itself')), opt('guest', _('Guests')), opt('unknown', _('Unknown', 'Virox')) ])
		]);
		const from = E('input', { 'id': 'vx-r-from', 'type': 'date', 'dir': 'ltr', 'value': String(us.cycle.start || ago(29)), 'max': iso(today) });
		const to = E('input', { 'id': 'vx-r-to', 'type': 'date', 'dir': 'ltr', 'value': iso(today), 'max': iso(today) });
		const out = E('div', { 'class': 'vx-range-out', 'aria-live': 'polite' });
		const tile = (label, value, cls) => E('div', { 'class': 'vx-stat' + (cls ? ' ' + cls : '') }, [ E('span', {}, [ label ]), E('b', {}, [ value ]) ]);
		const show = () => {
			if (!from.value || !to.value || from.value > to.value) { out.replaceChildren(hn.empty(_('Choose a start day before the end day.'))); return; }
			out.replaceChildren(E('p', { 'class': 'vx-hint' }, [ _('Loading…') ]));
			// (a call that cannot even be made, e.g. an old helper file, ends in the same message)
			Promise.resolve().then(() => hn.api.usageRange(sel.value, from.value, to.value)).then(r => {
				if (!r || r.result === false) { out.replaceChildren(hn.empty(_('This range cannot be shown (at most one year).'))); return; }
				const tot = r.total.up + r.total.down;
				// every day of the range (up to two months) as a column, empty days too
				let days = r.days;
				const n = Math.round((new Date(r.to + 'T00:00:00') - new Date(r.from + 'T00:00:00')) / 864e5) + 1;
				if (n <= 62) {
					const have = {}; days.forEach(d => have[d.day] = d); days = [];
					for (let i = 0; i < n; i++) { const d = new Date(r.from + 'T00:00:00'); d.setDate(d.getDate() + i); const k = iso(d); days.push(have[k] || { day: k, up: 0, down: 0 }); }
				}
				const max = Math.max(1, ...days.map(d => d.up + d.down));
				const who = (sel.value == '' || sel.value[0] == 'p') ? r.devices.filter(d => d.up + d.down > 0) : [];
				const wmax = Math.max(1, ...who.map(d => d.up + d.down));
				// two lines (B9, owner 2026-11-20: each line counted on its own): the same usage per line
				const lines = r.lines || null;
				const lname = l => hn.lineName({ id: l.line, name: l.name });
				const split = d => (lines && d.lines) ? E('small', { 'class': 'vx-hint vx-topbar-lines' }, [
					lines.map(l => d.lines[l.line] ? '%s: %s'.format(lname(l), fmt.bytesText(d.lines[l.line].up + d.lines[l.line].down)) : null).filter(x => x).join(' · ') ]) : '';
				out.replaceChildren(
					E('div', { 'class': 'vx-stats' }, [
						tile(_('Total'), fmt.bytes(tot), 'blue'),
						tile(_('Download', 'Virox'), fmt.bytes(r.total.down)),
						tile(_('Upload', 'Virox'), fmt.bytes(r.total.up)),
						tile(_('Daily average'), fmt.bytes(tot / Math.max(1, n)))
					]),
					lines ? E('div', {}, [
						E('h4', { 'class': 'vx-range-sub' }, [ _('Per line') ]),
						lines.length ? E('div', { 'class': 'vx-stats' }, lines.map(l => tile(lname(l), fmt.bytes(l.up + l.down)))) : hn.empty(_('Nothing counted per line in these days yet.')),
						lines.length ? E('p', { 'class': 'vx-hint' }, [ _('The router\'s own traffic and the first minutes of a new device are in the total only.') ]) : ''
					]) : '',
					!tot ? hn.empty(_('No usage in these days.')) : E('div', {}, [
						E('div', { 'class': 'vx-chart', 'role': 'img', 'aria-label': _('Usage per day') }, days.map(d => E('div', { 'class': 'vx-chart-col', 'title': d.day + ': ' + fmt.bytesText(d.up + d.down) }, [
							E('i', { 'style': 'block-size:%.1f%%'.format(Math.max(1, (d.up + d.down) * 100 / max)) }) ]))),
						days.length <= 62 ? E('div', { 'class': 'vx-chart-labels', 'aria-hidden': 'true' }, days.map(d => E('span', { 'dir': 'ltr' }, [ d.day.slice(8) + '/' + d.day.slice(5, 7) ]))) : ''
					]),
					who.length ? E('div', { 'class': 'vx-topbars' }, who.map(d => E('div', { 'class': 'vx-topbar' }, [
						E('span', { 'class': 'vx-topbar-name' }, [ nameOf(d.id), split(d) ]),
						E('span', { 'class': 'vx-topbar-track', 'aria-hidden': 'true' }, [ E('i', { 'style': 'inline-size:%.1f%%'.format((d.up + d.down) * 100 / wmax) }) ]),
						E('b', {}, [ fmt.bytes(d.up + d.down), ' ', E('span', { 'class': 'vx-hint' }, [ fmt.percent((d.up + d.down) * 100 / Math.max(1, tot)) ]) ])
					]))) : ''
				);
			}).catch(e => {
				// a page opened before an update has a login without the new method: log in again
				out.replaceChildren(E('p', { 'class': 'vx-alert danger' }, [
					/access|denied|permission/i.test(String(e && e.message || e)) ? _('Log out and log in again to see this (the router was updated).') : _('This could not be loaded. Try again.') ]));
			});
		};
		const quick = (label, f, t) => E('button', { 'class': 'btn cbi-button', 'type': 'button', 'click': () => { from.value = f; to.value = t; show(); } }, [ label ]);
		sel.addEventListener('change', show); from.addEventListener('change', show); to.addEventListener('change', show);
		setTimeout(show, 0);
		return E('section', { 'class': 'vx-card', 'id': 'vx-range' }, [
			E('h3', { 'class': 'vx-card-title' }, [ _('Usage of a device or a period') ]),
			// one compact row: a small label over each choice (the settings-page rows put the label at
			// one end and the box at the other, owner 2026-11-20)
			E('div', { 'class': 'vx-range-form' }, [
				E('label', { 'class': 'vx-range-f wide', 'for': 'vx-r-target' }, [ E('span', {}, [ _('Device or person') ]), sel ]),
				E('label', { 'class': 'vx-range-f', 'for': 'vx-r-from' }, [ E('span', {}, [ _('From') ]), from ]),
				E('label', { 'class': 'vx-range-f', 'for': 'vx-r-to' }, [ E('span', {}, [ _('To') ]), to ])
			]),
			E('div', { 'class': 'vx-chips', 'role': 'group', 'aria-label': _('Quick choice') }, [
				quick(_('Today'), iso(today), iso(today)),
				quick(_('Yesterday'), ago(1), ago(1)),
				quick(_('Last 7 days'), ago(6), iso(today)),
				quick(_('Last 30 days'), ago(29), iso(today)),
				quick(_('This package cycle'), String(us.cycle.start), iso(today))
			]),
			out
		]);
	},

	render(data) {
		hn.page(this);
		if (!data) return hn.failed();
		const [ us, dv, pp ] = data;
		return E('div', { 'class': 'vx-page vx-usage-page' }, [
			E('h1', {}, [ _('Usage') ]),
			E('p', { 'class': 'vx-sub' }, [ _('How much the house used, day by day and device by device, against the package.') ]),
			this.tiles(us), this.rangeCard(dv, pp, us), this.daysCard(us), this.whoCard(dv, pp), this.packageCard(us)
		]);
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
