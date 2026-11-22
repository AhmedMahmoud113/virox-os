// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, VPN client (owner 2026-11-20): the work is done by /usr/libexec/homenet/vpn.
//   status                                   on, type, server, connected, bytes, who, kill switch   (admin)
//   import {text, username, password}        the file of the VPN service: WireGuard .conf or OpenVPN
//                                            .ovpn (+ its user name and password)                    (admin)
//   set {enabled, who, targets, killswitch}  who: "all" | "chosen" (targets: device / person ids)   (admin)
//   remove                                   the VPN and its file gone                               (admin)

'use strict';

import { writefile, unlink, chmod, popen } from 'fs';
import { cursor } from 'uci';

const VPN = '/usr/libexec/homenet/vpn';
function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }
function sh(cmd) { const fd = popen(cmd); if (!fd) return ''; const o = fd.read('all'); fd.close(); return trim(o ?? ''); }
function plain(out) {
	const m = match(out, /ERR ([a-z_]+)/);
	return m ? { result: false, error: m[1] } : { result: true };
}

const vpn = {
	status: {
		call: function() { return json(sh(`${VPN} status`) || '{}') ?? {}; }
	},

	import: {
		args: { text: '', username: '', password: '' },
		call: function(req) {
			const a = req.args, text = `${a.text ?? ''}`;
			if (!length(text) || length(text) > 65536) return { result: false, error: 'invalid_file' };
			const user = `${a.username ?? ''}`, pass = `${a.password ?? ''}`;
			if (length(user) > 128 || length(pass) > 128 || match(user + pass, /[\n\r]/)) return { result: false, error: 'invalid_login' };
			const f = '/tmp/.vpn-import';
			writefile(f, ''); chmod(f, 0600); writefile(f, text);
			const out = sh(`${VPN} import ${f} ${shq(user)} ${shq(pass)} 2>&1`);
			unlink(f);
			return plain(out);
		}
	},

	set: {
		args: { enabled: false, who: '', targets: [], killswitch: true },
		call: function(req) {
			const a = req.args, c = cursor();
			// an access point only bridges the house: the VPN belongs on the main router
			if (a.enabled && c.get('lg7200', 'state', 'mode') == 'ap') return { result: false, error: 'not_router' };
			if (!c.get('homenet', 'vpn', 'type')) return { result: false, error: 'no_vpn' };
			if (!(a.who in [ 'all', 'chosen' ])) return { result: false, error: 'invalid_who' };
			const t = filter(type(a.targets) == 'array' ? a.targets : [], x => match(`${x}`, /^[dp][0-9]+$/));
			if (a.who == 'chosen' && a.enabled && !length(t)) return { result: false, error: 'no_targets' };
			c.set('homenet', 'vpn', 'enabled', a.enabled ? '1' : '0');
			c.set('homenet', 'vpn', 'who', a.who);
			if (length(t)) c.set('homenet', 'vpn', 'targets', t); else c.delete('homenet', 'vpn', 'targets');
			c.set('homenet', 'vpn', 'killswitch', a.killswitch === false ? '0' : '1');
			c.commit('homenet');
			return plain(sh(`${VPN} apply 2>&1`));
		}
	},

	remove: {
		call: function() { return plain(sh(`${VPN} remove 2>&1`)); }
	}
};

return { 'virox.vpn': vpn };
