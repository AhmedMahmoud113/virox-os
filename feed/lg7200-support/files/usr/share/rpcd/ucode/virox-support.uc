// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, support (BUILD-PLAN section 12 items 7-9, P7). docs/api.md "virox.support".
//
//   virox.support  report                     the help report as text                       (admin)
//                  backup_create              write /tmp/virox-backup.tar.gz (cgi-download)  (admin)
//                  backup_check {path}        version and date of a backup file              (admin)
//                  backup_restore {path}      restore and restart                            (admin)
//                  backup_list                nightly backups on a USB stick (P7) and the    (admin)
//                                             copies made before an update (kind usb|update)
// The scripts in /usr/libexec/lg7200 never call a virox.* object (rpcd cannot answer itself).
'use strict';

import { readfile, popen, stat } from 'fs';

const LIB = '/usr/libexec/lg7200';
const RESTORE_UPLOAD = '/tmp/virox-restore.tar.gz';

function shq(s) { return "'" + replace(`${s ?? ''}`, "'", "'\\''") + "'"; }
function run(cmd) {
	const fd = popen(cmd + ' 2>/dev/null');
	if (!fd) return '';
	const out = fd.read('all'); fd.close();
	return trim(out ?? '');
}
function okerr(out) {
	const m = match(out, /^OK ?(.*)$/);
	if (m) return { result: true, value: m[1] };
	const e = match(out, /^ERR ([a-z_]+)/);
	return { result: false, error: e ? e[1] : 'failed' };
}
function kv(text) {
	let o = {};
	for (let l in split(text ?? '', '\n')) { const i = index(l, '='); if (i > 0) o[substr(l, 0, i)] = substr(l, i + 1); }
	return o;
}
// a restore reads only the uploaded file, a nightly backup on a USB stick, or the copy made on the
// router before an update (owner 2026-11-22)
function allowed_path(p) {
	if (p == RESTORE_UPLOAD) return true;
	if (type(p) == 'string' && match(p, /^\/etc\/lg7200\/pre-update\/virox-pre-update-[0-9]{8}-[0-9]{4}-[A-Za-z0-9.-]+-to-[A-Za-z0-9.-]+\.tar\.gz$/) != null) return true;
	return type(p) == 'string' && match(p, /^\/mnt\/[A-Za-z0-9._-]+\/virox-backups\/virox-backup-[0-9-]+\.tar\.gz$/) != null;
}

const support = {
	report: {
		call: function() {
			const f = run(`${LIB}/help-report`);
			let text = readfile(f || '/nonexistent') ?? null;
			if (text == null) return { result: false, error: 'failed' };
			if (length(text) > 524288) text = substr(text, 0, 524288) + '\n[cut: the report was longer than 512 KB]\n';
			return { result: true, name: `virox-help-${run('date +%Y%m%d-%H%M')}.txt`, text };
		}
	},
	backup_create: {
		call: function() {
			const r = okerr(run(`${LIB}/backup create /tmp/virox-backup.tar.gz`));
			if (!r.result) return r;
			const p = split(r.value, ' ');
			return { result: true, path: p[0], size: +p[1], name: `virox-settings-${run('date +%Y%m%d')}.tar.gz` };
		}
	},
	backup_check: {
		args: { path: '' },
		call: function(req) {
			if (!allowed_path(req.args.path)) return { result: false, error: 'invalid_path' };
			const r = okerr(run(`${LIB}/backup check ${shq(req.args.path)}`));
			if (!r.result) return r;
			const p = split(r.value, ' ');
			return { result: true, version: p[0], date: join(' ', slice(p, 1)) };
		}
	},
	backup_restore: {
		args: { path: '' },
		call: function(req) {
			if (!allowed_path(req.args.path)) return { result: false, error: 'invalid_path' };
			const r = okerr(run(`${LIB}/backup restore ${shq(req.args.path)}`));
			return r.result ? { result: true, restarting: true } : r;
		}
	},
	backup_list: {
		call: function() {
			let out = [];
			for (let l in split(run(`${LIB}/backup list`), '\n')) {
				const p = split(l, ' ');
				// kind: usb (nightly) or update (made before an update; from = the version it was made on)
				if (length(p) >= 3) push(out, { path: p[0], size: +p[1], date: p[2], kind: p[3] ?? 'usb', from: p[4] ?? null });
			}
			return { backups: out };
		}
	}
};

return { 'virox.support': support };
