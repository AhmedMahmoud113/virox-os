// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Three pages from one view (owner review 2026-11-19, a place for everything):
//  - Internet (admin/internet): the lines and packages (B9 as docs/dualwan-spec.md: state, usage,
//    forecast, who uses which line, both lines for whom and how long, borrowing, the default line
//    of new devices, back to one line), low ping (always on), the ports of game consoles, the VPN;
//  - Wi-Fi (admin/wifi): name and password, the guest network, access points, personal passwords;
//  - Settings (admin/settings): family logins, update, help and backup, display and language, the
//    router and sign-out.
// Internet and Wi-Fi show their parts as tabs; Settings as a list. Changing the Wi-Fi name or
// password goes through the setup wizard (apply-with-rollback, 10.7).
'use strict';
'require view';
'require ui';
'require homenet.ui as hn';
'require virox.fmt as fmt';

const SIGNAL = { excellent: () => _('Excellent'), good: () => _('Good'), weak: () => _('Weak', 'Virox') };

return view.extend({
	// each of the three pages asks only for what it shows (owner 2026-11-22: the pages were slow,
	// every page asked the router 22 questions); a part not asked for gets its empty value, the
	// same as when the router does not answer. I = Internet, W = Wi-Fi, S = Settings.
	load() {
		const page = this.page();
		const ask = (pages, call, empty) => pages.indexOf(page[0]) >= 0 ? call().catch(() => empty) : Promise.resolve(empty);
		return Promise.all([
			hn.api.settings(),
			ask('w', () => hn.api.wifi(), null),
			ask('i', () => hn.api.gaming(), null),
			ask('s', () => hn.api.users(), { users: [] }),
			ask('iws', () => hn.api.people(), { people: [] }),
			ask('iw', () => hn.api.devices(), { devices: [] }),
			ask('ws', () => hn.api.updateStatus(), null),
			ask('s', () => hn.api.backupList(), null),
			ask('s', () => hn.api.provisionInfo(), null),
			ask('s', () => hn.api.theme(), null),
			ask('iw', () => hn.api.lines(), null),
			ask('w', () => hn.api.wifikeys(), null),
			ask('w', () => hn.api.guest(), null),
			ask('iws', () => hn.api.aps(), null),
			ask('i', () => hn.api.vpn(), null),
			ask('w', () => hn.api.apUpdateStatus(), null),
			ask('i', () => hn.api.ports(), null),
			ask('w', () => hn.api.schedule(), null),
			ask('s', () => hn.api.usb(), null),
			ask('w', () => hn.api.wifiCards(), null),
			ask('s', () => hn.api.addresses(), null),
			ask('i', () => hn.api.quality(30), null),
			ask('i', () => hn.api.wifiWanStatus(), null)
		]).catch(() => null);
	},

	packageCard(set) {
		const gb = E('input', { 'id': 'vx-p-gb', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '1', 'dir': 'ltr', 'value': set.package_mb ? hn.gbFromMb(set.package_mb) : '' });
		const day = E('input', { 'id': 'vx-p-day', 'type': 'number', 'lang': 'en', 'inputmode': 'numeric', 'min': '1', 'max': '31', 'dir': 'ltr', 'value': set.renew_day });
		const warn = hn.seg('vx-p-warn', [ 50, 70, 80, 90, 100 ].map(w => [ w, '%d%%'.format(w) ]), set.package_warn);
		return hn.section(_('Internet package'), _('The router counts the usage against it and warns you before it runs out.'), [
			hn.field('vx-p-gb', _('Package size (GB)'), gb, _('Empty if you do not know it.')),
			hn.field('vx-p-day', _('Renews on day'), day, _('The day of the month the provider renews the package.')),
			hn.row(_('Warn me when used'), '', warn.el)
		], [ E('button', { 'class': 'btn cbi-button-positive', 'click': () =>
			hn.act(hn.api.settingsSet(hn.mbFromGb(gb.value), Math.round(+day.value || 1), +warn.value(), undefined), _('Saved.')) }, [ _('Save') ]) ], { 'id': 'vx-package-card' });
	},

	// P5: measure the line (download and upload, about 20 s in the background), then shape it at
	// about 90 % so games and calls keep a low ping
	tuneBtn(id, out) {
		return E('button', { 'class': 'btn cbi-button', 'click': ev => {
			const btn = ev.target, end = text => { btn.disabled = false; out.replaceChildren(text); };
			btn.disabled = true; out.textContent = _('Measuring the download and the upload… about 20 seconds.');
			let n = 0;
			const ask = () => hn.api.lineTuneState(id).then(s => {
				if (s && s.state == 'running' && ++n < 30) return setTimeout(ask, 2000);
				if (s && s.state == 'done') {
					end(fmt.sentence(_('Done: download kept at %s and upload at %s, so games and calls keep a low ping.'), [ fmt.speed(s.down_kbit), fmt.speed(s.up_kbit) ]));
					setTimeout(() => location.reload(), 4000);
				}
				else end(hn.errorText(s && s.state == 'running' ? 'busy' : (s && s.error)));
			}).catch(() => end(_('The router did not answer.')));
			hn.api.lineTune(id).then(r => {
				if (r && r.result) setTimeout(ask, 4000);
				else end(hn.errorText(r && r.error));
			}).catch(() => end(_('The router did not answer.')));
		} }, [ _('Measure and adjust') ]);
	},

	// low ping: always on (R7, cake with priority classes on every line); measuring is a button
	// line quality over the day (owner 2026-11-22): ping, jitter and loss per half hour, the time
	// it was high, and whether the house filled the line then (the cure: priority below) or the
	// line itself was weak (the internet company's side)
	qualityPart(qa, ls) {
		const lines = (qa && qa.lines) || [];
		const info = ls ? (ls.enabled ? ls.lines : ls.lines.slice(0, 1)) : [];
		const shaped = info.some(l => l.shaping);
		const hm = t => { const d = new Date(t * 1000); return '%02d:%02d'.format(d.getHours(), d.getMinutes()); };
		const level = b => b.ping_ms == null || b.loss_pct >= 3 || b.ping_ms >= 100 || (b.jitter_ms || 0) >= 30 ? 'bad' : (b.ping_ms >= 60 ? 'warn' : 'ok');
		const COL = { ok: 'var(--hl-blue, #2563eb)', warn: '#d97706', bad: '#dc2626' };
		const one = q => {
			const l = info.filter(x => x.id == q.line)[0];
			const title = info.length > 1 ? fmt.sentence(_('Ping on %s'), [ fmt.name(hn.lineName(l || { id: q.line })) ]) : _('Ping of the internet line');
			const n = q.now || {};
			const nowLevel = n.ping_ms == null ? 'bad' : level(n);
			const bs = (q.buckets || []).slice(-48);
			// the bad half hours, joined into time ranges
			const ranges = [];
			bs.forEach(b => { if (level(b) != 'bad') return; const last = ranges[ranges.length - 1];
				if (last && b.time - last.end <= qa.minutes * 60) { last.end = b.time + qa.minutes * 60; last.list.push(b); }
				else ranges.push({ start: b.time, end: b.time + qa.minutes * 60, list: [ b ] }); });
			const bad = [].concat(...ranges.map(r => r.list));
			const busy = q.down_kbit && bad.length && bad.filter(b => b.down_kbit != null && b.down_kbit >= q.down_kbit * 0.7).length * 2 >= bad.length;
			const say = !bs.length ? _('Measuring; the first figures come within a few minutes.')
				: !ranges.length ? _('The ping was good all the time.')
				: fmt.sentence(_('The ping was high at: %s'), [ fmt.ltr(ranges.slice(-4).map(r => hm(r.start) + '-' + hm(r.end)).join(', ')) ]);
			// the cause only when the line's speed is known (measured): otherwise "busy" cannot be told
			const why = (!ranges.length || !q.down_kbit) ? '' : (busy
				? (shaped ? _('At those times the house was using most of the line; games and calls still went first.') : _('At those times the house was using most of the line. Turn on priority for games and calls below, then games and calls go first.'))
				: _('At those times the house was not filling the line, so the line itself was weak. If this happens often, tell the internet company.'));
			const max = Math.max(150, ...bs.map(b => b.ping_ms || 0));
			return hn.section(title, '', [
				hn.row(_('Now'), n.ping_ms == null ? _('No answer from the internet') : fmt.sentence(_('Jitter %s ms, loss %s %%'), [ fmt.ltr(String(n.jitter_ms ?? 0)), fmt.ltr(String(n.loss_pct ?? 0)) ]),
					[ hn.badge(nowLevel == 'ok' ? 'ok' : (nowLevel == 'warn' ? 'warn' : 'bad'), n.ping_ms == null ? _('Down', 'Virox') : fmt.sentence(_('%s ms'), [ fmt.ltr(String(Math.round(n.ping_ms))) ])) ]),
				bs.length ? E('div', { 'class': 'vx-chart', 'role': 'img', 'aria-label': _('Ping during the last 24 hours') }, bs.map(b =>
					E('div', { 'class': 'vx-chart-col', 'title': hm(b.time) + (b.ping_ms != null ? ' ' + b.ping_ms + ' ms' : '') }, [
						E('i', { 'style': 'block-size:%.1f%%;background:%s'.format(b.ping_ms == null ? 100 : Math.max(2, Math.min(100, b.ping_ms * 100 / max)), COL[level(b)]) }) ]))) : '',
				bs.length ? E('div', { 'class': 'vx-chart-labels', 'aria-hidden': 'true' }, bs.map((b, i) => E('span', { 'dir': 'ltr' }, [ i % 8 == 0 ? hm(b.time) : '' ]))) : '',
				E('p', { 'class': 'vx-hint' }, [ say ]),
				why ? E('p', { 'class': 'vx-hint' }, [ why ]) : ''
			]);
		};
		return lines.length ? E('div', { 'id': 'vx-quality' }, lines.map(one))
			: hn.section(_('Ping of the internet line'), '', [ E('p', { 'class': 'vx-hint' }, [ _('Measuring; the first figures come within a few minutes.') ]) ]);
	},

	pingCard(ls, gm, qa, ap) {
		const out = E('p', { 'class': 'vx-hint', 'role': 'status' });
		const lines = !ls ? [] : (ls.enabled ? ls.lines : ls.lines.slice(0, 1));
		// an access point has no internet line of its own: its traffic goes out through the main
		// router, so measuring a line and shaping it can only be done there (owner 2026-11-22: the
		// button failed with "Something went wrong" on an access point)
		// (a lead access point reports mode "router" for the access-point list: it has no line either)
		if (hn.isAccessPoint(ap))
			return E('div', {}, [
				this.qualityPart(qa, ls),
				hn.section(_('Low ping for games and calls'), '', [
					E('p', { 'class': 'vx-hint' }, [ _('This router is an access point: the internet line belongs to the main router, so measuring the line and the priority for games and calls are done there.') ])
				])
			]);
		return E('div', {}, [
			this.qualityPart(qa, ls),
			hn.section(_('Low ping for games and calls'), _('Games, voice and video calls go before downloads and uploads. For that the router has to know the speed of the line: measure it once.'), [
				// the truth (2026-11-21): on only where a line is shaped now
				hn.row(_('Priority for games and calls'), lines.some(l => l.shaping) ? _('On: games and calls go first.') : _('Not on yet: press "Measure and adjust" below.'),
					lines.some(l => l.shaping) ? hn.badge('ok', _('On', 'Virox')) : hn.badge('warn', _('Not on yet'))),
				...lines.map(l => hn.row(fmt.sentence(_('Speed of %s'), [ fmt.name(hn.lineName(l)) ]),
					_('The router keeps the line a little below its speed, so a download or an upload cannot fill it. Measuring uses about 60 MB of the package.'),
					[ E('span', { 'class': 'vx-hint' }, [ l.shaping ? fmt.sentence(_('Download %s, upload %s'), [ fmt.speed(l.down_kbit), fmt.speed(l.up_kbit) ]) : _('Not measured') ]), this.tuneBtn(l.id, out) ])),
				out
			]),
			gm && gm.installed ? this.gamingCard(gm) : ''
		]);
	},

	// internet from another router's Wi-Fi (owner 2026-11-22: "make 5 GHz a client"): a router joins
	// that Wi-Fi on the band the admin picks (virox.apctl wifi_wan); the link is counted as a line
	wifiWanCard(ww) {
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 8000); return r; };
		const BAND = { '2g': _('2.4 GHz'), '5g': _('5 GHz') };
		if (ww.on)
			return hn.section(_('Internet from Wi-Fi'), _('This router takes its internet from the Wi-Fi of another router.'), [
				hn.row(_('Network'), BAND[ww.band] || '', E('b', {}, [ fmt.name(ww.ssid || '—') ])),
				hn.row(_('State'), ww.ip ? fmt.ltr(ww.ip) : '', ww.up ? hn.badge('ok', _('Connected')) : hn.badge('warn', _('Not connected'))),
				ww.signal != null ? hn.row(_('Signal'), '', fmt.ltr(ww.signal + ' dBm')) : '',
				ww.clash ? E('p', { 'class': 'vx-warn-text' }, [ _('The other router gives addresses in the same range as this router, so the internet cannot work. Give this router another address range in Quick setup (for example 192.168.3.1).') ]) : '',
				!ww.up ? E('p', { 'class': 'vx-hint' }, [ _('Connecting takes up to a minute. If it stays like this, check the password and that the other router is in reach.') ]) : '',
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Stop taking the internet from this Wi-Fi?'), _('The internet comes from the cable on the WAN port again, if one is plugged in.'), _('Stop'))
					.then(y => y && hn.act(hn.api.wifiWanOff(), _('Stopped.')).then(reload)) }, [ _('Stop') ])
			]);
		// which radio of this router catches (owner 2026-11-22: "I want to be the 5 that catches"): the
		// list then shows only the networks that radio can catch (5 GHz catches 5 GHz, 2.4 catches 2.4)
		const mine = hn.seg('vx-ww-band', [ [ '5g', _('My 5 GHz') ], [ '2g', _('My 2.4 GHz') ] ], '5g');
		let found = [];
		const sel = E('select', { 'aria-label': _('Network') }, [ E('option', { 'value': '' }, [ _('Press "Find networks".') ]) ]);
		const fill = () => {
			const nets = found.filter(n => n.band == mine.value());
			sel.replaceChildren(...(nets.length ? nets.map(n => E('option', { 'value': n.band + '\t' + n.ssid }, [ n.ssid + ' · ' + n.signal + ' dBm' ]))
				: [ E('option', { 'value': '' }, [ found.length ? _('No network of this band found.') : _('No network found.') ]) ]));
		};
		mine.el.addEventListener('click', () => { if (found.length) fill(); });
		const key = E('input', { 'type': 'password', 'dir': 'ltr', 'maxlength': '63', 'autocomplete': 'off', 'aria-label': _('Password of that network') });
		const find = E('button', { 'class': 'btn cbi-button', 'click': () => {
			find.disabled = true; sel.replaceChildren(E('option', { 'value': '' }, [ _('Looking for networks…') ]));
			hn.api.apScan().then(r => {
				found = (r && r.networks) || [];
				fill();
			}).catch(() => sel.replaceChildren(E('option', { 'value': '' }, [ _('The router did not answer.') ]))).then(() => { find.disabled = false; });
		} }, [ _('Find networks') ]);
		const go = () => {
			if (!sel.value) return hn.notify(_('Choose a network first.'), 'warning');
			const i = sel.value.indexOf('\t'), band = sel.value.substring(0, i), ssid = sel.value.substring(i + 1);
			hn.askConfirm(_('Take the internet from this Wi-Fi?'), _('That band of this router follows the channel of the other router. Use an address range different from the other router.'), _('Connect'))
				.then(y => y && hn.act(hn.api.wifiWan(band, ssid, key.value), _('Connecting… this takes up to a minute.')).then(reload));
		};
		return hn.section(_('Internet from Wi-Fi'), _('No cable from the modem? This router can take its internet from the Wi-Fi of another router (for example a neighbour\'s or a mobile hotspot). 5 GHz is usually faster, 2.4 GHz reaches further.'), [
			hn.row(_('Catch with'), _('5 GHz catches only 5 GHz networks and 2.4 GHz only 2.4 GHz ones. Catching with 2.4 GHz leaves your 5 GHz free and fast for your devices.'), mine.el),
			E('div', { 'class': 'vx-inline' }, [ find, sel ]),
			hn.field('', _('Password of that network'), key),
			E('button', { 'class': 'btn cbi-button-positive', 'click': go }, [ _('Connect') ])
		]);
	},

	// "Is it the Wi-Fi or the internet?" (owner 2026-11-22): this phone or computer measures its own
	// connection to this unit (homenet/wifitest: a file in the router's RAM, nothing from the
	// internet), then compares it with the measured speed of the line
	wifiTestCard(ls, ap) {
		const out = E('div', { 'role': 'status' });
		const lines = !ls ? [] : (ls.enabled ? ls.lines : ls.lines.slice(0, 1));
		// a line is shaped at 90 % of its measured speed ("Measure and adjust")
		const lineKbit = hn.isAccessPoint(ap) ? null : (lines.filter(l => l.shaping).map(l => Math.round(l.down_kbit / 0.9))[0] || null);
		const down = (url, ms) => {
			const ctl = new AbortController(), t0 = performance.now();
			let bytes = 0;
			const stop = setTimeout(() => ctl.abort(), ms);
			return fetch(url + '?t=' + Date.now(), { 'cache': 'no-store', 'signal': ctl.signal }).then(res => {
				const rd = res.body.getReader();
				const pump = () => rd.read().then(c => { if (c.done) return; bytes += c.value.length; return pump(); });
				return pump();
			}).catch(() => {}).then(() => { clearTimeout(stop); const s = (performance.now() - t0) / 1000; return bytes > 1048576 ? Math.round(bytes * 8 / s / 1000) : null; });
		};
		const up = (url, size, ms) => {
			const ctl = new AbortController(), t0 = performance.now();
			const stop = setTimeout(() => ctl.abort(), ms);
			return fetch(url, { 'method': 'POST', 'cache': 'no-store', 'body': new Blob([ new Uint8Array(size) ]), 'signal': ctl.signal })
				.then(res => res.json()).then(r => { clearTimeout(stop); return r && r.result ? Math.round(size * 8 / ((performance.now() - t0) / 1000) / 1000) : null; })
				.catch(() => { clearTimeout(stop); return null; });
		};
		const verdict = (d, u) => {
			const sp = k => fmt.speed(k);
			const res = [ hn.row(_('Wi-Fi download here'), '', E('b', {}, [ d ? sp(d) : '—' ])), hn.row(_('Wi-Fi upload here'), '', E('b', {}, [ u ? sp(u) : '—' ])) ];
			if (lineKbit) res.push(hn.row(_('Speed of the internet line'), _('Measured with "Measure and adjust".'), E('b', {}, [ sp(lineKbit) ])));
			let say;
			if (!d) say = _('The test did not finish. Try again, closer to the router.');
			else if (d < 20000) say = _('The Wi-Fi here is weak. Move closer to the router or an access point, or use the 5 GHz network if this device has it.');
			else if (lineKbit && d >= lineKbit * 1.3) say = _('The Wi-Fi here is fine: it is faster than the internet line. If the internet feels slow, the reason is the line or the internet company, not the Wi-Fi.');
			else if (lineKbit && d < lineKbit) say = _('The Wi-Fi here is slower than the internet line, so the Wi-Fi is what holds you back. Move closer to the router or an access point, or use 5 GHz.');
			else if (lineKbit) say = _('The Wi-Fi here and the internet line are about the same speed.');
			else say = _('The Wi-Fi here is fine. To compare it with the internet line, measure the line once in "Ping and games".');
			return res.concat([ E('p', { 'class': 'vx-big' }, [ say ]) ]);
		};
		const btn = E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
			btn.disabled = true;
			out.replaceChildren(E('p', { 'class': 'spinning' }, [ _('Measuring the Wi-Fi of this device… about 20 seconds.') ]));
			hn.api.wifiTest().then(r => {
				if (!r || r.result === false) throw r;
				return down(r.download, 8000).then(d => up(r.upload, 16777216, 10000).then(u => out.replaceChildren(...verdict(d, u))));
			}).catch(r => out.replaceChildren(E('p', { 'class': 'vx-warn-text' }, [ hn.errorText(r && r.error) ])))
			  .then(() => { btn.disabled = false; });
		} }, [ _('Measure now') ]);
		return hn.section(_('Is it the Wi-Fi or the internet?'), _('This device measures its own Wi-Fi to the router, without the internet in the way, and compares it with the internet line. Run it where the internet feels slow. It uses no internet.'), [ btn, out ]);
	},

	// B9: everything about the lines (docs/dualwan-spec.md; R1-R8, O2-O3, X2, spec 4.4)
	linesCard(ls) {
		const [ , , , , pp, dv ] = this.data;
		const people = (pp && pp.people) || [], devices = (dv && dv.devices) || [];
		const done = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 1200); return r; };
		const name = id => id == 'all' ? _('Everyone') : fmt.name(hn.targetName(id, devices, people));
		const untilMidnight = () => { const m = new Date(); m.setHours(24, 0, 0, 0); return Math.max(1, Math.round((m - Date.now()) / 60000)); };
		const DUR = [ [ '60', _('1 hour') ], [ '120', _('2 hours') ], [ 'midnight', _('Until midnight') ], [ '0', _('No time limit') ] ];
		const minutesOf = v => v == 'midnight' ? untilMidnight() : +v;
		const targets = () => [ E('option', { 'value': '' }, [ _('Choose…') ]) ]
			.concat(people.map(p => E('option', { 'value': p.id }, [ _('%s (all devices)').format(p.name) ])))
			.concat(devices.map(d => E('option', { 'value': d.id }, [ hn.deviceName(d) ])));

		if (!ls.enabled)
			return E('div', {}, [
				this.packageCard(this.data[0]),
				hn.section(_('A second internet line'), _('A second internet line: connect the second modem to port LAN 4, then turn it on here. Port LAN 4 then no longer serves home devices.'),
					[], [ E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.linesEnable(true), _('The second line is on.')).then(done) }, [ _('Turn on the second line') ]) ])
			]);

		// one card per line: state, use, package, forecast; its settings and tools folded under it
		const COLOURS = [ '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0d9488' ];
		const one = l => {
			const id = l.id, p = 'vx-l%d-'.format(id);
			const pkg = l.package_mb * fmt.MB, used = l.used_mb * fmt.MB;
			const pct = l.package_mb ? Math.min(100, Math.round(l.used_mb * 100 / l.package_mb)) : 0;
			const nm = E('input', { 'id': p + 'name', 'type': 'text', 'maxlength': '32', 'value': l.name || '', 'placeholder': _('Line %d').format(id) });
			const colour = hn.seg(p + 'colour', COLOURS.map(c => [ c, E('span', { 'class': 'vx-swatch', 'style': 'background:' + c, 'aria-label': c }) ]), l.colour || COLOURS[id - 1]);
			const gb = E('input', { 'id': p + 'gb', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '1', 'dir': 'ltr', 'value': l.package_mb ? hn.gbFromMb(l.package_mb) : '' });
			const day = E('input', { 'id': p + 'day', 'type': 'number', 'lang': 'en', 'inputmode': 'numeric', 'min': '1', 'max': '31', 'dir': 'ltr', 'value': l.renew_day });
			const up = E('input', { 'id': p + 'up', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '1', 'step': '0.5', 'dir': 'ltr', 'value': l.up_kbit / 1000 });
			const down = E('input', { 'id': p + 'down', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '1', 'step': '0.5', 'dir': 'ltr', 'value': l.down_kbit / 1000 });
			const rem = E('input', { 'id': p + 'rem', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '0.1', 'dir': 'ltr', 'value': '', 'aria-label': _('Remaining at the company (GB)') });
			const out = E('p', { 'class': 'vx-hint', 'role': 'status' });
			const fc = l.days_left != null && l.package_mb && !l.used_up ? new Date(Date.now() + l.days_left * 864e5) : null;
			return hn.section(E('span', { 'class': 'vx-line-title' }, [ E('span', { 'class': 'vx-dot', 'style': 'background:' + (l.colour || COLOURS[id - 1]) }), fmt.name(hn.lineName(l)) ]), '', [
				hn.row(_('State'), '', hn.badge(l.up ? (l.used_up ? 'bad' : 'ok') : 'bad', !l.up ? _('Line down') : (l.used_up ? _('Package used up') : _('Working')))),
				hn.row(_('Today'), '', fmt.bytes(l.today_mb * fmt.MB)),
				l.package_mb ? hn.row(_('Package'), fc ? fmt.sentence(_('At this rate it ends on %s'), [ fmt.date(Math.round(fc / 1000)) ]) : '', [
					E('div', { 'class': 'vx-line-pkg' }, [ fmt.usedOf(used, pkg),
						E('div', { 'class': 'vx-meter' }, [ E('div', { 'class': 'vx-meter-fill' + (pct >= 100 ? ' full' : (pct >= 95 ? ' warn' : '')), 'style': 'inline-size:%d%%'.format(pct) }) ]) ]) ])
					: hn.row(_('Used since the last renewal'), _('The package size is not set.'), fmt.bytes(used)),
				E('details', { 'class': 'vx-fold' }, [
					E('summary', {}, [ _('Settings of this line') ]),
					hn.field(p + 'name', _('Name of the line'), nm),
					hn.row(_('Colour'), _('Shown next to the name everywhere.'), colour.el),
					hn.field(p + 'gb', _('Package size (GB)'), gb, _('Empty if you do not know it. You are warned at 80 %, 95 % and 100 %.')),
					hn.field(p + 'day', _('Renews on day'), day, _('The day of the month the provider renews the package.')),
					hn.field(p + 'down', _('Download speed of the line (Mbit/s)'), down),
					hn.field(p + 'up', _('Upload speed of the line (Mbit/s)'), up),
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.lineSet(id, nm.value.trim(), colour.value(), hn.mbFromGb(gb.value) || 0,
						Math.round(+day.value || 1), l.warn || 80, Math.round((+up.value || 30) * 1000), Math.round((+down.value || 30) * 1000)), _('Saved.')).then(done) }, [ _('Save') ])
				]),
				E('details', { 'class': 'vx-fold' }, [
					E('summary', {}, [ _('Measure and correct') ]),
					hn.row(_('Speed test'), _('Measures the download speed of this line now. Uses about 50 MB.'), E('button', { 'class': 'btn cbi-button', 'click': ev => {
						ev.target.disabled = true; out.textContent = _('Measuring… about 15 seconds.');
						hn.api.lineSpeedtest(id).then(r => {
							ev.target.disabled = false;
							out.replaceChildren(r && r.result ? fmt.sentence(_('Download speed now: %s'), [ fmt.speed(r.down_kbit) ]) : hn.errorText(r && r.error));
						}).catch(() => { ev.target.disabled = false; out.textContent = _('The router did not answer.'); });
					} }, [ _('Measure') ])),
					hn.row(_('Package renewed early'), _('The usage of this line starts again from zero.'), E('button', { 'class': 'btn cbi-button', 'click': () =>
						hn.askConfirm(_('Start a new package cycle from today?'), _('The usage of this line starts again from zero.'), _('Renewed'))
							.then(y => y && hn.act(hn.api.lineRenewed(id), _('Saved.')).then(done)) }, [ _('Renewed today') ])),
					l.package_mb ? hn.row(_('Remaining at the company (GB)'), _('Copy the figure the company shows; the router continues from it.'), [ rem,
						E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.lineCalibrate(id, hn.mbFromGb(rem.value) || 0), _('Saved.')).then(done) }, [ _('Save') ]) ]) : '',
					out
				])
			], null, { 'class': 'vx-card vx-sec vx-line' });
		};

		// who uses which line (R2, spec 4.4): the default line, then everyone placed on a line
		const placed = (ls.assignments || []).filter(a => a.kind == 'line' && a.line);
		const def = hn.seg('vx-l-default', ls.lines.map(l => [ l.id, hn.lineName(l) ]), ls.default_line || 1);
		const who = hn.section(_('Who uses which line'), _('Every device uses only its own line and counts on its package. Change the line of a device or a person from its page (Devices, Internet tab).'), [
			hn.row(_('Default line'), _('For new devices and every device not placed on a line.'), [ def.el,
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.lineDefault(+def.value()), _('Saved.')).then(done) }, [ _('Save') ]) ]),
			...placed.map(a => hn.row(name(a.target), '', E('span', {}, [ fmt.name(hn.lineName(ls.lines[a.line - 1])) ])))
		]);

		// both lines (R4): nobody, chosen people or devices, or everyone; one tap, optional time
		const both = (ls.assignments || []).filter(a => a.kind == 'both');
		const forWhom = hn.seg('vx-b-who', [ [ 'all', _('Everyone') ], [ 'some', _('Chosen people or devices') ] ], 'all');
		const pick = E('select', { 'id': 'vx-b-target', 'aria-label': _('Who') }, targets());
		const bdur = hn.seg('vx-b-dur', DUR, '120');
		const bothCard = hn.section(_('Both lines together'), _('Many downloads at once use both lines and get faster. One single download stays at the speed of one line.'), [
			...both.map(a => hn.row(name(a.target), a.minutes_left != null ? fmt.sentence(_('%s left'), [ fmt.minutes(a.minutes_left) ]) : _('No time limit'),
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.linesEnd(a.target), _('Ended.')).then(done) }, [ _('End') ]))),
			hn.row(_('For whom'), '', forWhom.el),
			hn.row(_('Who'), _('Only when "Chosen people or devices" is selected.'), pick),
			hn.row(_('For how long'), '', bdur.el)
		], [ E('button', { 'class': 'btn cbi-button-action', 'click': () => {
			const t = forWhom.value() == 'all' ? 'all' : pick.value;
			if (!t) return hn.notify(_('Choose a person or a device first.'), 'warning');
			hn.act(hn.api.linesBoth(t, minutesOf(bdur.value())), _('Started.')).then(done);
		} }, [ _('Start') ]) ]);

		// borrowing (R3, O2): explicit, limited by time or amount, ends by itself
		const borrow = (ls.assignments || []).filter(a => a.kind == 'borrow');
		const bpick = E('select', { 'id': 'vx-w-target', 'aria-label': _('Who') }, targets());
		const wdur = hn.seg('vx-w-dur', DUR, 'midnight');
		const wgb = E('input', { 'id': 'vx-w-gb', 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'step': '0.5', 'dir': 'ltr', 'value': '' });
		const borrowCard = hn.section(_('Borrow the other line'), _('For a package that is used up, or when more speed is needed. It ends by itself at the time or amount you set.'), [
			...borrow.map(a => hn.row(name(a.target), [ a.minutes_left != null ? fmt.sentence(_('%s left'), [ fmt.minutes(a.minutes_left) ]) : '',
				a.mb_limit ? fmt.sentence(_('up to %s'), [ fmt.bytes(a.mb_limit * fmt.MB) ]) : '' ].filter(x => x).length ? E('span', {}, [
					a.minutes_left != null ? fmt.sentence(_('%s left'), [ fmt.minutes(a.minutes_left) ]) : '', ' ',
					a.mb_limit ? fmt.sentence(_('up to %s'), [ fmt.bytes(a.mb_limit * fmt.MB) ]) : '' ]) : '',
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.linesEnd(a.target), _('Ended.')).then(done) }, [ _('End') ]))),
			hn.row(_('Who'), '', bpick),
			hn.row(_('For how long'), '', wdur.el),
			hn.field('vx-w-gb', _('Up to (GB)'), wgb, _('Empty = no amount limit.'))
		], [ E('button', { 'class': 'btn cbi-button-action', 'click': () => {
			if (!bpick.value) return hn.notify(_('Choose a person or a device first.'), 'warning');
			hn.act(hn.api.lineBorrow(bpick.value, minutesOf(wdur.value()), hn.mbFromGb(wgb.value) || 0), _('Started.')).then(done);
		} }, [ _('Start') ]) ]);

		return E('div', {}, [
			E('div', { 'class': 'vx-grid vx-lines' }, ls.lines.map(one)),
			who, bothCard, borrowCard,
			hn.section(_('Back to one line'), _('Everyone uses the first line again, and port LAN 4 serves home devices again. The settings of both lines are kept.'), [], [
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Use one line only?'), _('Everyone uses the first line again, and port LAN 4 serves home devices.'), _('One line'))
					.then(y => y && hn.act(hn.api.linesEnable(false), _('The second line is off.')).then(done)) }, [ _('Use one line only') ])
			], { 'class': 'vx-card vx-sec danger' })
		]);
	},

	// B9 R5: phones that change their address are still told apart: a personal Wi-Fi password per
	// person (the router sees which one a phone used), and automatic recognition by DHCP
	// BUILD-PLAN 15.9 item 3: "Add a person" = a name and a password in one step; every device that
	// joins with it lands under that person by itself (main router and every access point). One
	// password per person for all their devices; the household password stays for guests and others.
	identityCard(wk, pp, dv) {
		const people = (pp && pp.people) || [];
		const devices = (dv && dv.devices) || [];
		const keyOf = id => ((wk.keys || []).filter(k => k.person == id)[0] || {}).key || '';
		const homeSsid = (((this.data[19] || {}).networks || []).filter(n => n.kind == 'home')[0] || {});
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 2500); return r; };
		const gen = () => {
			const a = 'abcdefghjkmnpqrstuvwxyz23456789';
			const r = new Uint32Array(10); crypto.getRandomValues(r);
			return Array.from(r).map(x => a[x % a.length]).join('');
		};
		const name = E('input', { 'id': 'vx-pk-name', 'type': 'text', 'dir': 'auto', 'maxlength': '40', 'placeholder': _('For example: Ahmed') });
		const key = E('input', { 'id': 'vx-pk-key', 'type': 'text', 'dir': 'ltr', 'maxlength': '63', 'autocomplete': 'off', 'value': gen() });
		const withKey = people.filter(p => keyOf(p.id)), without = people.filter(p => !keyOf(p.id));
		const personRow = p => {
			const k = keyOf(p.id), mine = devices.filter(d => d.person == p.id);
			const inp = E('input', { 'type': 'text', 'dir': 'ltr', 'maxlength': '63', 'autocomplete': 'off', 'value': gen(), 'aria-label': _('New Wi-Fi password of %s').format(p.name) });
			return E('li', { 'class': 'vx-person-key' }, [
				E('div', { 'class': 'vx-rows' }, [
					E('strong', {}, [ fmt.name(p.name) ]),
					E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Password: %s'), [ fmt.ltr(k) ]) ]),
					E('span', { 'class': 'vx-row-line' }, [ mine.length ? fmt.sentence(_('Devices: %s'), [ fmt.count(mine.length, 'device') ]) : _('No device has joined with this password yet.') ]),
					mine.length ? E('ul', { 'class': 'vx-sublist' }, mine.map(d => E('li', {}, [ fmt.name(hn.deviceName(d)) ]))) : ''
				]),
				homeSsid.ssid ? hn.wifiQr(homeSsid.ssid, k, false, homeSsid.hidden, _('QR code of the password of %s').format(p.name)) : '',
				E('div', { 'class': 'vx-actions' }, [
					homeSsid.ssid ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(p.name, homeSsid.ssid, k, false, homeSsid.hidden, 'a4') }, [ _('Print') ]) : '',
					homeSsid.ssid ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(p.name, homeSsid.ssid, k, false, homeSsid.hidden, 'small') }, [ _('Print a small card') ]) : '',
					E('details', {}, [ E('summary', {}, [ _('Change the password') ]), inp,
						E('button', { 'class': 'btn cbi-button', 'click': () => { inp.value = gen(); } }, [ _('New password') ]),
						E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.askConfirm(_('Change the password of %s?').format(p.name),
							_('Every device of this person must join the Wi-Fi again with the new password.'), _('Change'))
							.then(y => y && hn.act(hn.api.wifikeySet(p.id, inp.value.trim()), _('Saved. Wi-Fi restarts for a few seconds.')).then(reload)) }, [ _('Save') ]) ]),
					E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Remove the password of %s?').format(p.name),
						_('Every device of this person must join the Wi-Fi again, with the household password. The person and their devices stay.'), _('Remove', 'Virox'))
						.then(y => y && hn.act(hn.api.wifikeySet(p.id, ''), _('Removed.')).then(reload)) }, [ _('Remove the password') ])
				])
			]);
		};
		return hn.card(_('Personal Wi-Fi passwords'), [
			E('p', { 'class': 'vx-hint' }, [ _('Same network name, one password for each person, for all their devices. A device that joins with a person\'s password is added to that person by itself, here and on every access point. The household password keeps working for guests and other devices.') ]),
			wk.wpa2 ? E('p', { 'class': 'vx-warn-text' }, [ _('While personal passwords exist, the Wi-Fi uses WPA2 security (WPA3 cannot have one password per person).') ]) : '',
			E('fieldset', { 'class': 'vx-add-person' }, [
				E('legend', {}, [ _('Add a person') ]),
				hn.field('vx-pk-name', _('Name'), name),
				hn.field('vx-pk-key', _('Wi-Fi password'), key, _('Made for you; you may type another one (8 to 63 characters).')),
				E('div', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': () => { key.value = gen(); } }, [ _('New password') ]),
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.personWithKey(name.value.trim(), key.value.trim()), _('Added. Wi-Fi restarts for a few seconds.')).then(reload) }, [ _('Add', 'Virox') ])
				])
			]),
			withKey.length ? E('ul', { 'class': 'vx-list' }, withKey.map(personRow)) : hn.empty(_('No person has a password yet.')),
			without.length ? E('details', {}, [ E('summary', {}, [ _('People without a password') ]), E('ul', { 'class': 'vx-list' }, without.map(p => {
				const inp = E('input', { 'type': 'text', 'dir': 'ltr', 'maxlength': '63', 'autocomplete': 'off', 'value': gen(), 'aria-label': _('Wi-Fi password of %s').format(p.name) });
				return E('li', {}, [ E('span', { 'class': 'vx-name' }, [ fmt.name(p.name) ]), inp,
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.wifikeySet(p.id, inp.value.trim()), _('Saved. Wi-Fi restarts for a few seconds.')).then(reload) }, [ _('Give a password') ]) ]);
			})) ]) : '',
			E('h3', {}, [ _('Telling devices apart') ]),
			E('p', { 'class': 'vx-hint' }, [ _('Phones may use a different device number for each network, so the router can mistake them for new devices. The surest way: turn off "private address" for this network on each phone (see the guide in the help).') ]),
			E('h3', {}, [ _('Automatic recognition') ]),
			E('label', { 'class': 'vx-switch' }, [
				E('input', { 'type': 'checkbox', 'checked': wk.autolink ? '' : null, 'change': ev => hn.act(hn.api.autolink(ev.target.checked), _('Saved.')) }), ' ',
				E('span', {}, [ _('Recognise a phone that comes back with a new device number') ]),
				E('span', { 'class': 'vx-hint vx-row-line' }, [ _('Only when its name and its way of asking for an address match one known device exactly; a partial match is shown to you as a question.') ])
			])
		], { 'id': 'vx-identity' });
	},

	// B9 Y2 guest network: own name and password, internet only, QR code for visitors
	guestCard(gu, ls) {
		const done = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 2500); return r; };
		const gen = () => {
			const a = 'abcdefghjkmnpqrstuvwxyz23456789';
			const r = new Uint32Array(10); crypto.getRandomValues(r);
			return Array.from(r).map(x => a[x % a.length]).join('');
		};
		const ssid = E('input', { 'id': 'vx-g-ssid', 'type': 'text', 'maxlength': '32', 'dir': 'auto', 'value': gu.ssid || _('Guests') });
		const key = E('input', { 'id': 'vx-g-key', 'type': 'text', 'maxlength': '63', 'dir': 'ltr', 'autocomplete': 'off', 'value': gu.key || gen() });
		const line = (ls && ls.enabled) ? E('select', { 'id': 'vx-g-line' }, [ [ 0, _('As the default (%s)').format(hn.lineName(ls.lines[(ls.default_line || 1) - 1])) ],
			[ 1, hn.lineName(ls.lines[0]) ], [ 2, hn.lineName(ls.lines[1]) ], [ 3, _('Both lines') ] ].map(o => E('option', { 'value': o[0], 'selected': gu.line == o[0] ? '' : null }, [ o[1] ]))) : null;
		// which band the guests use (owner 2026-11-20): 2.4 GHz reaches further and is the default
		const band = E('select', { 'id': 'vx-g-band' }, [ [ '2g', _('2.4 GHz (reaches further)') ], [ '5g', _('5 GHz (faster, nearer)') ], [ 'both', _('Both') ] ]
			.map(o => E('option', { 'value': o[0], 'selected': (gu.band || '2g') == o[0] ? '' : null }, [ o[1] ])));
		// QR code made in the browser by LuCI's uqr library (shared helper, 15.9 item 2); nothing leaves the router
		const qr = (gu.enabled && gu.ssid && gu.key) ? hn.wifiQr(gu.ssid, gu.key, false, !!gu.hidden, _('QR code of the guest network')) : '';
		const prints = (gu.enabled && gu.ssid && gu.key) ? E('div', { 'class': 'vx-actions' }, [
			E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(_('Guest network'), gu.ssid, gu.key, false, !!gu.hidden, 'a4') }, [ _('Print') ]),
			E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(_('Guest network'), gu.ssid, gu.key, false, !!gu.hidden, 'small') }, [ _('Print a small card') ]) ]) : '';
		const save = on => hn.act(hn.api.guestSet(on, ssid.value.trim(), key.value.trim(), line ? +line.value : 0, band.value),
			on ? _('Saved. Wi-Fi restarts for a few seconds.') : _('The guest network is off.')).then(done);
		return hn.card(_('Guest network'), [
			E('p', { 'class': 'vx-hint' }, [ _('Visitors get internet only: they cannot open the router pages, see the home devices or each other.') ]),
			hn.field('vx-g-ssid', _('Network name'), ssid),
			gu.enabled ? this.hideBox(gu.ssid || '', !!gu.hidden, on => hn.api.guestHidden(on)) : '',
			hn.field('vx-g-key', _('Password'), key),
			E('button', { 'class': 'btn cbi-button', 'click': () => { key.value = gen(); } }, [ _('New password') ]),
			hn.field('vx-g-band', _('Band'), band),
			line ? hn.field('vx-g-line', _('Uses'), line) : '',
			E('div', { 'class': 'vx-actions' }, [
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => save(true) }, [ gu.enabled ? _('Save') : _('Turn on the guest network') ]),
				gu.enabled ? E('button', { 'class': 'btn cbi-button-negative', 'click': () => save(false) }, [ _('Turn off') ]) : ''
			]),
			this.guestLimitsPart(gu),
			gu.enabled ? E('h3', {}, [ _('For visitors') ]) : '',
			gu.enabled ? E('p', { 'class': 'vx-hint' }, [ _('The visitor points the phone camera at the code and joins without typing.') ]) : '',
			qr, prints
		], { 'id': 'vx-guest' });
	},

	// guest limits (owner 2026-11-22): one speed for all guests together, and switch off by itself
	guestLimitsPart(gu) {
		const num = (id, kbit) => E('input', { 'id': id, 'type': 'number', 'lang': 'en', 'inputmode': 'decimal', 'min': '0', 'max': '1000', 'step': '0.1', 'dir': 'ltr', 'value': kbit ? kbit / 1000 : '' });
		const sd = num('vx-g-sdown', gu.down_kbit), su = num('vx-g-sup', gu.up_kbit);
		const hrs = E('select', { 'id': 'vx-g-hours' }, [ 0, 1, 2, 3, 4, 6, 8, 12, 24 ].map(h =>
			E('option', { 'value': h, 'selected': (gu.hours || 0) == h ? '' : null }, [ h ? fmt.countText(h, 'hour') : _('Never') ])));
		return E('div', { 'id': 'vx-guest-limits' }, [
			E('h3', {}, [ _('Limits for guests') ]),
			E('p', { 'class': 'vx-hint' }, [ _('One speed shared by all guests together, so visitors never slow the house down. Empty or 0 = no limit.') ]),
			hn.field('vx-g-sdown', _('Download (Mbit/s)'), sd),
			hn.field('vx-g-sup', _('Upload (Mbit/s)'), su),
			hn.field('vx-g-hours', _('Switch the guest network off by itself after'), hrs),
			gu.enabled && gu.off_at ? E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('It switches off at %s.'), [ fmt.time(gu.off_at) ]) ]) : '',
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.guestLimits(Math.round((+sd.value || 0) * 1000),
				Math.round((+su.value || 0) * 1000), +hrs.value), _('Saved.')).then(r => { if (r && r.result !== false) setTimeout(() => location.reload(), 800); return r; }) }, [ _('Save') ])
		]);
	},

	// BUILD-PLAN 15.9 item 2: a QR code for every network of the house, and its printed card
	qrCard(cards) {
		const nets = (cards && cards.networks) || [];
		const title = n => n.kind == 'guest' ? _('Guest network') : (n.kind == 'person' ? n.name : _('Home Wi-Fi'));
		const bandText = n => n.kind != 'home' || n.bands.length != 1 ? '' : (n.bands[0] == '5g' ? _('5 GHz only') : _('2.4 GHz only'));
		return hn.card(_('QR codes and printing'), [
			E('p', { 'class': 'vx-hint' }, [ _('Point a phone camera at a code to join without typing. Print puts only the card on the paper: the name, the password and the code.') ]),
			nets.length ? E('ul', { 'class': 'vx-list vx-qr-list' }, nets.map(n => E('li', {}, [
				E('div', { 'class': 'vx-rows' }, [
					E('strong', {}, [ fmt.name(title(n)) ]),
					E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Network name: %s'), [ fmt.name(n.ssid) ]) ]),
					bandText(n) ? E('span', { 'class': 'vx-row-line' }, [ bandText(n) ]) : '',
					n.open ? E('span', { 'class': 'vx-row-line' }, [ _('No password') ]) : E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Password: %s'), [ fmt.ltr(n.key) ]) ]),
					n.hidden ? E('span', { 'class': 'vx-row-line' }, [ _('Hidden network: the code still works.') ]) : ''
				]),
				hn.wifiQr(n.ssid, n.key, n.open, n.hidden, _('QR code of %s').format(title(n))),
				E('div', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(title(n), n.ssid, n.key, n.open, n.hidden, 'a4') }, [ _('Print') ]),
					E('button', { 'class': 'btn cbi-button', 'click': () => hn.printWifiCard(title(n), n.ssid, n.key, n.open, n.hidden, 'small') }, [ _('Print a small card') ])
				])
			]))) : hn.empty(_('No Wi-Fi network is on.'))
		], { 'id': 'vx-qr' });
	},

	// B9 Y1/Y3 access points: on the main router pair, name, channels, firmware, roaming; on an
	// access point: join the main router with its code
	apsCard(ap) {
		const done = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 1200); return r; };
		if (ap.mode == 'ap') {
			// joined: the main router manages it. Main router not a Virox (an ISP router): nothing to
			// join, say so plainly instead of waiting for a router that never answers (owner 2026-11-20)
			// under a router that is not a Virox the access points choose a lead that collects the
			// others' devices and usage (owner 2026-11-20); a link to its pages
			const leadLink = ip => ip ? E('p', {}, [ E('a', { 'class': 'btn cbi-button', 'href': 'http://' + ip + '/', 'dir': 'ltr' }, [ _('Open its pages'), ' (', fmt.ltr(ip), ')' ]) ]) : '';
			if (ap.paired && ap.via == 'lead')
				return E('div', { 'id': 'vx-aps' }, [
					hn.section(_('Another access point collects this one'), _('The main router is not a Virox router, so another Virox access point manages this one: the Wi-Fi name, the passwords and the channel come from it, and it shows the devices and usage of every access point. Change them there.'), [ leadLink(ap.main_ip) ])
				]);
			if (ap.paired)
				return E('div', { 'id': 'vx-aps' }, [
					hn.section(_('This router is an access point'), _('The main router manages it: the Wi-Fi name, the passwords and the channel come from there. Change them on the main router.'), [ this.uplinkLine(ap.uplink) ])
				]);
			if (ap.main_kind == 'other' && ap.role == 'member')
				return E('div', { 'id': 'vx-aps' }, [
					hn.section(_('Waiting to be added'), _('Another Virox access point collects the access points of this house. Open its pages, then Wi-Fi, Access points, and press Add next to this one.'), [ leadLink(ap.lead_ip) ])
				]);
			if (ap.main_kind == 'other' || ap.repeat)
				return E('div', { 'id': 'vx-aps' }, [
					ap.repeat ? '' : hn.section(_('This access point works on its own'), _('The main router is not a Virox router, so there is nothing to join. Set the Wi-Fi name and password here, in Wi-Fi. The devices on this access point and their usage show on these pages. If you add more Virox access points, this one collects their devices and usage.'), []),
					this.repeatCard(ap)
				]);
			const code = E('input', { 'id': 'vx-ap-code', 'type': 'text', 'inputmode': 'numeric', 'lang': 'en', 'dir': 'ltr', 'maxlength': '6', 'autocomplete': 'off' });
			return E('div', { 'id': 'vx-aps' }, [
				hn.section(_('This router is an access point'), _('It finds the main router by itself over the cable. On the main router open Wi-Fi, Access points, and press Add next to this router. It then gets the Wi-Fi name, the passwords and its channel.'), []),
				hn.section(_('Without a cable'), _('Place this router where the main router reaches it, then on the main router open Wi-Fi, Access points, and press "Add without a cable". This router finds it within a few minutes and shows there; press Add.'), []),
				this.repeatCard(ap),
				E('details', { 'class': 'vx-card vx-fold-card' }, [
					E('summary', {}, [ _('Join with a code instead') ]),
					hn.field('vx-ap-code', _('Code from the main router'), code),
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.apJoin(code.value.trim()), _('Joined. The Wi-Fi settings arrive within a minute.')).then(done) }, [ _('Join') ])
				])
			]);
		}
		const codeBox = E('p', { 'class': 'vx-big', 'role': 'status' });
		const now = Date.now() / 1000;
		const row = a => {
			const nm = E('input', { 'type': 'text', 'maxlength': '32', 'dir': 'auto', 'value': a.name, 'aria-label': _('Name of the access point') });
			const chSel = (list, cur, label) => E('select', { 'aria-label': label }, [ [ 'auto', _('Automatic') ] ].concat(list.map(c => [ String(c), String(c) ]))
				.map(o => E('option', { 'value': o[0], 'selected': String(cur) == o[0] ? '' : null }, [ o[1] ])));
			const c2 = chSel([ 1, 6, 11 ], a.channel2, _('2.4 GHz channel')), c5 = chSel([ 36, 44, 52, 60 ], a.channel5, _('5 GHz channel'));
			const pw = E('select', { 'aria-label': _('Transmit power') }, [ [ 'auto', _('Power: automatic') ], [ 'high', _('Power: high') ], [ 'medium', _('Power: medium') ], [ 'low', _('Power: low') ] ]
				.map(o => E('option', { 'value': o[0], 'selected': (a.power || 'auto') == o[0] ? '' : null }, [ o[1] ])));
			return E('li', { 'class': 'vx-ap' }, [
				E('div', {}, [
					E('strong', {}, [ fmt.name(a.name || a.id) ]), ' ',
					hn.badge(a.online ? 'ok' : 'bad', a.online ? _('Online') : _('Offline')),
					a.updating ? [ ' ', hn.badge('warn', _('Updating')) ] : '',
					E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Devices connected: %s'), [ fmt.ltr(String(a.clients)) ]) ]),
					E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Version: %s'), [ fmt.ltr(a.version || '—') ]),
						a.version && ap.version && a.version != ap.version ? [ ' ', hn.badge('warn', _('Older than the main router')) ] : '' ]),
					E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Channels now: %s and %s'), [ fmt.ltr(String(a.channels.ch2)), fmt.ltr(String(a.channels.ch5)) ]) ]),
					this.uplinkLine(a.uplink)
				]),
				E('div', { 'class': 'vx-inline' }, [ nm, c2, c5, pw,
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.apSet(a.id, nm.value.trim(), c2.value, c5.value, pw.value), _('Saved. Channel and power change at night; the name at once.')).then(done) }, [ _('Save') ]) ]),
				E('div', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'disabled': a.updating ? '' : null, 'click': () => hn.askConfirm(_('Update this access point?'), _('It restarts once; its devices move to another access point or wait a few minutes.'), _('Update'))
						.then(y => y && hn.act(hn.api.apUpdate(a.id), _('The update starts at its next contact.')).then(done)) }, [ _('Update') ]),
					E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Forget this access point?'), _('It keeps working with its last settings, but the main router no longer manages it.'), _('Forget'))
						.then(y => y && hn.act(hn.api.apForget(a.id), _('Forgotten.')).then(done)) }, [ _('Forget') ])
				])
			]);
		};
		const found = ap.found || [];
		return E('div', { 'id': 'vx-aps' }, [
			// an access point that leads the others (the main router is not a Virox)
			ap.lead ? E('div', { 'class': 'vx-alert info', 'role': 'note' }, [ _('The main router is not a Virox router, so this access point collects the other Virox access points of the house: add each one below. Their devices and usage then show on these pages, and they take the Wi-Fi name and password from here.') ]) : '',
			hn.section(_('Add an access point'), ap.lead ? _('Set the new router to access point mode in its setup and connect it to the same network (the main router or its switch). It shows here by itself within a few minutes; press Add.') : _('Set the new router to access point mode in its setup and connect it to this router by cable. It shows here by itself within a minute; press Add. Any number can be added.'), [
				found.length ? E('ul', { 'class': 'vx-list' }, found.map(f => E('li', {}, [
					E('span', { 'class': 'vx-name' }, [ E('strong', {}, [ fmt.ltr(f.model || _('Access point')) ]), E('br'), E('span', { 'class': 'vx-hint' }, [ fmt.ltr(f.mac) ]) ]),
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.apApprove(f.mac), _('Added. It gets the Wi-Fi settings within a minute.')).then(done) }, [ _('Add', 'Virox') ])
				]))) : E('p', { 'class': 'vx-hint', 'role': 'status' }, [ _('Waiting for a new access point… none found on the cable yet.') ]),
				// without a cable (15.4 item 1): a join window of 10 minutes
				E('div', { 'class': 'vx-actions' }, [
					ap.join_until
						? E('p', { 'role': 'status', 'class': 'vx-warn-text' }, [ fmt.sentence(_('Adding without a cable is open until %s.'), [ fmt.ltr(new Date(ap.join_until * 1000).toTimeString().slice(0, 5)) ]),
							' ', E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.apJoinClose(), _('Closed.')).then(done) }, [ _('Close now') ]) ])
						: E('button', { 'class': 'btn cbi-button', 'click': () => hn.askConfirm(_('Add an access point without a cable?'),
							_('For 10 minutes this router opens a joining network. Set the new router to access point mode, place it where this router (or another access point) reaches it, and switch it on. It shows here within a few minutes; press Add. It then uses the wireless link between Virox routers.'), _('Open for 10 minutes'))
							.then(y => y && hn.act(hn.api.apJoinOpen(10), _('Open for 10 minutes.')).then(done)) }, [ _('Add without a cable') ])
				]),
				E('details', { 'class': 'vx-fold' }, [
					E('summary', {}, [ _('Join with a code instead') ]),
					E('p', { 'class': 'vx-hint' }, [ _('Only if the new router does not show here: get a code and type it on the new router (Wi-Fi, Access points). The code works for 10 minutes.') ]),
					E('button', { 'class': 'btn cbi-button', 'click': () => hn.api.apPairCode().then(r => {
						codeBox.textContent = (r && r.result) ? r.code : hn.errorText(r && r.error);
					}).catch(() => { codeBox.textContent = _('The router did not answer.'); }) }, [ _('Get a code') ]),
					codeBox
				])
			]),
			hn.card(_('Joined access points'), [
			ap.aps.length ? E('ul', { 'class': 'vx-list' }, ap.aps.map(row)) : hn.empty(_('No access point joined yet.')),
			E('h3', {}, [ _('Fast roaming') ]),
			E('label', { 'class': 'vx-switch' }, [
				E('input', { 'type': 'checkbox', 'checked': ap.roaming ? '' : null, 'change': ev => hn.act(hn.api.apSettings(ev.target.checked), _('Saved. Wi-Fi restarts for a few seconds.')) }), ' ',
				E('span', {}, [ _('Phones move between access points without dropping calls (802.11r)') ]),
				E('span', { 'class': 'vx-hint vx-row-line' }, [ _('Some old devices cannot join a network with fast roaming. Turn it off if a device stops connecting.') ])
			]),
			E('h3', {}, [ _('Wireless link between Virox routers') ]),
			E('label', { 'class': 'vx-switch' }, [
				E('input', { 'type': 'checkbox', 'checked': ap.mesh ? '' : null, 'change': ev => hn.act(hn.api.apMesh(ev.target.checked), _('Saved. Wi-Fi restarts for a few seconds.')) }), ' ',
				E('span', {}, [ _('Access points without a cable, and a backup link when a cable is pulled') ]),
				E('span', { 'class': 'vx-hint vx-row-line' }, [ _('A cable is always used first. All Virox routers then use the 5 GHz channel of this router. Turn it off only if every access point has a cable and you want them on different channels.') ])
			])
			]),
			ap.aps.length ? this.updateAllCard(this.data[15], ap) : ''
		]);
	},

	// how an access point reaches the main router (15.4 item 1): cable, or wireless with its signal
	uplinkLine(u) {
		if (!u || !u.kind || u.kind == 'none') return '';
		if (u.kind == 'cable') return E('p', { 'class': 'vx-hint' }, [ _('Link: cable') ]);
		const word = { excellent: _('Excellent'), good: _('Good'), weak: _('Weak', 'Virox') }[u.label] || '';
		return E('p', { 'class': 'vx-hint' }, [
			fmt.sentence(u.kind == 'repeat' ? _('Link: repeating another router, signal %s') : _('Link: wireless, signal %s'), [ word ]),
			u.label == 'weak' ? [ ' ', hn.badge('warn', _('Move it closer to the main router or to another access point.')) ] : ''
		]);
	},

	// under a router that is not a Virox, without a cable: repeat that router's Wi-Fi
	repeatCard(ap) {
		const done = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 4000); return r; };
		if (ap.repeat)
			return hn.section(_('Repeating another router'), _('This access point is connected by Wi-Fi to another router and repeats its internet. Devices behind it may be counted together, as one device, on the other router.'), [
				hn.row(_('Network'), '', fmt.name(ap.repeat.ssid)),
				this.uplinkLine(ap.uplink)
			], [ E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.act(hn.api.apRepeatOff(), _('Stopped.')).then(done) }, [ _('Stop repeating') ]) ]);
		const list = E('div', { 'class': 'vx-checks' }, [ E('p', { 'class': 'vx-hint' }, [ _('Press "Find networks".') ]) ]);
		let pick = null;
		const key = E('input', { 'id': 'vx-rp-key', 'type': 'password', 'dir': 'ltr', 'maxlength': '63', 'autocomplete': 'off' });
		const find = () => {
			list.replaceChildren(E('p', { 'class': 'spinning' }, [ _('Looking for networks…') ]));
			hn.api.apScan().then(r => {
				const nets = (r && r.networks) || [];
				list.replaceChildren(...(nets.length ? nets.map(n => {
					const b = E('button', { 'type': 'button', 'class': 'vx-chip', 'aria-pressed': 'false', 'click': () => {
						pick = n; list.querySelectorAll('.vx-chip').forEach(o => o.setAttribute('aria-pressed', String(o === b))); } },
						[ fmt.name(n.ssid), ' ', fmt.ltr(n.band == '5g' ? '5 GHz' : '2.4 GHz') ]);
					return b;
				}) : [ hn.empty(_('No network found.')) ]));
			}).catch(() => list.replaceChildren(hn.empty(_('The router did not answer.'))));
		};
		return hn.section(_('No cable to a Virox router?'), _('This access point can repeat the Wi-Fi of another router (a router that is not a Virox): choose its network and type its password. Devices behind it may be counted together on the other router.'), [
			E('button', { 'class': 'btn cbi-button', 'click': find }, [ _('Find networks') ]),
			list,
			hn.field('vx-rp-key', _('Password of that network'), key)
		], [ E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
			if (!pick) return hn.notify(_('Choose a network first.'), 'warning');
			return hn.askConfirm(_('Repeat this network?'), _('Wi-Fi restarts; if the other router does not accept it, this access point tries another way by itself within two minutes.'), _('Repeat'))
				.then(y => y && hn.act(hn.api.apRepeat(pick.band, pick.ssid, key.value), _('Connecting… this takes up to two minutes.')).then(done));
		} }, [ _('Repeat') ]) ]);
	},

	// update the whole house (15.3 item 2): this router downloads once and offers the update on the
	// LAN; the access points one at a time, each must come back within 10 minutes or the rest stop;
	// this router last. Progress per unit.
	updateAllCard(us, ap) {
		if (!us) return '';
		const ST = {
			done: [ 'ok', _('Updated') ], updating: [ 'warn', _('Updating now') ], waiting: [ 'muted', _('Waiting') ],
			skipped: [ 'bad', _('Was off, not updated') ], failed: [ 'bad', _('Did not come back') ]
		};
		const running = [ 'preparing', 'updating', 'main' ].indexOf(us.state) >= 0;
		const failedName = ((us.units || []).filter(u => u.id == us.failed)[0] || {}).name || us.failed || '';
		let msg = '';
		if (us.state == 'preparing') msg = _('Downloading the update once for the whole house…');
		else if (us.state == 'updating') msg = _('Updating the access points one at a time…');
		else if (us.state == 'main') msg = _('The access points are done. This router installs the update now and restarts by itself.');
		else if (us.state == 'done') msg = _('Every unit has the newest version.');
		else if (us.state == 'failed') msg = fmt.sentence(_('Stopped: %s did not come back within %s minutes. The other units were not touched. Check its power and cable, then press Update all again.'), [ fmt.name(failedName), fmt.ltr(String(us.wait_minutes || 10)) ]);
		else if (us.state == 'error') msg = hn.updateErrorText(us.error);
		if (running) setTimeout(() => location.reload(), 15000);
		const unitRow = (name, version, badge) => E('li', {}, [
			E('span', { 'class': 'vx-name vx-rows' }, [ E('strong', {}, [ name ]), E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Version: %s'), [ fmt.ltr(version || '—') ]) ]) ]),
			badge
		]);
		return hn.section(_('Update the whole house'), _('This router downloads the update once. The access points then update one at a time, each restarts once; this router updates last. If one does not come back, the rest stop.'), [
			msg ? E('p', { 'role': 'status', 'class': (us.state == 'failed' || us.state == 'error') ? 'vx-warn-text' : '' }, [ running ? E('span', { 'class': 'spinning' }, [ msg ]) : msg ]) : '',
			E('ul', { 'class': 'vx-list' }, [
				unitRow(_('This router'), us.version, us.state == 'main' ? hn.badge('warn', _('Updating now')) : (us.state == 'done' ? hn.badge('ok', _('Updated')) : hn.badge('muted', _('Last'))))
			].concat((us.units || []).map(u => unitRow(fmt.name(u.name), u.version, hn.badge((ST[u.state] || ST.waiting)[0], (ST[u.state] || ST.waiting)[1])))))
		], [
			E('button', { 'class': 'btn cbi-button-positive', 'disabled': running ? '' : null, 'click': () => hn.askConfirm(_('Update every unit of the house?'),
				_('The access points update one at a time, then this router. Each one restarts once: a few minutes without Wi-Fi near it. Settings are kept.'), _('Update all'))
				.then(y => y && hn.act(hn.api.apUpdateAll(), _('Started.')).then(r => { if (r && r.result !== false) setTimeout(() => location.reload(), 3000); })) }, [ _('Update all') ])
		]);
	},

	wifiCard(wf, gu) {
		const radios = (wf && wf.radios) || [];
		const change = E('button', { 'class': 'btn cbi-button-positive', 'click': () => {
			try { sessionStorage.setItem('vx-setup-step', '3'); } catch (e) {}
			location.href = L.url('admin/setup');
		} }, [ _('Change the Wi-Fi name or password') ]);
		if (!radios.length)
			return hn.card(_('Wi-Fi'), [ hn.empty(_('No Wi-Fi radio found.')), change ], { 'id': 'vx-wifi' });
		return hn.card(_('Wi-Fi'), [
			// hide: a box at the edge of each network, beside its name (owner 2026-11-22: beside every
			// network, where the checkbox was, not in a list of its own); each band on its own
			...radios.map(r => E('div', { 'class': 'vx-radio' }, [
				E('div', { 'style': 'display:flex;align-items:center;justify-content:space-between;gap:12px' }, [
					E('h3', { 'style': 'margin:0;flex:1 1 auto' }, [ r.band == '5g' ? _('5 GHz (fast, shorter reach)') : _('2.4 GHz (reaches further, slower)') ]),
					this.hideBox(r.ssid || '-', !!(wf && wf['hidden_' + r.band]), on => hn.api.wifiHidden(r.band, on))
				]),
				E('dl', { 'class': 'vx-usage' }, [
					E('dt', {}, [ _('Network name:') ]), E('dd', {}, [ fmt.name(r.ssid || '—') ]),
					E('dt', {}, [ _('Channel') ]), E('dd', {}, [ fmt.ltr(String(r.channel || '—')) ]),
					E('dt', {}, [ _('busy') ]), E('dd', {}, [ fmt.percent(r.busy_percent || 0) ]),
					E('dt', {}, [ _('Connected now') ]), E('dd', {}, [ fmt.ltr(String(r.client_count || 0)) ])
				])
				// the devices and their signal: Devices page (owner 2026-11-22: no second list here)
			])),
			// switch a band off or on (owner 2026-11-22: "where is the option to turn 5 GHz off?")
			...this.bandSwitches(wf),
			// 13.1: one name for both bands (default) or separate names
			E('h3', {}, [ _('Network names') ]),
			E('div', { 'class': 'vx-chips', 'role': 'group' }, [ [ false, _('One name for both bands') ], [ true, _('Separate names') ] ].map(x =>
				E('button', { 'class': 'btn cbi-button', 'aria-pressed': String(!!(wf && wf.split) == x[0]),
					'click': () => hn.act(hn.api.wifiSplit(x[0]), _('Saved. Wi-Fi restarts for a few seconds.')).then(r => r && r.result !== false && setTimeout(() => location.reload(), 4000)) }, [ x[1] ]))),
			E('p', { 'class': 'vx-hint' }, [ _('With one name, phones that can use 5 GHz are moved to it by themselves. Separate names add "-5G" to the name of the 5 GHz network.') ]),
			E('p', { 'class': 'vx-hint' }, [ _('A hidden network does not show in the list of networks on phones. Devices that are already connected stay connected; a new device types the name by hand or uses the QR code.') ]),
			// no signal strength switch: 25 dBm on 2.4 GHz is always on (owner 2026-11-22, wifi-power)
			E('div', { 'class': 'vx-actions' }, [
				change,
				E('button', { 'class': 'btn cbi-button', 'click': () => hn.askConfirm(_('Choose the best channel now?'), _('Wi-Fi stops for about a minute while the router listens to the neighbours; devices reconnect by themselves.'), _('Choose now'))
					.then(y => y && hn.act(hn.api.wifiRescan(), _('Choosing… Wi-Fi is back in about a minute.'))) }, [ _('Choose the best channel now') ])
			])
		], { 'id': 'vx-wifi' });
	},

	// one switch per band of this unit; the last band that is on cannot be switched off
	bandSwitches(wf) {
		const bands = (wf && wf.bands) || {};
		const list = [ '2g', '5g' ].filter(b => bands[b]);
		if (list.length < 2) return [];
		const name = b => b == '5g' ? _('5 GHz Wi-Fi') : _('2.4 GHz Wi-Fi');
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 4000); return r; };
		const set = (b, on) => hn.api.wifiBand(b, on).then(r => {
			if (r && r.result === false)
				return hn.notify(r.error == 'last_band' ? _('At least one band has to stay on, or no device could reach the router by Wi-Fi.') : hn.errorText(r.error), 'warning');
			hn.notify(_('Saved. Wi-Fi restarts for a few seconds.'), 'success');
			reload(r);
		}).catch(() => hn.notify(_('The router did not answer.'), 'danger'));
		return [
			E('h3', {}, [ _('Wi-Fi bands') ]),
			...list.map(b => {
				const box = E('input', { 'type': 'checkbox', 'role': 'switch', 'aria-label': name(b) });
				box.checked = !!bands[b].on;
				box.addEventListener('change', () => {
					if (box.checked) return set(b, true);
					hn.askConfirm(fmt.sentence(_('Switch off the %s?'), [ name(b) ]), _('Devices on it move to the other band if they can, or lose the Wi-Fi. Devices on a cable are not affected. You can switch it on again here.'), _('Switch off'))
						.then(y => { if (y) set(b, false); else box.checked = true; });
				});
				return hn.row(name(b), bands[b].on ? '' : _('Off', 'Virox'), E('label', { 'class': 'vx-toggle' }, [ box, E('i') ]));
			}),
			E('p', { 'class': 'vx-hint' }, [ _('Switching a band off stops the home and guest networks on it, here and on the access points. A Wi-Fi link to another router on that band keeps working.') ])
		];
	},

	// the hide box beside one network (owner 2026-11-22)
	hideBox(name, checked, call) {
		return E('label', { 'class': 'vx-switch', 'style': 'flex:0 0 auto;margin:0' }, [
			E('input', { 'type': 'checkbox', 'checked': checked ? '' : null, 'aria-label': _('Hide %s').format(name),
				'change': ev => hn.act(call(ev.target.checked), _('Saved. Wi-Fi restarts for a few seconds.')) }), ' ',
			E('span', {}, [ _('Hide') ])
		]);
	},

	nameOfMac(mac) {
		const d = (this.data[5].devices || []).filter(x => (x.macs || []).some(m => m.mac == mac))[0];
		return d ? fmt.name(hn.deviceName(d)) : fmt.ltr(mac);
	},

	// VPN client (owner 2026-11-20): the file of the VPN service (WireGuard .conf or OpenVPN .ovpn),
	// then everyone or chosen people and devices go through it; kill switch on by default
	vpnCard(vp, dv, pp) {
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 2500); return r; };
		const file = E('input', { 'type': 'file', 'id': 'vx-vpn-file', 'accept': '.conf,.ovpn,.txt' });
		const user = E('input', { 'type': 'text', 'id': 'vx-vpn-user', 'dir': 'ltr', 'autocomplete': 'off' });
		const pass = E('input', { 'type': 'password', 'id': 'vx-vpn-pass', 'dir': 'ltr', 'autocomplete': 'new-password' });
		const load = () => {
			const f = file.files && file.files[0];
			if (!f) return hn.notify(_('Choose the file first.'), 'warning');
			const rd = new FileReader();
			rd.onload = () => hn.act(hn.api.vpnImport(String(rd.result), user.value.trim(), pass.value), _('Saved.')).then(reload);
			rd.readAsText(f);
		};
		const fileFields = [
			hn.field('vx-vpn-file', _('VPN file'), file, _('From your VPN service, the file for routers: WireGuard (.conf) or OpenVPN (.ovpn).')),
			hn.field('vx-vpn-user', _('User name (OpenVPN only)'), user),
			hn.field('vx-vpn-pass', _('Password (OpenVPN only)'), pass, _('The service gives them with the OpenVPN file. Empty for WireGuard.'))
		];
		if (!vp.type)
			return hn.section(_('VPN'), _('Send the internet of chosen devices, or of the whole house, through your VPN service. The router itself and everyone else keep the normal line.'),
				fileFields, [ E('button', { 'class': 'btn cbi-button-positive', 'click': load }, [ _('Add', 'Virox') ]) ]);

		// who: everyone, or chosen people and devices (check boxes)
		let who = vp.who == 'all' ? 'all' : 'chosen';
		const chosen = {};
		(vp.targets || []).forEach(t => { chosen[t] = true; });
		const box = (id, label) => {
			const i = E('input', { 'type': 'checkbox', 'value': id });
			i.checked = !!chosen[id];
			return E('label', { 'class': 'vx-check' }, [ i, ' ', label ]);
		};
		const list = E('div', { 'class': 'vx-checks' }, [].concat(
			(pp.people || []).map(p => box(p.id, fmt.name(p.name))),
			(dv.devices || []).filter(d => !d.person).map(d => box(d.id, fmt.name(hn.deviceName(d))))));
		list.style.display = who == 'all' ? 'none' : '';
		const whoBtns = [ [ 'all', _('Everyone') ], [ 'chosen', _('Chosen people and devices') ] ].map(x => {
			const b = E('button', { 'type': 'button', 'class': 'vx-chip', 'aria-pressed': String(who == x[0]), 'click': () => {
				who = x[0]; whoBtns.forEach(o => o.setAttribute('aria-pressed', String(o === b))); list.style.display = who == 'all' ? 'none' : ''; } }, [ x[1] ]);
			return b;
		});
		const on = E('input', { 'type': 'checkbox', 'role': 'switch', 'id': 'vx-vpn-on' }); on.checked = !!vp.enabled;
		const ks = E('input', { 'type': 'checkbox', 'role': 'switch', 'id': 'vx-vpn-ks' }); ks.checked = vp.killswitch !== false;
		const save = () => hn.act(hn.api.vpnSet(on.checked, who,
			Array.prototype.map.call(list.querySelectorAll('input:checked'), i => i.value), ks.checked), _('Saved.')).then(reload);
		const state = vp.enabled ? (vp.connected ? hn.badge('ok', _('Connected')) : hn.badge('bad', _('Not connected'))) : hn.badge('warn', _('Off'));
		return hn.section(_('VPN'), _('Send the internet of chosen devices, or of the whole house, through your VPN service. The router itself and everyone else keep the normal line.'), [
			hn.row(fmt.sentence(_('Server: %s'), [ fmt.ltr(vp.server || '') ]), vp.type == 'wireguard' ? 'WireGuard' : 'OpenVPN', state),
			hn.row(_('VPN on'), '', E('label', { 'class': 'vx-toggle' }, [ on, E('i') ])),
			hn.row(_('Who uses it'), '', E('div', { 'class': 'vx-chips' }, whoBtns)),
			list,
			hn.row(_('No internet while the VPN is down'), _('Recommended: chosen devices never go out without the VPN.'), E('label', { 'class': 'vx-toggle' }, [ ks, E('i') ])),
			E('details', {}, [ E('summary', {}, [ _('Another VPN file') ]), ...fileFields,
				E('button', { 'class': 'btn cbi-button', 'click': load }, [ _('Replace') ]) ])
		], [
			E('button', { 'class': 'btn cbi-button-positive', 'click': save }, [ _('Save') ]),
			E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Remove the VPN'), _('Remove the VPN and its file?'), _('Remove', 'Virox'))
				.then(y => y && hn.act(hn.api.vpnRemove(), _('Removed.')).then(reload)) }, [ _('Remove', 'Virox') ])
		]);
	},

	// open a port for a device (15.4 item 2): the rule follows the device; the page says plainly when
	// a line cannot be reached from outside (a private address from the ISP router, or CGNAT)
	portsCard(po, dv, ls) {
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 1500); return r; };
		const two = !!po.two_lines;
		const lineName = n => (ls && ls.lines && ls.lines[n - 1]) ? hn.lineName(ls.lines[n - 1]) : _('Line %d').format(n);
		const warn = (po.wan || []).map(w => {
			const who = two ? lineName(w.line) : _('The internet line');
			if (w.kind == 'private') return E('div', { 'class': 'vx-alert warn', 'role': 'note' }, [ fmt.sentence(_('%s: this router gets a private address (%s) from the ISP router in front of it. An open port works only after you set this router as the DMZ host of the ISP router, or put the ISP router in bridge mode (see the install guide).'), [ fmt.name(who), fmt.ltr(w.ip || '') ]) ]);
			if (w.kind == 'cgnat') return E('div', { 'class': 'vx-alert warn', 'role': 'note' }, [ fmt.sentence(_('%s: the ISP gives a shared address (%s, CGNAT), so nobody on the internet can reach this line. Open ports cannot work on it. Ask the ISP for a public address.'), [ fmt.name(who), fmt.ltr(w.ip || '') ]) ]);
			if (w.kind == 'down') return E('div', { 'class': 'vx-alert info', 'role': 'note' }, [ fmt.sentence(_('%s is down now.'), [ fmt.name(who) ]) ]);
			return '';
		});
		const STATE = { ok: [ 'ok', _('Open') ], no_address: [ 'warn', _('Waiting for the device address') ], line_down: [ 'warn', _('Line down') ], off: [ 'muted', _('Off', 'Virox') ] };
		const PROTO = { tcp: 'TCP', udp: 'UDP', both: 'TCP + UDP' };
		const rows = (po.rules || []).map(r => {
			const tg = E('input', { 'type': 'checkbox', 'role': 'switch', 'aria-label': _('Rule on') }); tg.checked = r.enabled;
			tg.addEventListener('change', () => hn.act(hn.api.portSet(r.id, tg.checked), _('Saved.')).then(reload));
			const st = STATE[r.state] || STATE.off;
			return E('li', {}, [
				E('span', { 'class': 'vx-name vx-rows' }, [
					E('strong', {}, [ fmt.name(r.name || r.device_name) ]),
					E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Device: %s'), [ fmt.name(r.device_name) ]) ]),
					E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Outside port: %s'), [ fmt.ltr(r.ext + ' ' + PROTO[r.proto]) ]) ]),
					r.int ? E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Inside port: %s'), [ fmt.ltr(r.int) ]) ]) : '',
					two ? E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Line: %s'), [ r.line == 'both' ? _('Both lines') : fmt.name(lineName(+r.line)) ]) ]) : ''
				]),
				hn.badge(st[0], st[1]),
				E('label', { 'class': 'vx-toggle' }, [ tg, E('i') ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Close this port?'), _('Nobody outside can reach the device on it any more.'), _('Remove', 'Virox'))
					.then(y => y && hn.act(hn.api.portRemove(r.id), _('Removed.')).then(reload)) }, [ _('Remove', 'Virox') ])
			]);
		});
		const devs = ((dv && dv.devices) || []).slice().sort((a, b) => hn.deviceName(a).localeCompare(hn.deviceName(b)));
		const dev = E('select', { 'id': 'vx-pf-dev' }, devs.map(d => E('option', { 'value': d.id }, [ hn.deviceName(d) ])));
		const proto = E('select', { 'id': 'vx-pf-proto' }, [ [ 'both', 'TCP + UDP' ], [ 'tcp', 'TCP' ], [ 'udp', 'UDP' ] ].map(o => E('option', { 'value': o[0] }, [ o[1] ])));
		const ext = E('input', { 'id': 'vx-pf-ext', 'type': 'text', 'dir': 'ltr', 'lang': 'en', 'inputmode': 'numeric', 'placeholder': '8080', 'maxlength': '11' });
		const inn = E('input', { 'id': 'vx-pf-int', 'type': 'text', 'dir': 'ltr', 'lang': 'en', 'inputmode': 'numeric', 'placeholder': _('Same'), 'maxlength': '5' });
		const line = two ? E('select', { 'id': 'vx-pf-line' }, [ [ 'both', _('Both lines') ], [ '1', lineName(1) ], [ '2', lineName(2) ] ].map(o => E('option', { 'value': o[0] }, [ o[1] ]))) : null;
		const nm = E('input', { 'id': 'vx-pf-name', 'type': 'text', 'dir': 'auto', 'maxlength': '32', 'placeholder': _('For example: camera') });
		return E('div', { 'id': 'vx-ports' }, [
			...warn,
			hn.section(_('Open ports'), _('For cameras, recorders, game consoles and servers that must be reached from the internet. A rule follows the device: it keeps its address.'), [
				rows.length ? E('ul', { 'class': 'vx-list' }, rows) : hn.empty(_('No open port.'))
			]),
			hn.section(_('Open a port'), '', [
				hn.field('vx-pf-dev', _('Device'), dev),
				hn.field('vx-pf-proto', _('Type'), proto),
				hn.field('vx-pf-ext', _('Outside port'), ext, _('One port, or a range such as 8000-8010.')),
				hn.field('vx-pf-int', _('Inside port'), inn, _('Only if the device uses another port; empty = the same.')),
				line ? hn.field('vx-pf-line', _('Line'), line) : '',
				hn.field('vx-pf-name', _('Name'), nm)
			], [
				E('button', { 'class': 'btn cbi-button-positive', 'disabled': devs.length ? null : '', 'click': () => hn.act(hn.api.portAdd(dev.value, proto.value, ext.value.trim(), inn.value.trim(), line ? line.value : 'both', nm.value.trim()), _('The port is open.')).then(reload) }, [ _('Open the port') ])
			]),
			E('p', { 'class': 'vx-hint' }, [ _('Games mode (in Ping and games) lets consoles open their own ports; use a rule here only for a device that needs a fixed one.') ])
		]);
	},

	// night schedules for Wi-Fi and lights (15.4 item 3): windows with days, off-time and on-time;
	// before saving, a warning when the admin's own device is on a Wi-Fi that will switch off
	scheduleCard(sc) {
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 1500); return r; };
		// a list of names: separated by the comma of the page language
		const joinEls = els => E('span', {}, els.reduce((o, e, i) => (i ? o.concat([ document.documentElement.lang == 'ar' ? '، ' : ', ', e ]) : [ e ]), []));
		if (sc.managed)
			return hn.section(_('Wi-Fi, lights and restart times'), _('The main router manages this access point: set the schedules there; this one follows them.'), []);
		const DAYS = [ [ 6, _('Sat', 'Virox day') ], [ 0, _('Sun', 'Virox day') ], [ 1, _('Mon', 'Virox day') ], [ 2, _('Tue', 'Virox day') ],
			[ 3, _('Wed', 'Virox day') ], [ 4, _('Thu', 'Virox day') ], [ 5, _('Fri', 'Virox day') ] ];
		const TARGETS = [ [ 'all', _('The whole Wi-Fi') ], [ '2g', _('2.4 GHz only') ], [ '5g', _('5 GHz only') ], [ 'guest', _('The guest network') ] ];
		const time = (v, label) => E('input', { 'type': 'time', 'dir': 'ltr', 'lang': 'en', 'value': v || '', 'aria-label': label, 'required': '' });
		const list = E('ul', { 'class': 'vx-list' });
		const rowOf = it => {
			const tg = E('select', { 'aria-label': _('What turns off') }, TARGETS.map(t => E('option', { 'value': t[0], 'selected': it.target == t[0] ? '' : null }, [ t[1] ])));
			const days = DAYS.map(d => E('button', { 'type': 'button', 'class': 'vx-chip', 'data-day': String(d[0]), 'aria-pressed': String((it.days || []).indexOf(d[0]) >= 0),
				'click': ev => ev.currentTarget.setAttribute('aria-pressed', String(ev.currentTarget.getAttribute('aria-pressed') != 'true')) }, [ d[1] ]));
			const off = time(it.off || '23:00', _('Off at')), on = time(it.on || '07:00', _('On again at'));
			const en = E('input', { 'type': 'checkbox', 'role': 'switch', 'aria-label': _('On', 'Virox') }); en.checked = it.enabled !== false;
			const li = E('li', { 'class': 'vx-sched' }, [
				E('div', { 'class': 'vx-rows' }, [
					hn.row(_('What turns off'), '', tg),
					E('div', { 'class': 'vx-chips', 'role': 'group', 'aria-label': _('Days') }, days),
					E('div', { 'class': 'vx-inline' }, [ E('label', {}, [ _('Off at'), ' ', off ]), E('label', {}, [ _('On again at'), ' ', on ]) ]),
					E('p', { 'class': 'vx-hint' }, [ _('The days are the days of the off-time; an on-time earlier than the off-time is the next morning.') ])
				]),
				E('label', { 'class': 'vx-toggle' }, [ en, E('i') ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => li.remove() }, [ _('Remove', 'Virox') ])
			]);
			li.vxGet = () => ({ target: tg.value, days: days.filter(b => b.getAttribute('aria-pressed') == 'true').map(b => +b.getAttribute('data-day')),
				off: off.value, on: on.value, enabled: en.checked });
			return li;
		};
		(sc.wifi || []).forEach(it => list.appendChild(rowOf(it)));
		const gather = () => Array.prototype.map.call(list.children, li => li.vxGet());
		const save = () => {
			const items = gather();
			if (items.some(i => !i.days.length || !i.off || !i.on || i.off == i.on)) return hn.notify(_('Each time needs at least one day, an off-time and a different on-time.'), 'warning');
			return hn.api.schedulePreview(items).then(p => {
				const you = (p && p.you) || [];
				if (!you.length) return true;
				return hn.askConfirm(_('Your own device is on this Wi-Fi'), fmt.sentence(_('%s is connected to a Wi-Fi that these times switch off. It will lose the connection at the off-time (use a cable or the other band to change the times then). Save anyway?'),
					[ joinEls(you.map(y => this.nameOfMac(y.mac))) ]), _('Save'));
			}).then(y => y && hn.act(hn.api.scheduleWifi(items), _('Saved.')).then(reload));
		};
		// lights
		let mode = (sc.leds && sc.leds.mode) || 'on';
		const loff = time((sc.leds && sc.leds.off) || '23:00', _('Off at')), lon = time((sc.leds && sc.leds.on) || '07:00', _('On again at'));
		const ltimes = E('div', { 'class': 'vx-inline' }, [ E('label', {}, [ _('Off at'), ' ', loff ]), E('label', {}, [ _('On again at'), ' ', lon ]) ]);
		ltimes.style.display = mode == 'night' ? '' : 'none';
		const lb = [ [ 'on', _('Always on') ], [ 'night', _('Off at night') ], [ 'off', _('Always off') ] ].map(x => {
			const b = E('button', { 'type': 'button', 'class': 'vx-chip', 'aria-pressed': String(mode == x[0]), 'click': () => {
				mode = x[0]; lb.forEach(o => o.setAttribute('aria-pressed', String(o === b))); ltimes.style.display = mode == 'night' ? '' : 'none'; } }, [ x[1] ]);
			return b;
		});
		const now = sc.now || {};
		const offNow = [ [ 'wifi_all', _('The whole Wi-Fi') ], [ 'wifi_2g', _('2.4 GHz only') ], [ 'wifi_5g', _('5 GHz only') ], [ 'wifi_guest', _('The guest network') ] ].filter(x => now[x[0]] == 'off');
		return E('div', { 'id': 'vx-schedule' }, [
			offNow.length ? E('div', { 'class': 'vx-alert info', 'role': 'status' }, [ fmt.sentence(_('Off now by the schedule: %s'), [ joinEls(offNow.map(x => x[1])) ]) ]) : '',
			hn.section(_('Wi-Fi off at set times'), _('For example at night or during study time. Access points follow by themselves. Devices on a cable are not affected.'), [
				list,
				E('button', { 'class': 'btn cbi-button', 'click': () => list.appendChild(rowOf({ target: 'all', days: [ 0, 1, 2, 3, 4, 5, 6 ], off: '00:00', on: '07:00', enabled: true })) }, [ _('Add a time') ])
			], [ E('button', { 'class': 'btn cbi-button-positive', 'click': save }, [ _('Save') ]) ]),
			hn.section(_('Lights of the router'), _('The lights of this router and of the access points.'), [
				E('div', { 'class': 'vx-chips', 'role': 'group' }, lb), ltimes
			], [ E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.scheduleLeds(mode, loff.value, lon.value), _('Saved.')).then(reload) }, [ _('Save') ]) ])
		]);
	},

	// USB disk and printer (15.4 item 5): shared on the home network only
	usbCard(ub) {
		const reload = r => { if (r && r.result !== false) setTimeout(() => location.reload(), 2000); return r; };
		const sh = ub.share || {}, pr = ub.printer || {}, disks = ub.disks || [];
		const ip = pr.address || '';
		// disks
		const drows = disks.map(d => E('li', {}, [
			E('span', { 'class': 'vx-name vx-rows' }, [
				E('strong', {}, [ fmt.name(d.label || d.dev.replace('/dev/', '')) ]),
				d.size_mb != null ? E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Free: %s of %s'), [ fmt.ltr(hn.bytes(d.free_mb * hn.MB)), fmt.ltr(hn.bytes(d.size_mb * hn.MB)) ]) ]) : '',
				E('span', { 'class': 'vx-row-line' }, [ fmt.sentence(_('Type: %s'), [ fmt.ltr(String(d.fs || '').toUpperCase()) ]) ])
			]),
			d.shared ? hn.badge('ok', _('Shared')) : hn.badge('muted', _('Not shared')),
			d.disk ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.usbEject(d.disk), _('You can unplug the disk now.')).then(reload) }, [ _('Safe remove') ]) : ''
		]));
		// sharing
		const on = E('input', { 'type': 'checkbox', 'role': 'switch', 'id': 'vx-usb-share' }); on.checked = !!sh.enabled;
		const name = E('input', { 'id': 'vx-usb-name', 'type': 'text', 'dir': 'ltr', 'lang': 'en', 'maxlength': '15', 'value': sh.name || '' });
		const pw = E('input', { 'id': 'vx-usb-pw', 'type': 'password', 'dir': 'ltr', 'maxlength': '64', 'autocomplete': 'new-password', 'placeholder': sh.password_set ? _('Unchanged') : _('No password') });
		const where = '\\\\' + ip + '\\' + (sh.name || '');
		// printer
		const pon = E('input', { 'type': 'checkbox', 'role': 'switch', 'id': 'vx-usb-printer' }); pon.checked = !!pr.enabled;
		pon.addEventListener('change', () => hn.act(hn.api.usbPrinter(pon.checked), _('Saved.')).then(reload));
		return E('div', { 'id': 'vx-usb' }, [
			hn.card(_('USB disk'), [
				disks.length ? E('ul', { 'class': 'vx-list' }, drows) : hn.empty(_('No USB disk is plugged in. FAT, exFAT, NTFS and ext4 disks work.')),
				!sh.installed ? E('p', { 'class': 'vx-warn-text' }, [ _('Disk sharing is not installed on this router.') ]) : '',
				hn.row(_('Share on the home network'), _('Home devices can open, add and delete files. Visitors on the guest network and the internet cannot.'), E('label', { 'class': 'vx-toggle' }, [ on, E('i') ])),
				hn.field('vx-usb-name', _('Share name (English letters and digits)'), name),
				hn.field('vx-usb-pw', _('Password (user name: virox)'), pw, sh.password_set ? _('A password is set. Type a new one to change it.') : _('Without a password every home device can open it. At least 8 characters.')),
				E('div', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.usbShare(on.checked, name.value.trim(), pw.value, false), _('Saved.')).then(reload) }, [ _('Save') ]),
					sh.password_set ? E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.usbShare(on.checked, name.value.trim(), '', true), _('The password is removed.')).then(reload) }, [ _('Remove the password') ]) : ''
				]),
				sh.enabled && disks.length ? E('details', {}, [
					E('summary', {}, [ _('How to open it') ]),
					E('p', {}, [ fmt.sentence(_('Windows: open File Explorer and type %s in the address bar.'), [ fmt.ltr(where) ]) ]),
					E('p', {}, [ fmt.sentence(_('Android: in a file manager that supports SMB (network) shares, add the server %s.'), [ fmt.ltr(ip) ]) ]),
					E('p', {}, [ fmt.sentence(_('iPhone: Files, Connect to Server, then %s.'), [ fmt.ltr('smb://' + ip) ]) ])
				]) : ''
			], { 'id': 'vx-usb-disk' }),
			hn.card(_('USB printer'), [
				E('p', {}, [ pr.present ? fmt.sentence(_('Printer plugged in: %s'), [ fmt.name(pr.name || _('USB printer')) ]) : _('No USB printer is plugged in.') ]),
				hn.row(_('Share the printer'), _('Computers and phones at home can print to it.'), E('label', { 'class': 'vx-toggle' }, [ pon, E('i') ])),
				pr.enabled ? E('details', {}, [
					E('summary', {}, [ _('How to add it on a computer') ]),
					E('p', {}, [ fmt.sentence(_('Windows: Settings, Printers, Add a printer, "The printer that I want is not listed", add by TCP/IP address: %s, port 9100 (Raw), then choose the printer driver.'), [ fmt.ltr(ip) ]) ]),
					E('p', {}, [ fmt.sentence(_('Android: an app of the printer maker or a printing service that supports "raw" port 9100, with the address %s.'), [ fmt.ltr(ip) ]) ])
				]) : ''
			], { 'id': 'vx-usb-printer' })
		]);
	},

	// BUILD-PLAN 15.9 item 4: two address ranges; every access point gets a fixed address by itself
	addressesCard(ad) {
		if (!ad.router)
			return hn.card(_('Addresses'), [ E('p', { 'class': 'vx-hint' }, [ _('This router is an access point: the main router gives the addresses. Under a router that is not a Virox, the access points take what that router gives.') ]) ], { 'id': 'vx-addresses' });
		const num = (id, v) => E('input', { 'id': id, 'type': 'number', 'lang': 'en', 'inputmode': 'numeric', 'dir': 'ltr', 'min': '2', 'max': '254', 'value': String(v) });
		const us = num('vx-ad-us', ad.units_start), ue = num('vx-ad-ue', ad.units_end), ds = num('vx-ad-ds', ad.dev_start), de = num('vx-ad-de', ad.dev_end);
		const full = n => fmt.ltr(ad.net + '.' + n);
		return hn.card(_('Addresses'), [
			E('p', { 'class': 'vx-hint' }, [ _('The router gives every device an address by itself. Virox access points get a fixed address from their own range, by themselves; the other devices get one from the devices range.') ]),
			hn.row(_('This router'), '', fmt.ltr(ad.router_ip || '—')),
			E('fieldset', {}, [ E('legend', {}, [ _('Virox units (access points)') ]),
				hn.field('vx-ad-us', _('From'), us), hn.field('vx-ad-ue', _('To'), ue) ]),
			E('fieldset', {}, [ E('legend', {}, [ _('Devices') ]),
				hn.field('vx-ad-ds', _('From'), ds), hn.field('vx-ad-de', _('To'), de) ]),
			E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Now: units %s to %s, devices %s to %s.'), [ full(ad.units_start), full(ad.units_end), full(ad.dev_start), full(ad.dev_end) ]) ]),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.addressesSet(+us.value, +ue.value, +ds.value, +de.value), _('Saved.')).then(r => r && r.result !== false && setTimeout(() => location.reload(), 1500)) }, [ _('Save') ]),
			E('h3', {}, [ _('Fixed addresses of the access points') ]),
			(ad.aps || []).length ? E('ul', { 'class': 'vx-list' }, ad.aps.map(a => E('li', {}, [
				E('span', { 'class': 'vx-name' }, [ fmt.name(a.name) ]), fmt.ltr(a.ip) ]))) : hn.empty(_('No access point yet.'))
		], { 'id': 'vx-addresses' });
	},

	// scheduled restart (15.4 item 4)
	restartCard(sc) {
		const r = (sc && sc.restart) || { enabled: false, every: 'daily', day: 5, time: '04:00' };
		const on = E('input', { 'type': 'checkbox', 'role': 'switch', 'id': 'vx-rs-on' }); on.checked = !!r.enabled;
		const every = E('select', { 'id': 'vx-rs-every' }, [ [ 'daily', _('Every day') ], [ 'weekly', _('Once a week') ] ].map(o => E('option', { 'value': o[0], 'selected': r.every == o[0] ? '' : null }, [ o[1] ])));
		const day = E('select', { 'id': 'vx-rs-day' }, [ [ 6, _('Saturday') ], [ 0, _('Sunday') ], [ 1, _('Monday') ], [ 2, _('Tuesday') ], [ 3, _('Wednesday') ], [ 4, _('Thursday') ], [ 5, _('Friday') ] ]
			.map(o => E('option', { 'value': o[0], 'selected': r.day == o[0] ? '' : null }, [ o[1] ])));
		const tm = E('input', { 'id': 'vx-rs-time', 'type': 'time', 'dir': 'ltr', 'lang': 'en', 'value': r.time || '04:00' });
		const dayField = hn.field('vx-rs-day', _('Day'), day);
		const showDay = () => { dayField.style.display = every.value == 'weekly' ? '' : 'none'; };
		every.addEventListener('change', showDay); showDay();
		return hn.card(_('Scheduled restart'), [
			E('p', { 'class': 'vx-hint' }, [ _('Off unless you need it. The usage is saved first; it never happens during an update. With access points, they restart one at a time after this router is back.') ]),
			hn.row(_('Restart on a schedule'), '', E('label', { 'class': 'vx-toggle' }, [ on, E('i') ])),
			hn.field('vx-rs-every', _('How often'), every), dayField, hn.field('vx-rs-time', _('At'), tm),
			E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.scheduleRestart(on.checked, every.value, +day.value, tm.value), _('Saved.')) }, [ _('Save') ])
		], { 'id': 'vx-restart' });
	},

	gamingCard(gm) {
		if (!gm || !gm.installed) return '';
		return hn.card(_('Games mode'), [
			E('p', { 'class': 'vx-hint' }, [ _('Lets game consoles and some calls open the ports they need by themselves. Leave it off unless a game asks for an "open NAT".') ]),
			E('p', {}, [ gm.enabled ? hn.badge('ok', _('On', 'Virox')) : hn.badge('muted', _('Off', 'Virox')) ]),
			gm.enabled && (gm.leases || []).length ? E('ul', { 'class': 'vx-list' }, gm.leases.map(l => E('li', {}, [
				E('span', { 'class': 'vx-name vx-rows' }, [ E('strong', {}, [ fmt.name(l.description || '—') ]), E('span', { 'class': 'vx-row-line' }, [ fmt.ltr('%s %d, %s:%d'.format(l.proto, l.ext_port, l.ip, l.int_port)) ]) ]) ]))) : '',
			E('button', { 'class': 'btn ' + (gm.enabled ? 'cbi-button' : 'cbi-button-positive'), 'click': () =>
				hn.act(hn.api.gamingSet(!gm.enabled), gm.enabled ? _('Games mode is off.') : _('Games mode is on.')).then(() => location.reload()) },
				[ gm.enabled ? _('Turn off') : _('Turn on') ])
		]);
	},

	usersCard(us, pp) {
		const people = pp.people || [];
		const un = E('input', { 'id': 'vx-us-name', 'type': 'text', 'dir': 'ltr', 'maxlength': '16', 'autocapitalize': 'off', 'placeholder': 'sara' });
		const pw = E('input', { 'id': 'vx-us-pass', 'type': 'password', 'dir': 'ltr', 'maxlength': '64' });
		const ps = E('select', { 'id': 'vx-us-person' }, [ E('option', { 'value': '' }, [ _('Choose…') ]) ].concat(people.map(p => E('option', { 'value': p.id }, [ p.name ]))));
		return hn.card(_('Family logins'), [
			E('p', { 'class': 'vx-hint' }, [ _('A family login sees only the devices and usage of its own person, and cannot change anything. The router password is never shared.') ]),
			(us.users || []).length ? E('ul', { 'class': 'vx-list' }, us.users.map(u => E('li', {}, [
				E('span', { 'class': 'vx-name vx-rows' }, [ E('strong', {}, [ fmt.ltr(u.username) ]), E('span', { 'class': 'vx-row-line' }, [ fmt.name(u.person_name || '—') ]) ]),
				E('span', { 'class': 'vx-actions' }, [
					E('button', { 'class': 'btn cbi-button', 'click': () => this.passwordDialog(u.username) }, [ _('New password') ]),
					E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Remove the login %s?').format(u.username), _('It stops working at once.'), _('Remove', 'Virox'))
						.then(y => y && hn.act(hn.api.userDelete(u.username), _('Removed.')).then(() => location.reload())) }, [ _('Remove', 'Virox') ])
				])
			]))) : hn.empty(_('No family login yet.')),
			people.length ? E('fieldset', {}, [
				E('legend', {}, [ _('New family login') ]),
				hn.field('vx-us-name', _('Login name (small English letters and digits)'), un),
				hn.field('vx-us-pass', _('Password (at least 8 characters)'), pw),
				hn.field('vx-us-person', _('Sees the devices of'), ps),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.userAdd(un.value.trim(), pw.value, ps.value), _('Added.')).then(r => r && r.result !== false && location.reload()) }, [ _('Add', 'Virox') ])
			]) : E('p', { 'class': 'vx-hint' }, [ _('Add a person under Devices first.') ])
		]);
	},

	passwordDialog(username) {
		const pw = E('input', { 'id': 'vx-us-new', 'type': 'password', 'dir': 'ltr', 'maxlength': '64' });
		ui.showModal(_('New password for %s').format(username), [
			hn.field('vx-us-new', _('Password (at least 8 characters)'), pw),
			E('div', { 'class': 'right vx-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, [ _('Cancel') ]),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.act(hn.api.userPassword(username, pw.value), _('Saved.')).then(r => { if (r && r.result !== false) ui.hideModal(); }) }, [ _('Save') ])
			])
		]);
	},

	// B8.1 / 12.5: check now, install by a button press (settings kept, the router restarts)
	updateCard(up) {
		if (!up) return '';
		const ar = document.documentElement.lang == 'ar';
		const log = up.changelog ? (ar ? up.changelog.ar : up.changelog.en) || up.changelog.en || up.changelog.ar : '';
		const body = [ E('p', {}, [ _('Installed version:'), ' ', fmt.ltr(up.current || '—') ]) ];
		if (up.busy) body.push(E('p', { 'role': 'status' }, [ E('span', { 'class': 'spinning' }, [ up.downloading ? _('Downloading the update…') : _('Checking…') ]) ]));
		else if (up.installing) body.push(E('p', { 'role': 'status', 'class': 'vx-warn-text' }, [ _('Installing. Do not switch the router off; it restarts by itself in a few minutes.') ]));
		else if (up.available) {
			body.push(E('p', { 'class': 'vx-big' }, [ _('New version:'), ' ', fmt.ltr(up.available) ]));
			if (log) body.push(E('p', { 'class': 'vx-changelog' }, [ log ]));
			body.push(E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.askConfirm(_('Install version %s?').format(up.available),
				_('Your settings are kept. The router restarts by itself and the internet stops for about five minutes. Do not switch it off meanwhile.'), _('Install'))
				.then(y => y && hn.act(hn.api.updateInstall(), _('Installing…')).then(() => location.reload())) }, [ _('Install now') ]));
		}
		// "the newest version" only after a check that worked (owner 2026-11-22: it showed above
		// "the update server could not be reached"); while checking, the last error is not shown
		else if (!up.error || up.error == 'no_update') body.push(E('p', {}, [ up.checked ? _('This is the newest version.') : _('Not checked yet.') ]));
		if (up.error && up.error != 'no_update' && !up.busy) body.push(E('p', { 'class': 'vx-warn-text', 'role': 'alert' }, [ hn.updateErrorText(up.error) ]));
		if (((this.data[13] || {}).aps || []).length)
			body.push(E('p', { 'class': 'vx-hint' }, [ _('With access points: update the whole house at once from Wi-Fi, Access points.') ]));
		if (!up.busy && !up.installing)
			body.push(E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.updateCheck(), _('Checking…')).then(() => setTimeout(() => location.reload(), 8000)) }, [ _('Check now') ]));
		return hn.card(_('Update'), body, { 'id': 'vx-update' });
	},

	// section 12 items 7-8, P7: help report, save / restore settings (remote help removed, BUILD-PLAN 15.9 item 1)
	helpCard(bl) {
		const download = (path, name) => {
			const f = E('form', { 'method': 'post', 'action': L.env.cgi_base + '/cgi-download', 'style': 'display:none' }, [
				E('input', { 'type': 'hidden', 'name': 'sessionid', 'value': L.env.sessionid }),
				E('input', { 'type': 'hidden', 'name': 'path', 'value': path }),
				E('input', { 'type': 'hidden', 'name': 'filename', 'value': name }),
				E('input', { 'type': 'hidden', 'name': 'mimetype', 'value': 'application/gzip' })
			]);
			document.body.appendChild(f); f.submit(); f.remove();
		};
		const restoreFrom = (path) => hn.act(hn.api.backupCheck(path), null).then(r => {
			if (!r || r.result === false) return;
			return hn.askConfirm(_('Restore the settings of %s?').format(r.date),
				_('All settings and the usage history are replaced by the ones in the file, then the router restarts (about two minutes). This router keeps its own device numbers.'), _('Restore', 'Virox'))
				.then(y => y && hn.act(hn.api.backupRestore(path), _('Restoring. The router restarts now.')));
		});
		const body = [
			E('h3', {}, [ _('Help report') ]),
			E('p', { 'class': 'vx-hint' }, [ _('A file for whoever helps you: versions, line and Wi-Fi state, recent errors. Passwords, device numbers, addresses and names are removed.') ]),
			E('button', { 'class': 'btn cbi-button', 'click': ev => {
				ev.target.disabled = true;
				hn.api.report().then(r => {
					ev.target.disabled = false;
					if (!r || r.result === false) return hn.notify(hn.errorText(r && r.error), 'danger');
					const a = E('a', { 'href': URL.createObjectURL(new Blob([ r.text ], { 'type': 'text/plain' })), 'download': r.name });
					document.body.appendChild(a); a.click(); a.remove();
				}).catch(() => { ev.target.disabled = false; hn.notify(_('The router did not answer.'), 'danger'); });
			} }, [ _('Download the help report') ]),
			E('h3', {}, [ _('Save and restore settings') ]),
			E('p', { 'class': 'vx-hint' }, [ _('One file with all settings, devices and usage history. It contains the Wi-Fi password: keep it safe.') ]),
			E('button', { 'class': 'btn cbi-button', 'click': () => hn.act(hn.api.backupCreate(), null).then(r => r && r.result !== false && download(r.path, r.name)) }, [ _('Save my settings') ]),
			E('button', { 'class': 'btn cbi-button', 'click': () => ui.uploadFile('/tmp/virox-restore.tar.gz').then(() => restoreFrom('/tmp/virox-restore.tar.gz')).catch(() => {}) }, [ _('Restore from a file') ])
		];
		// the copies the router made itself before an update (owner 2026-11-22), newest first
		const pre = ((bl && bl.backups) || []).filter(b => b.kind == 'update');
		if (pre.length)
			body.push(E('p', {}, [ _('Copies made before an update (on the router):') ]), E('ul', { 'class': 'vx-list' }, pre.slice().reverse().map(b => E('li', {}, [
				E('span', { 'class': 'vx-name vx-rows' }, [ E('strong', {}, [ fmt.ltr(b.date) ]),
					E('span', { 'class': 'vx-row-line' }, [ b.from ? fmt.sentence(_('The settings of version %s'), [ fmt.ltr(b.from) ]) : fmt.bytes(b.size) ]) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => restoreFrom(b.path) }, [ _('Restore', 'Virox') ]) ]))));
		const nightly = ((bl && bl.backups) || []).filter(b => b.kind != 'update');
		if (nightly.length)
			body.push(E('p', {}, [ _('Nightly copies on the USB stick:') ]), E('ul', { 'class': 'vx-list' }, nightly.slice().reverse().map(b => E('li', {}, [
				E('span', { 'class': 'vx-name vx-rows' }, [ E('strong', {}, [ fmt.ltr(b.date) ]), E('span', { 'class': 'vx-row-line' }, [ fmt.bytes(b.size) ]) ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => restoreFrom(b.path) }, [ _('Restore', 'Virox') ]) ]))));
		else
			body.push(E('p', { 'class': 'vx-hint' }, [ _('Plug a USB stick into the router and it keeps a copy every night (the last 14).') ]));
		return hn.card(_('Help and backup'), body, { 'id': 'vx-help' });
	},

	// language, theme, MAC from the label, complete menu, sign-out (10a items 1, 5, 13)
	accountCard(pv, th, part) {
		const root = document.documentElement;
		const lang = root.lang == 'ar' ? 'ar' : 'en';
		th = th || { look: 'argon', mode: 'light', accent: '#2563eb', looks: [ 'argon' ] };
		const save = (args) => hn.act(hn.api.setTheme(args.look || '', args.mode || '', args.accent || ''), null)
			.then(r => r && r.result !== false && location.reload());
		const accent = E('input', { 'id': 'vx-accent', 'type': 'color', 'value': th.accent || '#2563eb' });
		const pick = (attr, list, cur, click) => E('div', { 'class': 'vx-chips', 'role': 'group' }, list.map(x =>
			E('button', Object.assign({ 'class': 'btn cbi-button', 'aria-pressed': String(x[0] == cur), 'click': ev => click(x[0], ev) }, { [attr]: x[0] }), [ x[1] ])));
		const body = [
			E('h3', {}, [ _('Language') ]),
			pick('data-lang', [ [ 'ar', 'العربية' ], [ 'en', 'English' ] ], lang, (l, ev) => {
				ev.target.disabled = true;
				hn.act(hn.api.setLanguage(l), null).then(() => location.reload());
			}),
			(th.looks || []).length > 1 ? E('h3', {}, [ _('Look') ]) : '',
			(th.looks || []).length > 1 ? pick('data-look', [ [ 'argon', 'Argon' ], [ 'vantage', 'Vantage' ] ], th.look, l => save({ look: l })) : '',
			E('h3', {}, [ _('Theme mode') ]),
			pick('data-mode', [ [ 'light', _('Light') ], [ 'dark', _('Dark') ], [ 'normal', _('Automatic', 'Virox') ] ], th.mode, m => save({ mode: m })),
			E('div', { 'class': 'vx-inline' }, [
				E('label', { 'for': 'vx-accent', 'class': 'vx-label' }, [ _('Accent colour') ]), accent,
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => save({ accent: accent.value }) }, [ _('Save') ]),
				E('button', { 'class': 'btn cbi-button', 'click': () => save({ accent: '#2563eb' }) }, [ _('Default colour') ])
			])
		];
		if (part == 'display')
			return hn.card(_('Display and language'), body, { 'id': 'vx-display' });
		body.length = 0;
		if (pv && (pv.mac_source == 'generated' || pv.label_mac)) {
			const mac = E('input', { 'id': 'vx-mac-in', 'type': 'text', 'dir': 'ltr', 'lang': 'en', 'autocomplete': 'off', 'placeholder': '00:11:22:33:44:55', 'value': pv.label_mac || '' });
			body.push(E('div', { 'id': 'vx-mac' }, [
				E('h3', {}, [ _('MAC on the label') ]),
				E('p', { 'class': 'vx-hint' }, [ _('The device MAC was generated automatically'), '. ', _('Everything works normally.') ]),
				hn.field('vx-mac-in', _('MAC on the label'), mac),
				E('button', { 'class': 'btn cbi-button-positive', 'click': () => hn.api.setLabelMac(mac.value.trim()).then(r => hn.notify((r && r.result)
					? _('Saved. The router uses this MAC after its next restart.')
					: _('This is not a valid MAC. On the label it looks like 00:11:22:33:44:55.'), (r && r.result) ? 'success' : 'danger')).catch(() => hn.notify(_('The router did not answer.'), 'danger')) }, [ _('Save') ])
			]));
		}
		body.push(E('ul', { 'class': 'vx-list vx-links' }, [
			E('li', {}, [ E('a', { 'href': L.url('admin/setup') }, [ _('Quick setup (internet type, Wi-Fi, router password)') ]) ]),
			E('li', {}, [ E('a', { 'href': L.url('admin/status/overview') },
				[ _('Advanced settings (the complete menu)') ]) ]),
			E('li', {}, [ E('a', { 'href': L.url('admin/logout') }, [ _('Sign out') ]) ])
		]));
		// back to a new router (owner 2026-11-22)
		body.push(E('div', { 'id': 'vx-reset' }, [
			E('h3', {}, [ _('Back to a new router') ]),
			E('p', { 'class': 'vx-hint' }, [ fmt.sentence(_('Everything you set up is erased: settings, people, usage history and passwords. Save a backup first (Settings, Help and backup). The router keeps the Wi-Fi name and password on its label and opens the %s network for 60 minutes, as on the first day.'), [ fmt.ltr('Virox-Setup') ]) ]),
			E('button', { 'class': 'btn cbi-button-negative', 'click': () => hn.askConfirm(_('Back to a new router'),
				_('Everything you set up is erased and the router restarts. This cannot be undone.'), _('Erase and restart')).then(yes => {
				if (!yes) return;
				hn.act(hn.api.factoryReset('RESET'), fmt.sentence(_('The router is erasing everything and restarting. In about 3 minutes, join the %s network to set it up again.'), [ fmt.ltr('Virox-Setup') ]));
			}) }, [ _('Back to a new router') ])
		]));
		return hn.card(_('Router and sign-out'), body, { 'id': 'vx-account' });
	},

	// Settings as a list of sections, like the settings of a phone: each row opens one section
	// alone (owner, 2026-11-19: one long page was too much at once). #section in the address;
	// old anchors (#vx-update, #vx-mac, #vx-package) still lead to their section.
	sections() {
		const [ set, wf, gm, us, pp, dv, up, bl, pv, th, ls, wk, gu, ap, vp, ua, po, sc, ub, qc, ad, qa, ww ] = this.data;
		const ICON = {
			internet: 'M4 18h4v-6H4zM10 18h4V8h-4zM16 18h4V4h-4z',
			lines: 'M4 8h16M4 16h16M8 4l-4 4 4 4M16 12l4 4-4 4',
			identity: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10H5zM12 14v2',
			guest: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 21a6 6 0 0 1 12 0M17 8v6M14 11h6',
			aps: 'M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 14 0M4 4h16v4H4z',
			wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 19.5h.01',
			family: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6',
			games: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M7 6h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6L14 14h-4l-1 .6A4 4 0 0 1 2 12v-1a5 5 0 0 1 5-5z',
			update: 'M12 4v10M8 10l4 4 4-4M4 18h16',
			backup: 'M4 7h16v12H4zM8 7V4h8v3M9 13h6',
			display: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5s-.6-1.2-.6-2c0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8z',
			router: 'M4 14h16v5H4zM8 16.5h.01M12 16.5h.01M7 14l3-7M17 14l-3-7',
			vpn: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9.5 12l2 2 3.5-4',
			restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
			usb: 'M12 3v13M8 7l4-4 4 4M7 12v3h10v-3M12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
			addresses: 'M4 6h16M4 12h16M4 18h10M18 16v4M16 18h4'
		};
		const list = [
			hn.isAccessPoint(ap)
				? [ 'lines', _('Lines and packages'), '', () => E('div', { 'id': 'vx-package' }, [ hn.section(_('Lines and packages'), '', [
					E('p', { 'class': 'vx-hint' }, [ _('This router is an access point: the internet lines, the package and the open ports are set on the main router.') ]) ]) ]), 'internet' ]
				: [ 'lines', ls && ls.enabled ? _('Lines and packages') : _('Package'), '', () => ls ? this.linesCard(ls) : E('div', { 'id': 'vx-package' }, [ this.packageCard(set) ]), 'internet' ],
			[ 'ping', _('Ping and games'), '', () => this.pingCard(ls, gm, qa, ap), 'internet' ],
			[ 'wifitest', _('Wi-Fi or internet?'), '', () => this.wifiTestCard(ls, ap), 'internet' ],
			ww && ww.router && !hn.isAccessPoint(ap) ? [ 'wifiwan', _('Internet from Wi-Fi'), '', () => this.wifiWanCard(ww), 'internet' ] : null,
			po && po.router && !hn.isAccessPoint(ap) ? [ 'ports', _('Open ports'), '', () => this.portsCard(po, dv, ls), 'internet' ] : null,
			vp && !vp.ap ? [ 'vpn', _('VPN'), vp.enabled ? (vp.connected ? _('Connected') : _('Not connected')) : _('Off'), () => this.vpnCard(vp, dv, pp), 'internet' ] : null,
			[ 'wifi', _('Wi-Fi'), _('Name and password, channels, network names'), () => this.wifiCard(wf, gu), 'wifi' ],
			gu ? [ 'guest', _('Guest network'), '', () => this.guestCard(gu, ls), 'wifi' ] : null,
			ap ? [ 'aps', _('Access points'), '', () => this.apsCard(ap), 'wifi' ] : null,
			wk ? [ 'identity', _('Personal passwords'), '', () => this.identityCard(wk, pp, dv), 'wifi' ] : null,
			qc ? [ 'qr', _('QR codes and printing'), '', () => this.qrCard(qc), 'wifi' ] : null,
			// one place for the times of the router itself (owner 2026-11-22: "Schedules" was the name
			// of three places): Wi-Fi off, lights and the scheduled restart; the device times stay in Control
			sc ? [ 'schedule', _('Wi-Fi, lights and restart times'), '', () => E('div', {}, [ this.scheduleCard(sc), sc.managed ? '' : this.restartCard(sc) ]), 'wifi' ] : null,
			[ 'family', _('Family logins'), _('Logins that see only their own devices'), () => this.usersCard(us, pp), 'settings' ],
			[ 'update', _('Update'), up && up.available ? _('A new version is available') : _('Router version and updates'), () => this.updateCard(up), 'settings' ],
			[ 'backup', _('Help and backup'), _('Help report, save and restore settings'), () => this.helpCard(bl), 'settings' ],
			ad ? [ 'addresses', _('Addresses'), _('The addresses of the Virox units and of the devices'), () => this.addressesCard(ad), 'settings' ] : null,
			ub ? [ 'usb', _('USB disk and printer'), (ub.disks || []).length ? _('A disk is plugged in') : _('Share a flash disk or a printer'), () => this.usbCard(ub), 'settings' ] : null,
			[ 'display', _('Display and language'), _('Language, look, light or dark, colour'), () => this.accountCard(pv, th, 'display'), 'settings' ],
			[ 'router', _('Router and sign-out'), _('Quick setup, complete menu, sign out'), () => this.accountCard(pv, th, 'router'), 'settings' ]
		].filter(x => x);
		return { list, ICON };
	},

	// the page this view draws: admin/internet, admin/wifi or admin/settings
	page() {
		const p = (L.env.dispatchpath || [])[1];
		return (p == 'internet' || p == 'wifi') ? p : 'settings';
	},

	sectionOf(hash) {
		const h = (hash || '').replace(/^#/, '');
		return ({ 'vx-package': 'lines', 'internet': 'lines', 'vx-lines': 'lines', 'vx-update': 'update', 'vx-mac': 'router', 'vx-wifi': 'wifi', 'vx-help': 'backup' })[h] || h;
	},

	draw() {
		const { list, ICON } = this.sections();
		const page = this.page();
		const mine = list.filter(x => x[4] == page);
		const want = this.sectionOf(location.hash);
		const svg = (d, cls) => {
			const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('class', 'vx-icon' + (cls ? ' ' + cls : '')); e.setAttribute('aria-hidden', 'true');
			const q = document.createElementNS('http://www.w3.org/2000/svg', 'path'); q.setAttribute('d', d); e.appendChild(q);
			return e;
		};
		// Internet and Wi-Fi: the title, one line, the parts as tabs
		if (page != 'settings') {
			this.root.replaceChildren(
				E('h1', {}, [ page == 'internet' ? _('Internet') : _('Wi-Fi') ]),
				E('p', { 'class': 'vx-sub' }, [ page == 'internet'
					? _('Your internet lines and packages, who uses which line, low ping for games and calls, and the VPN.')
					: _('The Wi-Fi of the house, the network for visitors, the access points and a password for each person.') ]),
				mine.length > 1 ? hn.tabs(mine.map(x => ({ id: x[0], label: x[1], pane: E('div', {}, [ x[3]() ]) })), mine.some(x => x[0] == want) ? want : null)
					: (mine[0] ? mine[0][3]() : '')
			);
			return;
		}
		const cur = mine.filter(x => x[0] == want)[0];
		if (cur) {
			this.root.replaceChildren(
				E('a', { 'class': 'vx-back', 'href': '#', 'click': ev => { ev.preventDefault(); history.pushState(null, '', location.pathname); this.draw(); window.scrollTo(0, 0); } },
					[ svg('M15 6l-6 6 6 6', 'vx-chev'), E('span', {}, [ _('Settings', 'Virox') ]) ]),
				E('h1', {}, [ cur[1] ]),
				cur[3]()
			);
			return;
		}
		this.root.replaceChildren(
			E('h1', {}, [ _('Settings', 'Virox') ]),
			E('p', { 'class': 'vx-sub' }, [ _('Family logins, updates, backups, language and the router itself.') ]),
			E('ul', { 'class': 'vx-settings-list' }, mine.map(x => E('li', {}, [
				E('a', { 'href': '#' + x[0], 'click': ev => { ev.preventDefault(); history.pushState(null, '', '#' + x[0]); this.draw(); window.scrollTo(0, 0); } }, [
					E('span', { 'class': 'vx-set-icon' }, [ svg(ICON[x[0]] || ICON.router) ]),
					E('span', { 'class': 'vx-set-text' }, [ E('strong', {}, [ x[1] ]), E('span', {}, [ x[2] ]) ]),
					svg('M9 6l6 6-6 6', 'vx-chev vx-set-chev')
				])
			])))
		);
	},

	render(data) {
		if (!data) return hn.failed();
		this.data = data;
		this.root = E('div', { 'class': 'vx-page vx-settings' });
		window.addEventListener('popstate', () => this.draw());
		this.draw();
		return this.root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
