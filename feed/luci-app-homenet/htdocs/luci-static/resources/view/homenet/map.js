// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Network map (owner 2026-11-20: "who is connected to what", drawn like a network diagram): the
// internet, the main router, the access points and the devices connected now, each as a picture
// with its name, kind and address; a solid line for a cable, a dashed line and Wi-Fi waves for
// Wi-Fi. Wide screens: left to right (right to left in Arabic), as a classic diagram; narrow
// screens: a tree from top to bottom. A tap on a device opens its sheet on the Devices page. On a
// Virox access point the main router is the provider's or another router: it is drawn as such,
// with this unit (and, when this unit collects the others, the other access points) under it.
// Everything comes from the existing calls (devices, network, virox.apctl list, virox.lines
// status); nothing new is asked of the router.
'use strict';
'require view';
'require homenet.ui as hn';
'require virox.fmt as fmt';

const SVG = 'http://www.w3.org/2000/svg';

// the pictures (64 x 64), their own colours in light and dark mode
const PICS = {
	cloud: '<path d="M17 47h31a11.5 11.5 0 0 0 1.6-22.9A15.5 15.5 0 0 0 19.8 21 13 13 0 0 0 17 47z" fill="#d7edfb" stroke="#7cc4ea" stroke-width="2"/>',
	router: '<line x1="18" y1="34" x2="15" y2="11" stroke="#475569" stroke-width="3" stroke-linecap="round"/><line x1="46" y1="34" x2="49" y2="11" stroke="#475569" stroke-width="3" stroke-linecap="round"/>' +
		'<path d="M27.5 23a6.5 6.5 0 0 1 9 0M24 19a11.5 11.5 0 0 1 16 0" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="26.5" r="1.8" fill="#38bdf8"/>' +
		'<rect x="5" y="34" width="54" height="15" rx="4" fill="#dfe5ec" stroke="#94a3b8" stroke-width="1.5"/><rect x="5" y="45" width="54" height="4" rx="2" fill="#94a3b8"/>' +
		'<circle cx="15" cy="40.5" r="1.7" fill="#22c55e"/><circle cx="21" cy="40.5" r="1.7" fill="#22c55e"/><circle cx="27" cy="40.5" r="1.7" fill="#38bdf8"/>',
	ap: '<path d="M22.5 15a13.5 13.5 0 0 1 19 0M26.5 19.5a7.5 7.5 0 0 1 11 0" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>' +
		'<ellipse cx="32" cy="39" rx="25" ry="10" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/><ellipse cx="32" cy="36" rx="25" ry="9" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/><circle cx="32" cy="36" r="2.6" fill="#22c55e"/>',
	phone: '<rect x="20" y="5" width="24" height="51" rx="5" fill="#3b82f6"/><rect x="23" y="10" width="18" height="38" rx="1.5" fill="#dbeafe"/><circle cx="32" cy="52" r="2" fill="#bfdbfe"/>',
	tablet: '<rect x="10" y="6" width="44" height="52" rx="5" fill="#6366f1"/><rect x="14" y="11" width="36" height="40" rx="1.5" fill="#e0e7ff"/><circle cx="32" cy="54.5" r="1.8" fill="#c7d2fe"/>',
	laptop: '<rect x="12" y="11" width="40" height="28" rx="2.5" fill="#1e3a8a"/><rect x="15" y="14" width="34" height="22" fill="#60a5fa"/><path d="M4 42h56l-4 7H8z" fill="#94a3b8"/><rect x="26" y="42" width="12" height="2" fill="#64748b"/>',
	computer: '<rect x="3" y="14" width="36" height="25" rx="2" fill="#0ea5e9"/><rect x="6" y="17" width="30" height="19" fill="#e0f2fe"/><rect x="18" y="39" width="6" height="7" fill="#64748b"/><rect x="12" y="46" width="18" height="3" rx="1.5" fill="#475569"/>' +
		'<rect x="43" y="8" width="18" height="45" rx="2" fill="#64748b"/><rect x="46" y="13" width="12" height="2" fill="#cbd5e1"/><rect x="46" y="18" width="12" height="2" fill="#cbd5e1"/><circle cx="52" cy="45" r="2" fill="#cbd5e1"/>',
	tv: '<rect x="3" y="9" width="58" height="36" rx="3" fill="#111827"/><rect x="6" y="12" width="52" height="30" fill="#3b4b63"/><path d="M24 53h16M32 45v8" stroke="#475569" stroke-width="3" stroke-linecap="round"/>',
	game: '<path d="M18 20h28a12 12 0 0 1 12 12v3a8 8 0 0 1-14 5.3L41 37H23l-3 3.3A8 8 0 0 1 6 35v-3a12 12 0 0 1 12-12z" fill="#7c3aed"/>' +
		'<path d="M15 28v8M11 32h8" stroke="#ede9fe" stroke-width="2.5" stroke-linecap="round"/><circle cx="44" cy="29" r="2.2" fill="#ede9fe"/><circle cx="49" cy="34" r="2.2" fill="#ede9fe"/>',
	printer: '<rect x="16" y="6" width="32" height="20" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/><path d="M21 12h22M21 17h16" stroke="#93c5fd" stroke-width="2"/>' +
		'<rect x="5" y="22" width="54" height="24" rx="4" fill="#64748b"/><rect x="14" y="40" width="36" height="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/><circle cx="50" cy="30" r="2" fill="#22c55e"/>',
	camera: '<rect x="6" y="18" width="44" height="26" rx="5" fill="#0f766e"/><circle cx="26" cy="31" r="9" fill="#ccfbf1"/><circle cx="26" cy="31" r="4.5" fill="#134e4a"/><path d="M50 26l9-5v20l-9-5z" fill="#14b8a6"/>',
	other: '<rect x="8" y="12" width="48" height="32" rx="4" fill="#94a3b8"/><rect x="12" y="16" width="40" height="24" rx="2" fill="#e2e8f0"/><rect x="26" y="44" width="12" height="6" fill="#94a3b8"/><rect x="20" y="50" width="24" height="3" rx="1.5" fill="#64748b"/>',
	more: '<circle cx="18" cy="32" r="5" fill="#94a3b8"/><circle cx="32" cy="32" r="5" fill="#94a3b8"/><circle cx="46" cy="32" r="5" fill="#94a3b8"/>'
};
// Wi-Fi waves next to a device on Wi-Fi
const WAVES = '<path d="M3 10a12 12 0 0 1 16 0M6.5 13.5a7 7 0 0 1 9 0" fill="none" stroke="#1d4ed8" stroke-width="2.6" stroke-linecap="round"/><circle cx="11" cy="17.5" r="1.9" fill="#1d4ed8"/>';

