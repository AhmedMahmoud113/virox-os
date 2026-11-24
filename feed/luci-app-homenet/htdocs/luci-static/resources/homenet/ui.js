// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Shared helpers of the Virox home-network pages (BUILD-PLAN B7, sections 10 and 11).
// The pages are only clients of the virox.homenet API (docs/api.md): every action is an API
// call, every rule lives in the backend. Here: the API calls, number formatting (GB = 1024 MB,
// the one factor of docs/api.md "Units"), left-to-right isolation of technical values,
// the translation of API error codes, and the loading / empty / error states (section 10.8).
'use strict';
'require baseclass';
'require rpc';
'require ui';
'require dom';
'require virox.fmt as fmt';

function call(method, params) {
	return rpc.declare({ object: 'virox.homenet', method: method, params: params || [] });
}

const api = {
	devices: call('devices'),
	live: call('live'),
	quality: call('quality', [ 'minutes' ]),
	outages: call('outages', [ 'month' ]),
	nightUse: call('night_use', [ 'target' ]),
	wifiTest: call('wifi_test'),
	prioritySet: call('priority_set', [ 'target', 'on' ]),
	kidSites: call('kid_sites', [ 'target', 'day' ]),
	kidsLogSet: call('kids_log_set', [ 'on' ]),
	people: call('people'),
	controls: call('controls'),
	schedules: call('schedules'),
	timelimits: call('timelimits'),
	settings: call('settings'),
	speedLimits: call('speed_limits'),
	limits: call('limits'),
	usage: call('usage'),
	usageRange: call('usage_range', [ 'target', 'from', 'to' ]),
	kids: call('kids'),
	siteCatalog: call('site_catalog'),
	siteLocks: call('site_locks'),
	filter: call('filter'),
	network: call('network'),
	users: call('users'),
	me: call('me'),
	reservations: call('reservations'),

	setName: call('set_name', [ 'id', 'name' ]),
	setPerson: call('set_person', [ 'id', 'person' ]),
	personAdd: call('person_add', [ 'name' ]),
	personRename: call('person_rename', [ 'id', 'name' ]),
	personDelete: call('person_delete', [ 'id' ]),
	link: call('link', [ 'mac', 'id' ]),
	wifikeys: call('wifikeys'),
	guest: call('guest'),
	guestSet: call('guest_set', [ 'enabled', 'ssid', 'key', 'line', 'band' ]),
	guestHidden: call('guest_hidden', [ 'on' ]),
	guestLimits: call('guest_limits', [ 'down_kbit', 'up_kbit', 'hours' ]),
	wifikeySet: call('wifikey_set', [ 'person', 'key' ]),
	personWithKey: call('person_with_key', [ 'name', 'key' ]),
	wifiCards: call('wifi_cards'),
	autolink: call('autolink', [ 'on' ]),
	merge: call('merge', [ 'from', 'into' ]),
	deviceForget: call('device_forget', [ 'id' ]),
	block: call('block', [ 'target' ]),
	unblock: call('unblock', [ 'target' ]),
	pause: call('pause', [ 'target', 'minutes' ]),
	resume: call('resume', [ 'target' ]),
	setPolicy: call('set_policy', [ 'new_devices' ]),
	approve: call('approve', [ 'id' ]),
	scheduleAdd: call('schedule_add', [ 'target', 'days', 'start', 'end', 'label' ]),
	scheduleUpdate: call('schedule_update', [ 'id', 'target', 'days', 'start', 'end', 'label' ]),
	scheduleEnable: call('schedule_enable', [ 'id', 'enabled' ]),
	scheduleRemove: call('schedule_remove', [ 'id' ]),
	timelimitSet: call('timelimit_set', [ 'target', 'minutes' ]),
	timelimitExtra: call('timelimit_extra', [ 'target', 'minutes' ]),
	meAskTime: call('me_ask_time', [ 'minutes' ]),
	settingsSet: call('settings_set', [ 'package_mb', 'renew_day', 'package_warn', 'active_kb' ]),
	speedLimitSet: call('speed_limit_set', [ 'target', 'down_kbit', 'up_kbit' ]),
	limitSet: call('limit_set', [ 'target', 'mb', 'warn' ]),
	packageCalibrate: call('package_calibrate', [ 'remaining_mb' ]),
	kidsSet: call('kids_set', [ 'target', 'on' ]),
	kidsBlock: call('kids_block', [ 'domain' ]),
	kidsUnblock: call('kids_unblock', [ 'domain' ]),
	siteLock: call('site_lock', [ 'target', 'minutes', 'sites', 'domain' ]),
	siteUnlock: call('site_unlock', [ 'id' ]),
	filterSet: call('filter_set', [ 'ads', 'adult', 'gambling', 'bypass', 'safesearch', 'youtube', 'ads_size' ]),
	filterBlock: call('filter_block', [ 'domain' ]),
	filterUnblock: call('filter_unblock', [ 'domain' ]),
	filterAllow: call('filter_allow', [ 'domain' ]),
	filterUnallow: call('filter_unallow', [ 'domain' ]),
	filterUpdate: call('filter_update'),
	wake: call('wake', [ 'id', 'mac' ]),
	wakes: call('wakes'),
	wakeAdd: call('wake_add', [ 'id', 'time', 'days', 'action' ]),
	computers: call('computers'),
	computerSet: call('computer_set', [ 'device', 'on' ]),
	wakeRemove: call('wake_remove', [ 'id' ]),
	userAdd: call('user_add', [ 'username', 'password', 'person' ]),
	userPassword: call('user_password', [ 'username', 'password' ]),
	userDelete: call('user_delete', [ 'username' ]),
	reserve: call('reserve', [ 'mac', 'ip', 'name', 'replace' ]),
	unreserve: call('unreserve', [ 'mac' ]),

	events: rpc.declare({ object: 'virox.events', method: 'list', params: [ 'limit', 'unread_only' ] }),
	eventsRead: rpc.declare({ object: 'virox.events', method: 'mark_read', params: [ 'id' ] }),
	wifi: rpc.declare({ object: 'virox.wifi', method: 'status' }),
	wifiRescan: rpc.declare({ object: 'virox.wifi', method: 'rescan' }),
	wifiSplit: rpc.declare({ object: 'virox.wifi', method: 'split', params: [ 'on' ] }),
	wifiHidden: rpc.declare({ object: 'virox.wifi', method: 'hidden', params: [ 'band', 'on' ] }),
	wifiBand: rpc.declare({ object: 'virox.wifi', method: 'band', params: [ 'band', 'on' ] }),
	wifiPower: rpc.declare({ object: 'virox.wifi', method: 'power', params: [ 'high' ] }),
	// VPN client (owner 2026-11-20)
	vpn: rpc.declare({ object: 'virox.vpn', method: 'status' }),
	vpnImport: rpc.declare({ object: 'virox.vpn', method: 'import', params: [ 'text', 'username', 'password' ] }),
	vpnSet: rpc.declare({ object: 'virox.vpn', method: 'set', params: [ 'enabled', 'who', 'targets', 'killswitch' ] }),
	vpnRemove: rpc.declare({ object: 'virox.vpn', method: 'remove' }),
	// computers with the Virox program (owner 2026-11-20)
	pcs: rpc.declare({ object: 'virox.pc', method: 'list' }),
	pcCode: rpc.declare({ object: 'virox.pc', method: 'code' }),
	pcCommand: rpc.declare({ object: 'virox.pc', method: 'command', params: [ 'id', 'cmd' ] }),
	pcRename: rpc.declare({ object: 'virox.pc', method: 'rename', params: [ 'id', 'name' ] }),
	pcForget: rpc.declare({ object: 'virox.pc', method: 'forget', params: [ 'id' ] }),
	gaming: rpc.declare({ object: 'virox.gaming', method: 'get' }),
	gamingSet: rpc.declare({ object: 'virox.gaming', method: 'set', params: [ 'enabled' ] }),
	updateStatus: rpc.declare({ object: 'virox.update', method: 'status' }),
	updateCheck: rpc.declare({ object: 'virox.update', method: 'check' }),
	updateInstall: rpc.declare({ object: 'virox.update', method: 'install' }),
	report: rpc.declare({ object: 'virox.support', method: 'report' }),
	backupCreate: rpc.declare({ object: 'virox.support', method: 'backup_create' }),
	backupCheck: rpc.declare({ object: 'virox.support', method: 'backup_check', params: [ 'path' ] }),
	backupRestore: rpc.declare({ object: 'virox.support', method: 'backup_restore', params: [ 'path' ] }),
	backupList: rpc.declare({ object: 'virox.support', method: 'backup_list' }),
	provisionInfo: rpc.declare({ object: 'virox.provision', method: 'info' }),
	setLabelMac: rpc.declare({ object: 'virox.provision', method: 'set_label_mac', params: [ 'mac' ] }),
	setLanguage: rpc.declare({ object: 'virox.setup', method: 'set_language', params: [ 'lang' ] }),
	factoryReset: rpc.declare({ object: 'virox.setup', method: 'factory_reset', params: [ 'confirm' ] }),
	theme: rpc.declare({ object: 'virox.setup', method: 'theme' }),
	setTheme: rpc.declare({ object: 'virox.setup', method: 'set_theme', params: [ 'look', 'mode', 'accent', 'base' ] }),
	// B9 two internet lines (homenet-dualwan; the calls fail when it is not installed)
	lines: rpc.declare({ object: 'virox.lines', method: 'status' }),
	linesEnable: rpc.declare({ object: 'virox.lines', method: 'enable', params: [ 'on' ] }),
	lineSet: rpc.declare({ object: 'virox.lines', method: 'set_line', params: [ 'id', 'name', 'colour', 'package_mb', 'renew_day', 'warn', 'up_kbit', 'down_kbit' ] }),
	lineSpeedtest: rpc.declare({ object: 'virox.lines', method: 'speedtest', params: [ 'id' ] }),
	lineTune: rpc.declare({ object: 'virox.lines', method: 'tune', params: [ 'id' ] }),
	lineTuneState: rpc.declare({ object: 'virox.lines', method: 'tune_state', params: [ 'id' ] }),
	lineRenewed: rpc.declare({ object: 'virox.lines', method: 'renewed', params: [ 'id' ] }),
	lineCalibrate: rpc.declare({ object: 'virox.lines', method: 'calibrate', params: [ 'id', 'remaining_mb' ] }),
	lineAssign: rpc.declare({ object: 'virox.lines', method: 'assign', params: [ 'target', 'line' ] }),
	lineDefault: rpc.declare({ object: 'virox.lines', method: 'set_default', params: [ 'line' ] }),
	linesBoth: rpc.declare({ object: 'virox.lines', method: 'both', params: [ 'target', 'minutes' ] }),
	lineBorrow: rpc.declare({ object: 'virox.lines', method: 'borrow', params: [ 'target', 'minutes', 'mb' ] }),
	linesEnd: rpc.declare({ object: 'virox.lines', method: 'end', params: [ 'target' ] }),
	// B9 Y1 access points (homenet-apctl; the calls fail when it is not installed)
	aps: rpc.declare({ object: 'virox.apctl', method: 'list' }),
	apPairCode: rpc.declare({ object: 'virox.apctl', method: 'pair_code' }),
	apApprove: rpc.declare({ object: 'virox.apctl', method: 'approve', params: [ 'mac' ] }),
	apSet: rpc.declare({ object: 'virox.apctl', method: 'set_ap', params: [ 'id', 'name', 'channel2', 'channel5', 'power' ] }),
	apForget: rpc.declare({ object: 'virox.apctl', method: 'forget', params: [ 'id' ] }),
	apUpdate: rpc.declare({ object: 'virox.apctl', method: 'update', params: [ 'id' ] }),
	apUpdateAll: rpc.declare({ object: 'virox.apctl', method: 'update_all' }),
	apUpdateStatus: rpc.declare({ object: 'virox.apctl', method: 'update_status' }),
	addresses: rpc.declare({ object: 'virox.apctl', method: 'addresses' }),
	addressesSet: rpc.declare({ object: 'virox.apctl', method: 'addresses_set', params: [ 'units_start', 'units_end', 'dev_start', 'dev_end' ] }),
	apJoinOpen: rpc.declare({ object: 'virox.apctl', method: 'join_open', params: [ 'minutes' ] }),
	apJoinClose: rpc.declare({ object: 'virox.apctl', method: 'join_close' }),
	apMesh: rpc.declare({ object: 'virox.apctl', method: 'mesh_set', params: [ 'enabled' ] }),
	apRepeat: rpc.declare({ object: 'virox.apctl', method: 'repeat', params: [ 'band', 'ssid', 'key' ] }),
	apRepeatOff: rpc.declare({ object: 'virox.apctl', method: 'repeat_off' }),
	apScan: rpc.declare({ object: 'virox.apctl', method: 'scan' }),
	wifiWan: rpc.declare({ object: 'virox.apctl', method: 'wifi_wan', params: [ 'band', 'ssid', 'key' ] }),
	wifiWanOff: rpc.declare({ object: 'virox.apctl', method: 'wifi_wan_off' }),
	wifiWanStatus: rpc.declare({ object: 'virox.apctl', method: 'wifi_wan_status' }),
	ports: rpc.declare({ object: 'virox.ports', method: 'list' }),
	portAdd: rpc.declare({ object: 'virox.ports', method: 'add', params: [ 'device', 'proto', 'ext', 'int', 'line', 'name' ] }),
	portSet: rpc.declare({ object: 'virox.ports', method: 'set', params: [ 'id', 'enabled' ] }),
	portRemove: rpc.declare({ object: 'virox.ports', method: 'remove', params: [ 'id' ] }),
	schedule: rpc.declare({ object: 'virox.schedule', method: 'get' }),
	scheduleWifi: rpc.declare({ object: 'virox.schedule', method: 'set_wifi', params: [ 'items' ] }),
	schedulePreview: rpc.declare({ object: 'virox.schedule', method: 'preview_wifi', params: [ 'items' ] }),
	scheduleLeds: rpc.declare({ object: 'virox.schedule', method: 'set_leds', params: [ 'mode', 'off', 'on' ] }),
	scheduleRestart: rpc.declare({ object: 'virox.schedule', method: 'set_restart', params: [ 'enabled', 'every', 'day', 'time' ] }),
	usb: rpc.declare({ object: 'virox.usb', method: 'status' }),
	usbShare: rpc.declare({ object: 'virox.usb', method: 'set_share', params: [ 'enabled', 'name', 'password', 'clear_password' ] }),
	usbPrinter: rpc.declare({ object: 'virox.usb', method: 'set_printer', params: [ 'enabled' ] }),
	usbEject: rpc.declare({ object: 'virox.usb', method: 'eject', params: [ 'disk' ] }),
	apSettings: rpc.declare({ object: 'virox.apctl', method: 'settings', params: [ 'roaming' ] }),
	apJoin: rpc.declare({ object: 'virox.apctl', method: 'join', params: [ 'code' ] }),
	apAgent: rpc.declare({ object: 'virox.apctl', method: 'agent_status' })
};

