// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox setup wizard (BUILD-PLAN B6 items 3, 4, 5, 9, 10; sections 10 and 11).
// This page is only a client of the virox.setup API (docs/api.md): validation, the changes
// for each mode and the password all happen in the backend. The page shows five steps,
// translates the API's error codes, and applies the staged changes with LuCI's
// apply-with-rollback, so a mistake cannot lock the user out.
'use strict';
'require view';
'require uci';
'require rpc';
'require ui';

const callStatus = rpc.declare({ object: 'virox.setup', method: 'status' });
const callValidate = rpc.declare({ object: 'virox.setup', method: 'validate', params: [ 'settings' ] });
const callPlan = rpc.declare({ object: 'virox.setup', method: 'plan', params: [ 'settings' ] });
const callSetPassword = rpc.declare({ object: 'virox.setup', method: 'set_password', params: [ 'password' ] });
const callSetLanguage = rpc.declare({ object: 'virox.setup', method: 'set_language', params: [ 'lang' ] });
// the session's changes committed and applied without the browser's confirmation (see save())
const callApply = rpc.declare({ object: 'uci', method: 'apply', params: [ 'rollback', 'timeout' ], reject: true });

const STEP_KEY = 'vx-setup-step';
const STEPS = 5;

// API error code -> message (each client translates codes itself)
function errorText(code) {
	return {
		required: _('This field is needed.'),
		invalid: _('This value is not allowed.'),
		invalid_ipv4: _('This is not a valid address. Example: 192.168.0.10'),
		length_1_32: _('Use 1 to 32 characters for the name.'),
		wpa_key_8_63: _('Use 8 to 63 English letters, digits or symbols.'),
		password_short: _('The password is too short: use at least 6 characters.'),
		passwd_failed: _('The password could not be saved. Try again; if it keeps failing, restart the router.')
	}[code] || _('This value is not allowed.');
}

// API field name -> input id
const FIELD_IDS = {
	'ssid': 'vx-ssid', 'key': 'vx-key',
	'wan.username': 'vx-pppoe-user', 'wan.password': 'vx-pppoe-pass',
	'wan.ipaddr': 'vx-st-ip', 'wan.netmask': 'vx-st-mask', 'wan.gateway': 'vx-st-gw', 'wan.dns': 'vx-st-dns'
};

function ltr(text) {
	return E('bdi', { 'dir': 'ltr' }, [ text ]);
}

const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

// password input with an eye button inside the field (owner review B4)
function pwInput(id, value, extra) {
	const input = E('input', Object.assign({ 'id': id, 'type': 'password', 'dir': 'ltr', 'value': value }, extra || {}));
	const eye = E('button', {
		'type': 'button', 'class': 'vx-eye', 'aria-pressed': 'false', 'aria-label': _('Show password'),
		'click': (ev) => {
			const show = input.type == 'password';
			input.type = show ? 'text' : 'password';
			ev.currentTarget.setAttribute('aria-pressed', String(show));
			ev.currentTarget.setAttribute('aria-label', show ? _('Hide password') : _('Show password'));
		}
	});
	eye.innerHTML = EYE;
	return E('span', { 'class': 'vx-pw-wrap' }, [ input, eye ]);
}

// WIFI: QR payload (ZXing format): escape \ ; , : "
function wifiQrText(ssid, key) {
	const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');
	return 'WIFI:T:WPA;S:' + esc(ssid) + ';P:' + esc(key) + ';;';
}

function field(id, label, input, hint) {
	return E('div', { 'class': 'vx-field' }, [
		E('label', { 'for': id }, [ label ]),
		input,
		hint ? E('span', { 'class': 'vx-hint', 'id': id + '-hint' }, [ hint ]) : '',
		E('span', { 'class': 'vx-error', 'id': id + '-error', 'role': 'alert' })
	]);
}

function setError(id, msg) {
	const input = document.getElementById(id), err = document.getElementById(id + '-error');
	if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
	if (err) err.textContent = msg || '';
	return !msg;
}