function pic(kind, size, wifi) {
	const wrap = E('span', { 'class': 'vx-nm-pic', 'style': 'inline-size:%dpx;block-size:%dpx'.format(size, size) });
	const s = document.createElementNS(SVG, 'svg');
	s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true');
	s.innerHTML = PICS[kind] || PICS.other;
	wrap.appendChild(s);
	if (wifi) {
		const w = document.createElementNS(SVG, 'svg');
		w.setAttribute('viewBox', '0 0 22 20'); w.setAttribute('class', 'vx-nm-waves'); w.setAttribute('aria-hidden', 'true');
		w.innerHTML = WAVES;
		wrap.appendChild(w);
	}
	return wrap;
}

// the kind of a device from its name and the names it gave the router (no fingerprint needed)
const KINDS = [
	[ 'game', /playstation|\bps[345]\b|xbox|nintendo|switch|بلايستيشن/ ],
	[ 'tablet', /ipad|\btab\b|tablet|galaxy-?tab|تابلت/ ],
	[ 'phone', /iphone|android|galaxy|\bsm-|redmi|xiaomi|poco|oppo|realme|vivo|huawei|honor|infinix|tecno|itel|nokia|pixel|oneplus|phone|موبايل|تليفون|تلفون|جوال/ ],
	[ 'tv', /\btv\b|-tv|tv-|bravia|webos|tizen|roku|chromecast|firetv|fire-tv|shield|receiver|ريسيفر|تلفزيون|تليفزيون|شاشة/ ],
	[ 'printer', /print|epson|canon|brother|laserjet|طابعة/ ],
	[ 'camera', /\bcam|camera|dvr|nvr|hikvision|dahua|ezviz|imou|كاميرا/ ],
	[ 'computer', /desktop|\bpc\b|imac|mac-?mini|كمبيوتر|ديسكتوب/ ],
	[ 'laptop', /laptop|macbook|notebook|windows|thinkpad|dell|lenovo|asus|acer|\bhp\b|لابتوب/ ]
];
const KIND_NAME = {
	phone: () => _('Mobile'), tablet: () => _('Tablet'), laptop: () => _('Laptop'), computer: () => _('Computer'), tv: () => _('TV'),
	game: () => _('Game console'), printer: () => _('Printer'), camera: () => _('Camera'), other: () => _('Device', 'Virox')
};
function kindOf(d) {
	if (d.behind_router) return 'router';
	const t = [ d.name, ...(d.macs || []).map(m => m.hostname) ].filter(x => x).join(' ').toLowerCase();
	for (const k of KINDS) if (k[1].test(t)) return k[0];
	return 'other';
}
function signalOf(dbm) {
	if (dbm == null) return null;
	// the same levels as the Devices page (owner 2026-11-22: a phone at -77 with two bars is fair)
	return dbm >= -60 ? [ 'ok', _('Strong signal') ] : (dbm >= -80 ? [ 'warn', _('Fair signal') ] : [ 'bad', _('Weak signal') ]);
}