const MB = 1048576, GB = 1024 * MB;

// ---------------------------------------------------------------- Wi-Fi QR codes and the printed card
// (BUILD-PLAN 15.9 item 2). The QR text of a Wi-Fi network: WIFI:T:<WPA|nopass>;S:<name>;P:<password>;
// [H:true;]; the characters \ ; , : " are escaped with a backslash (the standard of the format).
function wifiQrText(ssid, key, open, hidden) {
	const esc = v => String(v).replace(/[\\;,:"]/g, '\\$&');
	return 'WIFI:T:%s;S:%s;%s%s;'.format(open ? 'nopass' : 'WPA', esc(ssid), open ? '' : 'P:%s;'.format(esc(key)), hidden ? 'H:true;' : '');
}
// a QR code element (LuCI's uqr library, made in the browser: nothing leaves the router)
function wifiQr(ssid, key, open, hidden, label) {
	const box = E('div', { 'class': 'vx-qr', 'data-qr': wifiQrText(ssid, key, open, hidden) });
	L.require('uqr').then(uqr => {
		const svg = uqr.renderSVG(box.getAttribute('data-qr'), { pixelSize: 4, whiteColor: 'white', blackColor: 'black', ecc: 'M' });
		const el = E(svg), w = parseFloat(el.getAttribute('width')), h = parseFloat(el.getAttribute('height'));
		if (!el.getAttribute('viewBox') && w && h) el.setAttribute('viewBox', '0 0 %s %s'.format(w, h));
		el.removeAttribute('width'); el.removeAttribute('height');
		el.setAttribute('role', 'img'); el.setAttribute('aria-label', label || _('QR code of the Wi-Fi network'));
		box.replaceChildren(el);
	}).catch(() => {});
	return box;
}
// the printed card: name, password and QR code, Arabic and English, A4 or a small card; the
// browser prints it (window.print), only the card is on the paper
function printWifiCard(title, ssid, key, open, hidden, size) {
	[ 'vx-print', 'vx-print-style' ].forEach(id => { const o = document.getElementById(id); if (o) o.remove(); });
	const small = size == 'small';
	const qr = wifiQr(ssid, key, open, hidden);
	const card = E('div', { 'id': 'vx-print', 'class': 'vx-print' + (small ? ' small' : '') }, [
		E('h1', {}, [ title ]),
		qr,
		E('p', { 'dir': 'rtl', 'lang': 'ar' }, [ 'اسم الشبكة: ', E('bdi', { 'dir': 'auto' }, [ ssid ]) ]),
		open ? '' : E('p', { 'dir': 'rtl', 'lang': 'ar' }, [ 'كلمة المرور: ', E('bdi', { 'dir': 'ltr' }, [ key ]) ]),
		E('p', { 'dir': 'ltr', 'lang': 'en' }, [ 'Network: ', E('bdi', { 'dir': 'auto' }, [ ssid ]) ]),
		open ? '' : E('p', { 'dir': 'ltr', 'lang': 'en' }, [ 'Password: ', E('bdi', { 'dir': 'ltr' }, [ key ]) ]),
		E('p', { 'class': 'vx-print-hint' }, [ 'وجّه كاميرا الهاتف إلى الرمز للاتصال.', E('br'), 'Point the phone camera at the code to join.' ])
	]);
	const css = '#vx-print{display:none}' +
		'@media print{body *{visibility:hidden!important}#vx-print,#vx-print *{visibility:visible!important}' +
		'#vx-print{display:block;position:fixed;inset-block-start:0;inset-inline-start:0;inline-size:100%;text-align:center;font-family:system-ui,Tahoma,sans-serif;color:#000;background:#fff}' +
		'#vx-print h1{font-size:%s}#vx-print p{font-size:%s;margin:.4em 0}#vx-print .vx-qr svg{inline-size:%s;block-size:%s}' +
		'@page{size:%s;margin:%s}}';
	const st = E('style', { 'id': 'vx-print-style' }, [ small
		? css.format('14pt', '10pt', '38mm', '38mm', '86mm 54mm', '3mm')
		: css.format('28pt', '18pt', '120mm', '120mm', 'A4', '15mm') ]);
	document.head.appendChild(st);
	document.body.appendChild(card);
	// print once the code is drawn
	let tries = 0;
	const go = () => (qr.querySelector('svg') || ++tries > 20) ? window.print() : setTimeout(go, 100);
	go();
}

// updater error code -> sentence (virox.update status.error, virox.apctl update_status.error)
function updateErrorText(code) {
	return ({
		clock_not_synced: _('The router clock is not set yet; updates can be checked once it is.'),
		download_failed: _('The update server could not be reached. Try again later.'),
		bad_signature: _('The update information is not signed by Virox, so it was ignored.'),
		bad_image: _('The downloaded update was damaged and was deleted. Try again.'),
		image_refused: _('The router refused this update file. Nothing was changed.'),
		wrong_board: _('The newest version is not for this router model.'),
		wrong_board_image: _('This update file is for the other router model (GAPM-7200 or GAPD-7200, see the label under the router). Nothing was changed.'),
		no_space: _('Not enough free memory for the update. Restart the router and try again.'),
		no_update_server: _('No update server is set.'),
		no_image: _('The newest version has no update file for the system on this router. Nothing was changed.'),
		not_downloaded: _('The update could not be offered to the access points. Try again.'),
		serve_failed: _('The update could not be offered to the access points. Try again.'),
		prepare_timeout: _('Downloading the update took too long. Try again later.'),
		busy: _('An update is already running.')
	})[code] || errorText(code);
}

// API error code -> sentence (docs/api.md tables; each client translates codes itself)
function errorText(code) {
	return ({
		unknown_target: _('This device or person no longer exists.'),
		limit_required: _('Set a time or an amount.'),
		// internet from Wi-Fi / repeater (virox.apctl wifi_wan, repeat)
		key_needed: _('This network needs a password.'),
		unsupported_security: _('This network uses a kind of security this router cannot join (old WEP or a company login).'),
		channel_not_allowed: _('The other router uses a channel this router may not use.'),
		invalid_key: _('A Wi-Fi password has 8 to 63 letters, digits or signs (no Arabic letters).'),
		key_taken: _('Another person already has this password.'),
		wrong_code: _('This code is wrong or expired. Get a new code on the main router.'),
		no_code: _('There is no valid code on the main router. Get a new code there.'),
		no_main: _('The main router was not found. Check the cable to the main router.'),
		no_answer: _('The main router did not answer.'),
		not_ap: _('This router is not in access point mode.'),
		not_main: _('Only the main router can do this.'),
		unknown_ap: _('This access point is not paired.'),
		unknown_pc: _('This computer is no longer linked.'),
		invalid_file: _('This is not a VPN file for routers (WireGuard .conf or OpenVPN .ovpn).'),
		invalid_endpoint: _('The server address in this file is not valid.'),
		invalid_vpn_key: _('The keys in this file are not valid.'),
		invalid_address: _('This file has no IPv4 address for the router.'),
		no_openvpn: _('The OpenVPN program is missing on this router; use the WireGuard file of the service.'),
		invalid_login: _('The user name or password is too long or has a line break.'),
		no_vpn: _('Add the VPN file first.'),
		not_router: _('This router is an access point: this belongs on the main router.'),
		no_targets: _('Choose at least one person or device.'),
		offline: _('The computer is off, asleep or not connected now.'),
		invalid_command: _('Unknown command.'),
		invalid_channel: _('This channel is not allowed.'),
		invalid_proto: _('Choose TCP, UDP or both.'),
		invalid_schedule: _('A time needs at least one day, an off-time and a different on-time.'),
		invalid_share_name: _('The share name has 1 to 15 English letters, digits, - or _.'),
		invalid_disk: _('This disk is not plugged in any more.'),
		password_failed: _('The password could not be saved. Try again.'),
		invalid_port: _('A port is a number from 1 to 65535, or a range such as 8000-8010 (at most 1000 ports). An inside port goes with one outside port only.'),
		port_taken: _('This outside port is already open for another device.'),
		port_router: _('The router itself uses this port.'),
		too_many: _('There are too many rules. Remove one first.'),
		device_offline: _('The device must be connected now, so the router can keep its address.'),
		unknown_rule: _('This rule no longer exists.'),
		invalid_name: _('The name is too long or has a sign that is not allowed.'),
		invalid_power: _('Unknown power level.'),
		invalid_ssid: _('A network name has 1 to 32 characters.'),
		invalid_band: _('Choose 2.4 GHz or 5 GHz.'),
		units_full: _('The range of the Virox units is full. Make it larger in Settings, Addresses, then add the access point again.'),
		invalid_range: _('Each range is from 2 to 254, and its start is not after its end.'),
		range_overlap: _('The two ranges must not overlap.'),
		range_router: _('The address of this router cannot be inside a range.'),
		range_small: _('The devices range needs at least 10 addresses.'),
		range_ap_outside: _('An access point has a fixed address outside the new units range. Keep it inside, or forget that access point first.'),
		range_reserved: _('A device has a fixed address inside the new units range. Change that device first (Devices).'),
		no_lan: _('The address of this router could not be read.'),
		invalid_guest: _('Type a network name and a password of at least 8 characters.'),
		line_down: _('This line is down now.'),
		too_slow: _('The measured speed is too low to adjust. Try again later.'),
		no_dns: _('The test address could not be found. Check the internet.'),
		not_enabled: _('The second line is off.'),
		invalid_down_kbit: _('This speed is not allowed.'),
		invalid_limit: _('This time or amount is not allowed.'),
		invalid_line: _('Unknown line.'),
		no_package: _('Set the package size of this line first.'),
		invalid_remaining: _('Type the remaining amount as a number.'),
		invalid_colour: _('Unknown colour.'),
		invalid_package_mb: _('This package size is not allowed.'),
		invalid_renew_day: _('The renewal day is a day of the month, 1 to 31.'),
		invalid_up_kbit: _('This speed is not allowed.'),
		unknown_device: _('This device no longer exists (it may have been merged or removed).'),
		unknown_person: _('This person no longer exists.'),
		name_empty: _('Type a name.'),
		name_too_long: _('The name is too long: at most 40 characters.'),
		name_taken: _('There is already a person with this name.'),
		same_device: _('This is the same device.'),
		invalid_minutes: _('This duration is not allowed.'),
		not_held: _('This device is not waiting for approval.'),
		invalid_policy: _('Unknown choice.'),
		write_refused: _('An error was stopped before it could delete data. Nothing changed.'),
		no_previous: _('There is no earlier version to go back to.'),
		invalid_days: _('Choose at least one day.'),
		invalid_action: _('Choose switch on, shut down or sleep.'),
		no_program: _('Shut down and sleep need the Virox program on that computer: add it from the computer itself first.'),
		invalid_time: _('Write the time like 21:30.'),
		same_time: _('Start and end cannot be the same time.'),
		too_many: _('The list is full.'),
		unknown_schedule: _('This schedule no longer exists.'),
		invalid_package: _('Type the package size in GB (0 to 100000).'),
		invalid_renew_day: _('The renewal day is 1 to 31.'),
		invalid_warn: _('The warning is 50 % to 100 %.'),
		invalid_active_kb: _('Use 1 to 10000 KB.'),
		invalid_speed: _('Speed is 0.1 to 1000 Mbit/s, or 0 for no limit.'),
		invalid_limit: _('Type the limit in GB.'),
		invalid_remaining: _('The remaining amount is larger than the package.'),
		no_package: _('Set the package size first.'),
		clock_not_synced: _('The router clock is not set yet. Try again in a few minutes.'),
		invalid_value: _('This value is not allowed.'),
		invalid_domain: _('Type a site name like example.com'),
		unknown_site: _('Unknown site.'),
		nothing_to_lock: _('Choose a site or type one.'),
		unknown_lock: _('This lock has already ended.'),
		invalid_size: _('Unknown list size.'),
		send_failed: _('The start signal could not be sent.'),
		invalid_mac: _('This device number (MAC) is not valid.'),
		unknown_mac: _('This device number (MAC) is not known.'),
		invalid_username: _('Use 3 to 16 small English letters, digits or _, starting with a letter.'),
		invalid_password: _('Use 8 to 64 characters for the password.'),
		user_exists: _('This user name is taken.'),
		unknown_user: _('This user no longer exists.'),
		passwd_failed: _('The password could not be saved. Try again.'),
		not_installed: _('This part is not installed on this router.'),
		invalid_ip: _('Type a valid address.'),
		ip_outside_lan: _('This address is not in the home network.'),
		ip_router: _('This is the address of the router itself.'),
		ip_network: _('This address is reserved for the network.'),
		ip_reserved: _('This address is reserved for another device.'),
		mac_reserved: _('This device already has a fixed address.'),
		ip_in_use: _('Another device uses this address now.'),
		dhcp_restored: _('This setting stopped address handout, so the last working settings were put back.'),
		dhcp_down: _('Address handout is stopped and there are no working settings to go back to.'),
		busy: _('The router is already busy with this. Wait a moment.'),
		not_a_backup: _('This file is not a Virox settings file.'),
		unsafe_backup: _('This file is damaged or not safe to use.'),
		no_file: _('Choose a file first.'),
		invalid_path: _('This file cannot be used.'),
		clock_not_synced_update: _('The router clock is not set yet; updates can be checked once it is.'),
		too_soon: _('You asked a moment ago. Wait a few minutes before asking again.'),
		invalid_hours: _('Choose 1 to 24 hours, or never.'),
		invalid_day: _('Unknown day.'),
		not_a_user: _('This page is for family logins.'),
		confirm_needed: _('Confirm first.'),
		update_running: _('An update is being installed now. Try again after it.')
	})[code] || _('Something went wrong. Try again.');
}

function ltr(text) {
	return E('bdi', { 'dir': 'ltr' }, [ String(text) ]);
}

// bytes -> "850 KB", "12.3 MB", "4.27 GB" (GB = 1024 MB)
function bytes(n) {
	n = +n || 0;
	if (n < MB) return '%d KB'.format(Math.round(n / 1024));
	if (n < GB) return '%.1f MB'.format(n / MB);
	return '%.2f GB'.format(n / GB);
}
function gbFromMb(mb) { return Math.round((+mb || 0) / 1024 * 100) / 100; }
function mbFromGb(gb) { return Math.round((+gb || 0) * 1024); }

// kbit/s -> "512 kbit/s" or "4 Mbit/s"
function speed(kbit) {
	kbit = +kbit || 0;
	return kbit < 1000 ? '%d kbit/s'.format(kbit) : '%s Mbit/s'.format(String(Math.round(kbit / 100) / 10));
}

function minutesText(m) {
	m = +m || 0;
	// the Arabic plural forms (15.5 item 2): the shared formatter
	return fmt.minutesText(m);
}

function timeText(epoch) {
	const d = new Date(epoch * 1000);
	return ltr('%02d:%02d'.format(d.getHours(), d.getMinutes()));
}

// B9: the name of a line as the owner set it, or "Line 1" / "Line 2"
function lineName(l) {
	return (l && l.name) ? l.name : _('Line %d').format(l ? l.id : 1);
}

// B9: the line a device uses now, from virox.lines status plan (by MAC, an online one first):
// { text, colour, warn } or null when there is one line only (owner 2026-11-23)
function deviceLine(ls, d) {
	if (!ls || !ls.enabled || !ls.plan) return null;
	const macs = (d.macs || []).slice().sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
	let r = null;
	for (const m of macs) { r = ls.plan[(m.mac || '').toLowerCase()]; if (r) break; }
	if (!r) return null;
	if (r == 'both') return { text: _('Both lines'), colour: null, warn: false };
	if (r == 'stop') return { text: _('Package used up'), colour: null, warn: true };
	const l = (ls.lines || [])[+r.slice(1) - 1];
	return { text: lineName(l || { id: +r.slice(1) }), colour: l && l.colour, warn: false };
}

// B9: what a device or person does with the lines now (assignments of virox.lines status)
function lineState(ls, ids) {
	const a = ((ls && ls.assignments) || []).filter(x => ids.indexOf(x.target) >= 0 || x.target == 'all');
	return {
		line: (a.filter(x => x.kind == 'line' && x.target == ids[0])[0] || {}).line || 0,
		both: a.filter(x => x.kind == 'both')[0] || null,
		borrow: a.filter(x => x.kind == 'borrow' && x.target != 'all')[0] || null
	};
}

function card(title, body, extra) {
	return E('section', Object.assign({ 'class': 'vx-card' }, extra || {}), [
		title ? E('h3', { 'class': 'vx-card-title' }, [ title ]) : '',
		...(Array.isArray(body) ? body : [ body ])
	]);
}

function loading() {
	return E('p', { 'class': 'vx-state', 'role': 'status' }, [ E('span', { 'class': 'spinning' }, [ _('Loading…') ]) ]);
}
function empty(text) {
	return E('p', { 'class': 'vx-state vx-empty' }, [ text ]);
}
function failed(err) {
	// "Try again" reads the page's data again in place (guideline 6.13); the whole page only when
	// there is no page to redraw
	return E('div', { 'class': 'vx-state vx-error-box', 'role': 'alert' }, [
		E('p', {}, [ _('The router did not answer. Check that you are still connected to it, then reload the page.') ]),
		E('button', { 'class': 'btn cbi-button', 'click': () => curView ? redraw() : location.reload() }, [ _('Reload') ])
	]);
}

// a status word with a shape, never colour alone (section 10.11)
function badge(kind, text) {
	return E('span', { 'class': 'vx-badge vx-badge-' + kind }, [ text ]);
}

// one small message at the bottom of the screen, replaced by the next one; it never stacks and
// never moves the page (owner, 2026-11-19: the LuCI notices piled up at the top and scrolled)
function notify(text, kind) {
	let box = document.querySelector('.vx-toast');
	if (!box) {
		box = E('div', { 'class': 'vx-toast', 'role': 'status', 'aria-live': 'polite' });
		document.body.appendChild(box);
	}
	box.textContent = typeof text == 'string' ? text : '';
	if (typeof text != 'string') box.appendChild(text);
	box.className = 'vx-toast show' + (kind == 'danger' ? ' bad' : (kind == 'warning' ? ' warn' : (kind == 'info' ? ' info' : '')));
	// an error is read out at once (role alert); 4 s for a success, 8 s for an error (guideline 6.8)
	box.setAttribute('role', kind == 'danger' ? 'alert' : 'status');
	window.clearTimeout(box._t);
	box._t = window.setTimeout(() => box.classList.remove('show'), kind == 'danger' ? 8000 : 4000);
}

// the button the user just pressed, so act() can show it as busy (guideline 6.1 and audit item 15:
// no pending state let a double tap send the request twice). Safari does not focus a pressed button,
// so the click itself is remembered.
let lastPress = null;
document.addEventListener('click', ev => {
	const b = ev.target && ev.target.closest ? ev.target.closest('button, .btn') : null;
	lastPress = b ? { el: b, at: Date.now() } : null;
}, true);
function busy(el) {
	if (!el || el.getAttribute('aria-busy') == 'true') return () => {};
	const w = el.offsetWidth, label = el.textContent, wasDisabled = el.disabled;
	el.setAttribute('aria-busy', 'true');
	el.disabled = true;
	// the width stays, the words say what happens (only on a plain text button)
	if (w && el.children.length == 0) { el.style.minInlineSize = w + 'px'; el.textContent = _('Saving…'); }
	return () => {
		if (!el.isConnected) return;
		el.removeAttribute('aria-busy');
		el.disabled = wasDisabled;
		if (el.style.minInlineSize) { el.textContent = label; el.style.minInlineSize = ''; }
	};
}

// a sheet or dialog closes when the dark area around it is tapped
document.addEventListener('click', ev => { if (ev.target && ev.target.id == 'modal_overlay') ui.hideModal(); });

// run an API write; show the translated error, or the success text; resolve to the result
function act(promise, okText) {
	const done = busy(lastPress && Date.now() - lastPress.at < 1000 ? lastPress.el : null);
	lastPress = null;
	return Promise.resolve(promise).then(r => {
		done();
		if (r && r.result === false) { notify(errorText(r.error), 'danger'); return r; }
		if (okText) notify(okText, 'success');
		// the page shows the result by itself (no F5): see refresh()
		refresh();
		return r;
	}).catch(() => { done(); notify(_('The router did not answer.'), 'danger'); return { result: false }; });
}

// ---------------------------------------------------------------- the page after an action
// Owner 2026-11-22: "after I do something on a page I must press F5 to see that it was done".
// Every page registers itself (hn.page(this) in its render); after a successful action the page
// reads its data again and draws it in place: its own reload() when it has one, else load() and
// render() again. The scroll position and the open tab stay. A later refresh(ms) (an action whose
// effect takes a few seconds, e.g. Wi-Fi restarting) replaces an earlier one, so one action draws
// once. Never while a sheet (modal) is open: tried again when it is closed.
let curView = null, viewPolls = [], refreshTimer = null, refreshing = false;
function page(v) {
	curView = v;
	// pages without their own poll get their data again every 20 s while they are shown (owner
	// 2026-11-24: "updates without refresh"); never while a window is open, a field has the focus or
	// holds an unsaved change (redraw would lose it)
	clearInterval(autoTimer);
	snapLater();
	autoTimer = setInterval(() => {
		if (document.hidden || refreshing || curView !== v || viewPolls.length) return;
		const vp = document.getElementById('view');
		if (!vp || document.body.classList.contains('modal-overlay-active')) return;
		const a = document.activeElement;
		if (a && vp.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
		// fields as drawn (a snapshot just after drawing: switches set by code after drawing are not
		// changes); anything different is the owner's unsaved work
		if (fieldsSig(vp) == fieldsSnap) Promise.resolve(redraw()).then(snapLater);
	}, 20000);
}
function fieldsSig(vp) {
	return [...vp.querySelectorAll('input, select, textarea')].map(f =>
		f.type == 'checkbox' || f.type == 'radio' ? (f.checked ? '1' : '0') : f.value).join('\u0001');
}
let fieldsSnap = null;
function snapLater() {
	setTimeout(() => { const vp = document.getElementById('view'); fieldsSnap = vp ? fieldsSig(vp) : null; }, 1500);
}
let autoTimer = null;
function refresh(ms) {
	clearTimeout(refreshTimer);
	refreshTimer = setTimeout(redraw, ms == null ? 400 : ms);
}
function redraw() {
	const v = curView, vp = document.getElementById('view');
	if (!v || !vp || refreshing) return;
	if (document.body.classList.contains('modal-overlay-active')) return refresh(1500);
	const y = window.scrollY;
	refreshing = true;
	const done = () => { refreshing = false; window.scrollTo(0, y); };
	if (typeof v.reload == 'function')
		return Promise.resolve(v.reload()).then(done, done);
	return Promise.resolve(v.load()).then(d => {
		// the polls of the old drawing stop; render() adds its own again
		viewPolls.forEach(f => L.Poll.remove(f));
		viewPolls = [];
		return v.render(d);
	}).then(n => { if (n) dom.content(vp, n); }).then(done, done);
}

function askConfirm(title, text, yesLabel) {
	return new Promise(resolve => {
		ui.showModal(title, [
			E('p', {}, [ text ]),
			E('div', { 'class': 'right vx-actions' }, [
				E('button', { 'class': 'btn cbi-button', 'click': () => { ui.hideModal(); resolve(false); } }, [ _('Cancel') ]),
				E('button', { 'class': 'btn cbi-button-negative', 'click': () => { ui.hideModal(); resolve(true); } }, [ yesLabel || _('Yes') ])
			])
		]);
	});
}

// name of a device or person id, for lists of controls
function targetName(id, devices, people) {
	if (!id) return '';
	if (id[0] == 'p') {
		const p = (people || []).filter(x => x.id == id)[0];
		return p ? _('%s (all devices)').format(p.name) : id;
	}
	const d = (devices || []).filter(x => x.id == id)[0];
	return d ? deviceName(d) : id;
}

// this unit has no internet line of its own (an access point). virox.apctl list says "router" for
// a lead access point (it manages the others), so the lead counts too (2.230, 2026-11-22)
function isAccessPoint(ap) {
	return !!(ap && (ap.mode == 'ap' || ap.lead));
}

// a device flagged as a router (behind_router: forwarded packets seen from it) whose name says it is a
// computer: a PC sharing its internet with a system inside it (WSL, Hyper-V, Docker, a hotspot), not a
// router in the house (owner 2026-11-23: "Ahmed-pc" showed as a router). By the name only: a maker
// like ASUS also makes routers.
const COMPUTER_NAME = /desktop|\bpc\b|imac|mac-?mini|laptop|macbook|notebook|windows|thinkpad|كمبيوتر|ديسكتوب|لابتوب/;
function isComputer(d) {
	return COMPUTER_NAME.test([ d.name, ...(d.macs || []).map(m => m.hostname) ].filter(x => x).join(' ').toLowerCase());
}

function deviceName(d) {
	if (d.name) return d.name;
	const h = (d.macs || []).map(m => m.hostname).filter(x => x)[0];
	if (h) return h;
	// no name at all: the maker from the MAC, or "a phone with a private address" (owner 2026-11-22)
	if (d.maker) return _('%s device').format(d.maker);
	if (d.private_mac) return _('Phone or tablet (private address)');
	return _('Unnamed device');
}

// <select> of devices and people (people first: a control on a person covers all its devices)
function targetSelect(id, devices, people, value) {
	const opts = [ E('option', { 'value': '' }, [ _('Choose…') ]) ];
	(people || []).forEach(p => opts.push(E('option', { 'value': p.id, 'selected': value == p.id ? '' : null }, [ _('%s (all devices)').format(p.name) ])));
	(devices || []).forEach(d => opts.push(E('option', { 'value': d.id, 'selected': value == d.id ? '' : null }, [ deviceName(d) ])));
	return E('select', { 'id': id }, opts);
}

// one settings row (shadcn-style, owner 2026-11-19): the label and its hint at the start, the
// control at the end with a fixed width; rows are divided by a thin line. On a phone the control
// goes under the label.
function field(id, label, input, hint) {
	return E('div', { 'class': 'vx-field vx-row' }, [
		E('div', { 'class': 'vx-row-text' }, [
			E('label', { 'for': id }, [ label ]),
			hint ? E('span', { 'class': 'vx-hint' }, [ hint ]) : ''
		]),
		E('div', { 'class': 'vx-row-ctl' }, [ input ])
	]);
}

// a row whose control is an action (a button) or a value, without a label element
function row(title, hint, control) {
	return E('div', { 'class': 'vx-row' }, [
		E('div', { 'class': 'vx-row-text' }, [ E('strong', {}, [ title ]), hint ? E('span', { 'class': 'vx-hint' }, [ hint ]) : '' ]),
		E('div', { 'class': 'vx-row-ctl' }, Array.isArray(control) ? control : [ control ])
	]);
}

// a section card: header (title, one line of description, optional badge), rows, footer (actions)
function section(title, desc, body, footer, extra) {
	return E('section', Object.assign({ 'class': 'vx-card vx-sec' }, extra || {}), [
		E('div', { 'class': 'vx-sec-head' }, [
			E('div', {}, [ E('h3', { 'class': 'vx-card-title' }, [ title ]), desc ? E('p', { 'class': 'vx-hint' }, [ desc ]) : '' ])
		]),
		E('div', { 'class': 'vx-sec-body' }, Array.isArray(body) ? body : [ body ]),
		footer ? E('div', { 'class': 'vx-sec-foot' }, Array.isArray(footer) ? footer : [ footer ]) : ''
	]);
}

// a short choice as a row of buttons (shadcn toggle group): { el, value() }
function seg(id, options, value) {
	let cur = String(value);
	const el = E('div', { 'class': 'vx-seg', 'role': 'radiogroup', 'id': id });
	const btns = options.map(o => E('button', { 'type': 'button', 'role': 'radio', 'aria-checked': String(String(o[0]) == cur),
		'click': () => { cur = String(o[0]); btns.forEach((b, i) => b.setAttribute('aria-checked', String(String(options[i][0]) == cur))); } }, [ o[1] ]));
	btns.forEach(b => el.appendChild(b));
	return { el, value: () => cur };
}

// tabs (shadcn): a muted bar of words, the chosen one raised; the panes are swapped in place
function tabs(defs, first) {
	const bar = E('div', { 'class': 'vx-seg vx-tabbar', 'role': 'tablist' });
	const panes = E('div', { 'class': 'vx-tabpanes' });
	const show = (id, clicked) => {
		defs.forEach((d, i) => { bar.children[i].setAttribute('aria-selected', String(d.id == id)); d.pane.hidden = d.id != id; });
		// the open tab goes into the address (#<tab>), which the pages read as the part to open: a
		// redraw after an action, F5 or a shared link stay on it
		if (clicked) history.replaceState(history.state, '', location.pathname + location.search + '#' + id);
	};
	defs.forEach(d => {
		bar.appendChild(E('button', { 'type': 'button', 'role': 'tab', 'click': () => show(d.id, true) }, [ d.label ]));
		panes.appendChild(d.pane);
	});
	show(first || (defs[0] && defs[0].id));
	return E('div', { 'class': 'vx-tabset' }, [ bar, panes ]);
}

// status refresh no faster than every 5 seconds (section 10.9)
// Not while the tab is hidden; when it shows again, at once (guideline 14, Polling).
function poll(fn, seconds) {
	const f = () => document.hidden ? Promise.resolve() : fn();
	viewPolls.push(f);
	L.Poll.add(f, Math.max(5, seconds || 10));
}
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) viewPolls.forEach(f => Promise.resolve(f()).catch(() => {}));
});

const DAY_NAMES = () => [ _('Sun'), _('Mon'), _('Tue'), _('Wed'), _('Thu'), _('Fri'), _('Sat') ];

return baseclass.extend({
	page, refresh,
	api, MB, GB, errorText, updateErrorText, wifiQrText, wifiQr, printWifiCard, ltr, bytes, lineName, lineState, deviceLine, gbFromMb, mbFromGb, speed, minutesText, timeText, card,
	loading, empty, failed, badge, notify, act, askConfirm, targetName, deviceName, isComputer, targetSelect, isAccessPoint,
	field, row, section, seg, tabs, poll, DAY_NAMES
});
