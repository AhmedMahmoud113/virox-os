// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, USB disk and printer (BUILD-PLAN 15.4 item 5). The work is done by
// /usr/libexec/lg7200/usb. Never reachable from the WAN or the guest network (LAN only).
//   status                          disks (device, label, file system, size and free MB, share name),
//                                   sharing (on, name, password set), printer (on, present, name,
//                                   address and port)                                              (admin)
//   set_share {enabled, name, password, clear_password}   name: letters, digits, - and _ (1-15);
//                                   password 8-64 characters (kept only in ksmbd's user file)     (admin)
//   set_printer {enabled}                                                                           (admin)
//   eject {disk}                    "sda": unmount and power down (safe remove)                    (admin)
'use strict';

import { readfile, popen } from 'fs';
import { cursor } from 'uci';

const USB = '/usr/libexec/lg7200/usb';
function sh(cmd) { const fd = popen(cmd); if (!fd) return ''; const o = fd.read('all'); fd.close(); return trim(o ?? ''); }
function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }
function okerr(out) {
	const e = match(out, /ERR ([a-z_]+)/);
	return e ? { result: false, error: e[1] } : { result: true };
}

function disks() {
	const info = {}, out = [], names = {};
	// block info: /dev/sda1: UUID="..." LABEL="..." TYPE="vfat"
	for (let l in split(sh('block info 2>/dev/null'), '\n')) {
		const m = match(l, /^(\/dev\/[^:]+):(.*)$/);
		if (!m) continue;
		const lab = match(m[2], /LABEL="([^"]*)"/), ty = match(m[2], /TYPE="([^"]*)"/);
		info[m[1]] = { label: lab ? lab[1] : '', fs: ty ? ty[1] : '' };
	}
	for (let l in split(sh('cat /etc/config/ksmbd 2>/dev/null'), '\n')) {
		const p = match(l, /option path '([^']*)'/);
		if (p) names[p[1]] = true;
	}
	let i = 0;
	for (let l in split(readfile('/proc/mounts') ?? '', '\n')) {
		const f = split(l, ' ');
		if (length(f) < 3 || !match(f[1], /^\/mnt\/[^\/]+$/) || !match(f[0], /^\/dev\//)) continue;
		const df = match(sh(`df -k ${shq(f[1])} 2>/dev/null | tail -n 1`), /\s([0-9]+)\s+([0-9]+)\s+([0-9]+)\s/);
		const dev = f[0], disk = match(dev, /^\/dev\/(sd[a-z])/);
		push(out, { dev: dev, disk: disk ? disk[1] : null, mount: f[1], label: info[dev]?.label ?? '', fs: info[dev]?.fs || f[2],
		            size_mb: df ? int(+df[1] / 1024) : null, free_mb: df ? int(+df[3] / 1024) : null, shared: !!names[f[1]] });
		i++;
	}
	return out;
}
function share_name(c) {
	let n = c.get('lg7200', 'usb', 'name') ?? '';
	if (!n) c.foreach('system', 'system', s => { if (!n) n = s.hostname ?? ''; });
	return substr(replace(n || 'Virox', /[^A-Za-z0-9_-]/g, '-'), 0, 15);
}
function lan_ip(c) {
	let a = c.get('network', 'lan', 'ipaddr'); if (type(a) == 'array') a = a[0];
	return split(a ?? '', '/')[0];
}

const usb = {
	status: {
		call: function() {
			const c = cursor();
			const present = !!readfile('/sys/class/usbmisc/lp0/dev') || system('[ -e /dev/usb/lp0 ]') == 0;
			return {
				disks: disks(),
				share: { enabled: c.get('lg7200', 'usb', 'share') == '1', name: share_name(c), password_set: c.get('lg7200', 'usb', 'password_set') == '1',
				         installed: system('[ -x /etc/init.d/ksmbd ]') == 0 },
				printer: { enabled: c.get('lg7200', 'usb', 'printer') == '1', present: present, name: present ? sh(`${USB} printer-name`) : '',
				           address: lan_ip(c), port: 9100, installed: system('[ -x /etc/init.d/p910nd ]') == 0 },
				guest_blocked: true
			};
		}
	},

	set_share: {
		args: { enabled: false, name: '', password: '', clear_password: false },
		call: function(req) {
			const a = req.args, c = cursor();
			if (a.name != null && a.name != '' && !match(`${a.name}`, /^[A-Za-z0-9_-]{1,15}$/)) return { result: false, error: 'invalid_share_name' };
			const pw = `${a.password ?? ''}`;
			if (pw != '' && (length(pw) < 8 || length(pw) > 64 || match(pw, /[\n\r'"\\]/))) return { result: false, error: 'invalid_password' };
			if (c.get('lg7200', 'usb') == null) c.set('lg7200', 'usb', 'usb');
			c.set('lg7200', 'usb', 'share', a.enabled ? '1' : '0');
			if (a.name) c.set('lg7200', 'usb', 'name', a.name);
			c.commit('lg7200');
			if (pw != '') { const r = okerr(sh(`${USB} password ${shq(pw)} 2>&1`)); if (!r.result) return r; }
			else if (a.clear_password) { const r = okerr(sh(`${USB} password '' 2>&1`)); if (!r.result) return r; }
			return okerr(sh(`${USB} apply 2>&1`));
		}
	},

	set_printer: {
		args: { enabled: false },
		call: function(req) {
			const c = cursor();
			if (c.get('lg7200', 'usb') == null) c.set('lg7200', 'usb', 'usb');
			c.set('lg7200', 'usb', 'printer', req.args.enabled ? '1' : '0');
			c.commit('lg7200');
			return okerr(sh(`${USB} apply 2>&1`));
		}
	},

	eject: {
		args: { disk: '' },
		call: function(req) {
			if (!match(`${req.args.disk ?? ''}`, /^sd[a-z]$/)) return { result: false, error: 'invalid_disk' };
			return okerr(sh(`${USB} eject ${shq(req.args.disk)} 2>&1`));
		}
	}
};

return { 'virox.usb': usb };