const MAX_DEVICES = 15;     // per box; the rest is one "N more" item that opens the Devices page

return view.extend({
	load() {
		return Promise.all([
			hn.api.devices().catch(() => null),
			hn.api.network().catch(() => null),
			hn.api.aps().catch(() => null),
			hn.api.lines().catch(() => null)
		]);
	},

	// the tree: { kind, title, sub: [lines], href, wifi, signal, kids: [] }
	tree() {
		const [ dv, net, ap, ls ] = this.data;
		const devices = ((dv && dv.devices) || []).filter(d => d.online);
		devices.sort((a, b) => hn.deviceName(a).localeCompare(hn.deviceName(b)));
		const lead = !!(ap && ap.lead), onAP = !!(ap && (ap.mode == 'ap' || ap.lead));
		const aps = (ap && ap.aps) || [];
		const groups = { self: [] };
		aps.forEach(a => { groups[a.id] = []; });
		devices.forEach(d => { groups[(d.where && d.where.ap != 'main' && groups[d.where.ap]) ? d.where.ap : 'self'].push(d); });

		const devNode = d => {
			const on = (d.macs || []).filter(m => m.online);
			const wifi = !!d.where || on.some(m => m.link == 'wifi');
			const k = kindOf(d), s = signalOf(d.where ? d.where.signal : null);
			const how = wifi ? (d.where && d.where.band ? (d.where.band == '5g' ? _('Wi-Fi 5 GHz') : _('Wi-Fi 2.4 GHz')) : _('Wi-Fi')) : _('Cable');
			return { kind: k, title: fmt.name(hn.deviceName(d)), href: L.url('admin/devices') + '#dev=' + encodeURIComponent(d.id), wifi, signal: s,
				sub: [ KIND_NAME[k]() + ' · ' + how, (on[0] && on[0].ip) ? fmt.ltr(on[0].ip) : '' ], kids: [] };
		};
		const devNodes = list => {
			const out = list.slice(0, MAX_DEVICES).map(devNode);
			if (list.length > MAX_DEVICES) out.push({ kind: 'more', title: fmt.sentence(_('%s more'), [ fmt.ltr(String(list.length - MAX_DEVICES)) ]), href: L.url('admin/devices'), sub: [], kids: [] });
			return out;
		};
		const count = n => fmt.sentence(_('Devices: %s'), [ fmt.ltr(String(n)) ]);

		const lines = (net && net.lines) || [];
		const up = lines.some(l => l.state == 'up');
		const cloudSub = (ls && ls.enabled && ls.lines) ? ls.lines.map((l, i) => {
			const st = lines.filter(x => x.line == (l.iface || (i ? 'wan' + (i + 1) : 'wan')))[0];
			return hn.lineName({ id: l.id || i + 1, name: l.name }) + ': ' + (st && st.state == 'up' ? _('working', 'Virox') : _('down', 'Virox'));
		}) : [ !lines.length ? _('Checking…') : (up ? _('Working') : _('Down')) ];
		const gw = (lines.filter(l => l.gateway)[0] || {}).gateway;

		let main;
		if (onAP) {
			const mine = { kind: 'ap', hub: true, title: lead ? _('This access point (collects the others)') : _('This access point'),
				sub: [ fmt.ltr(location.hostname), count(groups.self.length) ], kids: devNodes(groups.self) };
			main = { kind: 'router', hub: true, title: _('The main router'),
				sub: [ ap.main_kind == 'virox' ? _('A Virox router') : (ap.main_kind == 'other' ? _('The provider\'s or another router') : ''), gw ? fmt.ltr(gw) : '' ],
				kids: [ mine ] };
		}
		else
			main = { kind: 'router', hub: true, title: _('This router'), sub: [ fmt.ltr(location.hostname) ], kids: devNodes(groups.self) };
		// an access point on the wireless link (15.4 item 1): drawn as a radio link with its signal
		const SIGW = { excellent: [ 'ok', _('Excellent') ], good: [ 'ok', _('Good') ], weak: [ 'warn', _('Weak', 'Virox') ] };
		aps.forEach(a => {
			const ul = a.uplink || {}, air = ul.kind == 'wireless' || ul.kind == 'repeat';
			main.kids.push({ kind: 'ap', hub: true, down: !a.online, title: fmt.name(a.name || a.id), wifi: air,
				signal: air && a.online && SIGW[ul.label] ? SIGW[ul.label] : null,
				sub: [ a.online ? count((groups[a.id] || []).length) : _('Not answering'), air && a.online ? _('Wireless link') : '' ],
				kids: a.online ? devNodes(groups[a.id] || []) : [] });
		});
		return { kind: 'cloud', hub: true, down: lines.length && !up, title: _('The internet'), sub: cloudSub, kids: [ main ] };
	},

	// a node on the page: picture and its text, a link for a device
	el(n, size, below, x, y, w) {
		const text = E('span', { 'class': 'vx-nm-text' }, [
			E('strong', {}, [ n.title ]),
			...n.sub.filter(s => s).map(s => E('small', {}, [ s ])),
			n.signal ? E('small', { 'class': 'vx-nm-sig ' + n.signal[0] }, [ n.signal[1] ]) : ''
		]);
		const cls = 'vx-nm-node ' + (below ? 'below' : 'side') + (n.down ? ' down' : '') + (n.href ? ' link' : '');
		const style = 'inset-inline-start:%dpx;top:%dpx;%s'.format(x, y, w ? 'inline-size:%dpx;'.format(w) : '');
		const kids = [ pic(n.kind, size, n.wifi), text ];
		return n.href ? E('a', { 'class': cls, 'style': style, 'href': n.href }, kids) : E('div', { 'class': cls, 'style': style }, kids);
	},

	// wide: columns from the start side (the internet) to the end side (the devices)
	wide(root, W) {
		const COL = 175, ICON = 64, LEAF = 82, HUB = 132;
		const measure = n => !n.kids.length ? (n.hub ? HUB : LEAF) : Math.max(n.hub ? HUB : 0, n.kids.reduce((s, k) => s + measure(k), 0));
		const place = (n, y0, depth) => {
			n.depth = depth; n.cx = 70 + depth * COL;
			const h = measure(n);
			if (!n.kids.length) { n.cy = y0 + (n.hub ? 40 : h / 2); return; }
			const nat = n.kids.reduce((s, k) => s + measure(k), 0);
			let y = y0 + (h - nat) / 2;
			n.kids.forEach(k => { place(k, y, depth + 1); y += measure(k); });
			n.cy = (n.kids[0].cy + n.kids[n.kids.length - 1].cy) / 2;
		};
		place(root, 8, 0);
		const H = measure(root) + 70;
		const nodes = [], paths = [];
		const walk = n => {
			if (n.kids.length) {
				const bus = n.cx + COL / 2;
				const ys = n.kids.map(k => k.cy).concat([ n.cy ]);
				paths.push([ 'M%d %dH%d'.format(n.cx + ICON / 2 + 6, n.cy, bus), false ]);
				paths.push([ 'M%d %dV%d'.format(bus, Math.min(...ys), Math.max(...ys)), false ]);
				n.kids.forEach(k => paths.push([ 'M%d %dH%d'.format(bus, k.cy, k.cx - ICON / 2 - 6), !!k.wifi ]));
			}
			// a box with children: text under the picture; a device: text beside it
			nodes.push(n.hub ? this.el(n, ICON, true, n.cx - 78, n.cy - ICON / 2, 156)
				: this.el(n, ICON, false, n.cx - ICON / 2, n.cy - ICON / 2, Math.max(120, W - (n.cx - ICON / 2) - 4)));
			n.kids.forEach(walk);
		};
		walk(root);
		return { H, nodes, paths };
	},

	// narrow: a tree from top to bottom, each child indented under its parent
	narrow(root, W) {
		const ROW = 70, ICON = 46, IND = 40;
		const nodes = [], paths = [];
		let row = 0;
		const walk = (n, depth) => {
			n.x = 4 + depth * IND; n.cy = row * ROW + ICON / 2 + 4; row++;
			nodes.push(this.el(n, ICON, false, n.x, n.cy - ICON / 2, W - n.x - 4));
			n.kids.forEach(k => walk(k, depth + 1));
			if (n.kids.length) {
				const cx = n.x + ICON / 2, last = n.kids[n.kids.length - 1];
				paths.push([ 'M%d %dV%d'.format(cx, n.cy + ICON / 2 + 2, last.cy), false ]);
				n.kids.forEach(k => paths.push([ 'M%d %dH%d'.format(cx, k.cy, k.x - 3), !!k.wifi ]));
			}
		};
		walk(root, 0);
		return { H: row * ROW + 6, nodes, paths };
	},

	// a path drawn in left-to-right numbers, mirrored on a right-to-left page
	mirror(d, W) {
		return d.replace(/([MH])(\d+(?:\.\d+)?)/g, (m, c, x) => c + (W - +x));
	},

	drawMap() {
		if (!this.box) return;
		const W = this.box.clientWidth || 800;
		const root = this.tree();
		// columns while everything fits beside each other, otherwise the tree
		const depth = n => n.kids.length ? 1 + Math.max(...n.kids.map(depth)) : 0;
		const g = (W >= 70 + depth(root) * 175 + 32 + 190) ? this.wide(root, W) : this.narrow(root, W);
		const rtl = document.documentElement.dir == 'rtl';
		const svg = document.createElementNS(SVG, 'svg');
		svg.setAttribute('class', 'vx-nm-lines'); svg.setAttribute('width', W); svg.setAttribute('height', g.H);
		svg.setAttribute('aria-hidden', 'true');
		g.paths.forEach(p => {
			const e = document.createElementNS(SVG, 'path');
			e.setAttribute('d', rtl ? this.mirror(p[0], W) : p[0]);
			e.setAttribute('class', p[1] ? 'air' : 'wire');
			svg.appendChild(e);
		});
		this.box.style.blockSize = g.H + 'px';
		this.box.replaceChildren(svg, ...g.nodes);
	},

	draw() {
		const [ dv, , ap, ls ] = this.data;
		const devices = ((dv && dv.devices) || []).filter(d => d.online);
		const aps = (ap && ap.aps) || [];
		const onAP = !!(ap && (ap.mode == 'ap' || ap.lead));
		const tile = (label, value, cls) => E('div', { 'class': 'vx-stat' + (cls ? ' ' + cls : '') }, [ E('span', {}, [ label ]), E('b', {}, [ value ]) ]);
		if (!this.box) this.box = E('div', { 'class': 'vx-nm', 'role': 'img', 'aria-label': _('Network map') });
		this.root.replaceChildren(
			E('h1', {}, [ _('Network map') ]),
			E('p', { 'class': 'vx-sub' }, [ _('Who is connected to what, right now. Tap a device to control it.') ]),
			E('div', { 'class': 'vx-stats' }, [
				tile(_('Connected now'), fmt.ltr(String(devices.length)), 'blue'),
				tile(_('Access points'), fmt.ltr(String(aps.length + (onAP ? 1 : 0)))),
				tile(_('Internet lines'), fmt.ltr(String((ls && ls.enabled && ls.lines) ? ls.lines.length : 1)))
			]),
			E('section', { 'class': 'vx-card vx-nm-card' }, [
				this.box,
				E('p', { 'class': 'vx-nm-key' }, [
					E('span', { 'class': 'wire' }), _('Cable'), E('span', { 'class': 'air' }), _('Wi-Fi')
				])
			])
		);
		// drawn once the box has its width
		requestAnimationFrame(() => this.drawMap());
	},

	render(data) {
		this.data = data;
		this.root = E('div', { 'class': 'vx-page vx-netmap' });
		if (!data || !data[0]) return hn.failed();
		this.draw();
		let t = null;
		window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.drawMap(), 150); });
		// fresh every 15 seconds: a phone that moves between access points moves on the map
		hn.poll(() => this.load().then(d => { if (d && d[0]) { this.data = d; this.draw(); } }), 15);
		return this.root;
	},

	handleSave: null, handleSaveApply: null, handleReset: null
});