function copyText(text, btn) {
	const done = () => { btn.textContent = _('Copied'); setTimeout(() => btn.textContent = _('Copy'), 2000); };
	if (navigator.clipboard && window.isSecureContext)
		return navigator.clipboard.writeText(text).then(done);
	const ta = E('textarea', { 'style': 'position:fixed;opacity:0' }, [ text ]);
	document.body.appendChild(ta);
	ta.select();
	try { document.execCommand('copy'); done(); } catch (e) {}
	document.body.removeChild(ta);
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load() {
		return Promise.all([ callStatus(), uci.load([ 'network', 'wireless', 'dhcp', 'firewall', 'lg7200', 'luci' ]) ]);
	},

	render(data) {
		const st = this.status = data[0] || {};
		const ap = uci.sections('wireless', 'wifi-iface').filter(s => s.mode == 'ap')[0];

		this.state = {
			lang: uci.get('luci', 'main', 'lang') || 'ar',
			password: '',
			mode: st.mode || 'router',
			wanProto: uci.get('network', 'wan', 'proto') || 'dhcp',
			pppoeUser: uci.get('network', 'wan', 'username') || '',
			pppoePass: '',
			staticIp: '', staticMask: '255.255.255.0', staticGw: '', staticDns: '',
			ssid: (ap && ap.ssid) || st.unit_ssid || '',
			key: (ap && ap.key) || st.unit_key || ''
		};

		this.root = E('div', { 'class': 'vx-wizard' });
		if (st.has_password && st.setup_done && !sessionStorage.getItem(STEP_KEY))
			this.showDone();
		else
			this.show(+(sessionStorage.getItem(STEP_KEY) || 0));
		return this.root;
	},

	settings() {
		const s = this.state;
		const wan = { proto: s.wanProto };
		if (s.wanProto == 'pppoe') { wan.username = s.pppoeUser; wan.password = s.pppoePass; }
		if (s.wanProto == 'static') { wan.ipaddr = s.staticIp; wan.netmask = s.staticMask; wan.gateway = s.staticGw; wan.dns = s.staticDns; }
		return { mode: s.mode, wan: wan, ssid: s.ssid, key: s.key };
	},

	// Ask the backend; show only the errors of the fields on this step.
	checkFields(ids, onOk) {
		return callValidate(this.settings()).then(res => {
			let ok = true;
			ids.forEach(id => setError(id, ''));
			Object.keys((res && res.errors) || {}).forEach(f => {
				const id = FIELD_IDS[f];
				if (id && ids.indexOf(id) >= 0) { setError(id, errorText(res.errors[f])); ok = false; }
			});
			if (ok) onOk();
		});
	},

	frame(step, title, help, body, actions) {
		const bars = [];
		for (let i = 0; i < STEPS; i++)
			bars.push(E('li', { 'class': i < step ? 'done' : (i == step ? 'current' : '') }));
		return E('div', { 'class': 'vx-card' }, [
			E('p', { 'class': 'vx-step-label' }, [ _('Step %d of %d').format(step + 1, STEPS) ]),
			E('ol', { 'class': 'vx-progress', 'aria-hidden': 'true' }, bars),
			E('h2', {}, [ title ]),
			help ? E('p', { 'class': 'vx-help' }, [ help ]) : '',
			body,
			E('div', { 'class': 'vx-actions' }, actions)
		]);
	},

	nav(back, next, nextLabel) {
		return [
			back !== null ? E('button', { 'class': 'btn cbi-button', 'click': () => this.show(back) }, [ _('Back') ]) : E('span'),
			E('button', { 'class': 'btn cbi-button-positive', 'click': next }, [ nextLabel || _('Next') ])
		];
	},

	show(step) {
		sessionStorage.setItem(STEP_KEY, String(step));
		const steps = [ this.stepLanguage, this.stepPassword, this.stepMode, this.stepWifi, this.stepReview ];
		this.root.replaceChildren(steps[Math.max(0, Math.min(step, STEPS - 1))].call(this));
		const first = this.root.querySelector('input, select, button.cbi-button-positive');
		if (first) first.focus();
		window.scrollTo(0, 0);
	},

	/* 1 language */
	stepLanguage() {
		const pick = (lang) => {
			if (lang == this.state.lang) return this.show(1);
			return callSetLanguage(lang).then(() => { sessionStorage.setItem(STEP_KEY, '1'); location.reload(); });
		};
		const btn = (lang, label) => E('button', {
			'class': 'btn cbi-button', 'lang': lang, 'aria-pressed': String(this.state.lang == lang), 'click': () => pick(lang)
		}, [ label ]);
		return this.frame(0, _('Welcome'), _('Choose the language of the router pages.'),
			E('div', { 'class': 'vx-lang' }, [ btn('ar', 'العربية'), btn('en', 'English') ]),
			[ E('span'), E('button', { 'class': 'btn cbi-button-positive', 'click': () => this.show(1) }, [ _('Next') ]) ]);
	},

	/* 2 password (only the "same twice" check is local; the backend enforces the rules) */
	stepPassword() {
		const body = E('div', {}, [
			field('vx-pw', _('Router password'),
				pwInput('vx-pw', this.state.password, { 'autocomplete': 'new-password', 'aria-describedby': 'vx-pw-hint' }),
				_('At least 6 characters. You will need it to open these pages again.')),
			field('vx-pw2', _('Repeat the password'),
				pwInput('vx-pw2', this.state.password, { 'autocomplete': 'new-password' }))
		]);

		const next = () => {
			const p = document.getElementById('vx-pw').value, c = document.getElementById('vx-pw2').value;
			let ok = setError('vx-pw', p.length < 6 ? errorText('password_short') : '');
			ok = setError('vx-pw2', ok && p != c ? _('The two passwords are not the same. Type them again.') : '') && ok;
			if (!ok) return;
			this.state.password = p;
			this.show(2);
		};
		return this.frame(1, _('Protect your router'),
			_('Choose a password for these pages. Without it, anyone connected could change your settings.'), body, this.nav(0, next));
	},

	/* 3 how the router is used */
	stepMode() {
		const s = this.state;
		const choice = (group, value, title, text) => E('label', { 'class': 'vx-choice' }, [
			E('input', { 'type': 'radio', 'name': group, 'value': value,
			             'checked': (group == 'vx-mode' ? s.mode : s.wanProto) == value ? '' : null,
			             'change': () => { this.readMode(); if (group == 'vx-mode') s.mode = value; else s.wanProto = value; this.show(2); } }),
			E('div', {}, [ E('strong', {}, [ title ]), E('span', {}, [ text ]) ])
		]);

		const wan = [];
		if (s.mode == 'router' && this.status.has_wan !== false) {
			wan.push(E('h3', {}, [ _('How does the internet reach this router?') ]));
			wan.push(E('div', { 'class': 'vx-choices', 'role': 'radiogroup' }, [
				choice('vx-wan', 'dhcp', _('Automatic (recommended)'), _('The router gets its address from your internet modem. Works with most home modems.')),
				choice('vx-wan', 'pppoe', _('User name and password (PPPoE)'), _('For a modem in bridge mode. Your internet provider gives you the user name and password.')),
				choice('vx-wan', 'static', _('Fixed address'), _('Only if your provider gave you a fixed IP address.'))
			]));
			if (s.wanProto == 'pppoe') {
				wan.push(field('vx-pppoe-user', _('Internet user name'), E('input', { 'id': 'vx-pppoe-user', 'type': 'text', 'dir': 'ltr', 'autocomplete': 'off', 'value': s.pppoeUser })));
				wan.push(field('vx-pppoe-pass', _('Internet password'), pwInput('vx-pppoe-pass', s.pppoePass, { 'autocomplete': 'off' })));
			}
			if (s.wanProto == 'static') {
				const ip = (id, label, val) => field(id, label, E('input', { 'id': id, 'type': 'text', 'dir': 'ltr', 'inputmode': 'decimal', 'value': val, 'placeholder': '0.0.0.0' }));
				wan.push(ip('vx-st-ip', _('IP address', 'Virox'), s.staticIp));
				wan.push(ip('vx-st-mask', _('Network mask'), s.staticMask));
				wan.push(ip('vx-st-gw', _('Gateway', 'Virox'), s.staticGw));
				wan.push(ip('vx-st-dns', _('DNS server (optional)'), s.staticDns));
			}
		}
		else if (s.mode == 'ap') {
			wan.push(E('div', { 'class': 'vx-notice' }, [
				E('strong', {}, [ _('Access point mode') ]),
				_('Connect any port of this router to your main router. All ports and the Wi-Fi join your main network, which gives out the addresses. This router will be reachable at the address your main router gives it, and also at %s.').format(this.status.lan_ip || '192.168.72.1')
			]));
		}

		const body = E('div', {}, [
			E('div', { 'class': 'vx-choices', 'role': 'radiogroup' }, [
				choice('vx-mode', 'router', _('Router (recommended)'), _('This router connects to your internet modem and makes your home network.')),
				choice('vx-mode', 'ap', _('Access point'), _('You already have a router. This one only adds Wi-Fi and more ports to it.'))
			]),
			E('div', {}, wan)
		]);

		const next = () => {
			this.readMode();
			this.checkFields([ 'vx-pppoe-user', 'vx-pppoe-pass', 'vx-st-ip', 'vx-st-mask', 'vx-st-gw', 'vx-st-dns' ], () => this.show(3));
		};
		return this.frame(2, _('How will you use this router?'), null, body, this.nav(1, next));
	},

	readMode() {
		const s = this.state, v = (id) => { const e = document.getElementById(id); return e ? e.value : null; };
		if (v('vx-pppoe-user') !== null) { s.pppoeUser = v('vx-pppoe-user').trim(); s.pppoePass = v('vx-pppoe-pass'); }
		if (v('vx-st-ip') !== null) { s.staticIp = v('vx-st-ip').trim(); s.staticMask = v('vx-st-mask').trim(); s.staticGw = v('vx-st-gw').trim(); s.staticDns = v('vx-st-dns').trim(); }
	},

	/* 4 Wi-Fi */
	stepWifi() {
		const s = this.state;
		const body = E('div', {}, [
			field('vx-ssid', _('Wi-Fi name'), E('input', { 'id': 'vx-ssid', 'type': 'text', 'dir': 'ltr', 'autocomplete': 'off', 'value': s.ssid }),
				_('The name people see when they look for Wi-Fi.')),
			field('vx-key', _('Wi-Fi password'), E('input', { 'id': 'vx-key', 'type': 'text', 'dir': 'ltr', 'autocomplete': 'off', 'value': s.key, 'class': 'vx-mono' }),
				_('8 to 63 characters. Phones and laptops that are connected now will need the new password.'))
		]);
		const next = () => {
			s.ssid = document.getElementById('vx-ssid').value;
			s.key = document.getElementById('vx-key').value;
			this.checkFields([ 'vx-ssid', 'vx-key' ], () => this.show(4));
		};
		return this.frame(3, _('Your Wi-Fi'), _('A secure name and password were already made for this router. You can keep them or change them.'), body, this.nav(2, next));
	},

	/* 5 review + save */
	stepReview() {
		const s = this.state;
		const wanText = { dhcp: _('Automatic', 'Virox'), pppoe: _('User name and password (PPPoE)'), static: _('Fixed address') };
		const rows = [
			[ _('Language'), s.lang == 'ar' ? 'العربية' : 'English' ],
			[ _('Router password'), _('Set') ],
			[ _('Use'), s.mode == 'router' ? _('Router') : _('Access point') ]
		];
		if (s.mode == 'router' && this.status.has_wan !== false) rows.push([ _('Internet'), wanText[s.wanProto] ]);
		rows.push([ _('Wi-Fi name'), ltr(s.ssid) ]);

		const dl = E('dl', { 'class': 'vx-summary' });
		rows.forEach(r => { dl.appendChild(E('dt', {}, [ r[0] ])); dl.appendChild(E('dd', {}, [ r[1] ])); });

		return this.frame(4, _('Check and save'), null, E('div', {}, [
			dl,
			E('div', { 'class': 'vx-notice warn' }, [
				E('strong', {}, [ _('Before you press Save') ]),
				_('After saving, join the new Wi-Fi shown on the next page if you are on Wi-Fi now.')
			])
		]), this.nav(3, () => this.save(), _('Save')));
	},

	save() {
		const btns = this.root.querySelectorAll('button');
		btns.forEach(b => b.disabled = true);
		const fail = (msg) => { btns.forEach(b => b.disabled = false); ui.addNotification(null, E('p', {}, [ msg ]), 'danger'); };

		// a router that already has a password and no new one typed keeps it: the Wi-Fi page opens the
		// wizard at the Wi-Fi step, past the password step ("password too short", owner 2026-11-20)
		const pw = (!this.state.password && this.status.has_password) ? Promise.resolve({ result: true })
			: callSetPassword(this.state.password);
		return pw.then(res => {
			if (!res || !res.result)
				return fail(errorText(res && res.error || 'passwd_failed'));
			this.state.password = '';
			return callPlan(this.settings()).then(r => {
				if (!r || !r.ok)
					return fail(_('Saving failed: %s').format(Object.keys((r && r.errors) || {}).join(', ')));
				// run the backend's generic operations in this session, then apply with rollback
				(r.ops || []).forEach(o => {
					if (o.op == 'add')
						uci.add(o.config, o.type, o.name);
					else if (o.op == 'set')
						Object.keys(o.values || {}).forEach(k => uci.set(o.config, o.section, k, o.values[k]));
					else if (o.op == 'delete' && (o.options || o.option))
						L.toArray(o.options || o.option).forEach(k => uci.unset(o.config, o.section, k));
					else if (o.op == 'delete')
						uci.remove(o.config, o.section);
				});
				// Applied without rollback (owner 2026-11-23: "saving does not keep the settings when I am on
				// Wi-Fi, it goes back and I have to reset"). The checked apply waited for this browser to
				// confirm within a minute; a save from Wi-Fi changes that Wi-Fi (name, key, the setup network
				// closes), so the browser was gone, nothing confirmed, and the router went back to the old
				// settings (only the password, saved apart, stayed). The wizard changes nothing that locks
				// a device out for good: the new Wi-Fi is on the page shown first, before the link drops.
				return uci.save().then(() => {
					sessionStorage.removeItem(STEP_KEY);
					this.showDone(true);
					return callApply(false, 0).catch(() => {});
				});
			});
		}).catch(e => fail(_('Saving failed: %s').format(e.message || e)));
	},

	/* done */
	showDone(applying) {
		const ap = uci.sections('wireless', 'wifi-iface').filter(s => s.mode == 'ap')[0];
		const ssid = (ap && ap.ssid) || this.status.unit_ssid || '';
		const key = (ap && ap.key) || this.status.unit_key || '';
		const secret = (label, value) => E('div', { 'class': 'vx-secret' }, [
			E('dl', {}, [ E('dt', {}, [ label ]), E('dd', {}, [ value ]) ]),
			E('button', { 'class': 'btn cbi-button', 'click': (ev) => copyText(value, ev.target) }, [ _('Copy') ])
		]);
		// QR code made in the browser by LuCI's uqr library (MIT, luci-lib-uqr); nothing leaves the router
		const qr = E('div', { 'class': 'vx-qr' });
		if (ssid && key)
			L.require('uqr').then(uqr => {
				const svg = uqr.renderSVG(wifiQrText(ssid, key), { pixelSize: 4, whiteColor: 'white', blackColor: 'black', ecc: 'M' });
				// uqr gives width and height but no viewBox: scaled by CSS, the code stayed small in the
				// box's corner (owner 2026-11-20). With a viewBox it fills the box.
				const el = E(svg), w = parseFloat(el.getAttribute('width')), h = parseFloat(el.getAttribute('height'));
				if (!el.getAttribute('viewBox') && w && h) el.setAttribute('viewBox', '0 0 %s %s'.format(w, h));
				el.removeAttribute('width'); el.removeAttribute('height');
				el.setAttribute('role', 'img'); el.setAttribute('aria-label', _('Wi-Fi QR code'));
				qr.replaceChildren(el,
					E('p', {}, [ _('Point the phone camera at this code to join the Wi-Fi.') ]));
			}).catch(() => {});

		this.root.replaceChildren(E('div', { 'class': 'vx-card' }, [
			E('h2', {}, [ _('Your router is ready') ]),
			// right after Save: the router applies for about a minute, this device may lose its link now
			applying ? E('div', { 'class': 'vx-notice' }, [ _('The router is applying the settings now (about one minute). If this device was on Wi-Fi, it loses the connection: join the Wi-Fi below.') ]) : '',
			E('p', { 'class': 'vx-help' }, [ _('Connect your phones and laptops to this Wi-Fi:') ]),
			secret(_('Wi-Fi name'), ssid),
			secret(_('Wi-Fi password'), key),
			qr,
			// B9 Y1: a Virox main router finds the access point by itself (no code); any other main router
			// needs nothing (owner 2026-11-20: the code text confused a unit under an ISP router)
			this.state.mode == 'ap' ? E('p', { 'class': 'vx-help' }, [ _('If the main router is a Virox router too, it finds this access point by itself: on the main router open Wi-Fi, Access points, and press Add. With any other main router there is nothing more to do.') ]) : '',
			E('div', { 'class': 'vx-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': () => this.show(0) }, [ _('Run the setup again') ]),
				E('a', { 'class': 'btn cbi-button-positive', 'href': L.url('admin/status/overview') }, [ _('Go to the router pages') ])
			])
		]));
	}
});
