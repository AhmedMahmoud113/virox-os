// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Virox API, updater (BUILD-PLAN B8.1, section 12.5). docs/api.md "virox.update".
//
//   virox.update  status             current version, latest verified, available, changelog, state (admin)
//                 check              ask the update server now (in the background)                 (admin)
//                 install            check + download + verify + sysupgrade (in the background)    (admin)
//
// The work is done by /usr/sbin/lg7200-update; downloads can take longer than rpcd allows a call,
// so check and install run in the background and the page follows `status`.
'use strict';

import { readfile } from 'fs';

const CMD = '/usr/sbin/lg7200-update', DIR = '/tmp/lg7200-update';

function kv(text) {
	let o = {};
	for (let l in split(text ?? '', '\n')) {
		const i = index(l, '=');
		if (i > 0) o[substr(l, 0, i)] = substr(l, i + 1);
	}
	return o;
}

function running() {
	return system(`pgrep -f "${CMD} (check|download|install)" >/dev/null 2>&1`) == 0;
}

const update = {
	status: {
		call: function() {
			const st = kv(readfile(`${DIR}/status`));
			const rel = kv(replace(readfile('/etc/lg7200-release') ?? '', /'/g, ''));
			let latest = null;
			try { latest = json(readfile(`${DIR}/latest.json`) ?? 'null'); } catch (e) { latest = null; }
			return {
				current: rel.PRODUCT_VERSION ?? '', latest: st.latest || null, available: st.available || null,
				changelog: latest ? (latest.changelog ?? null) : null,
				checked: st.checked ? +st.checked : null, error: st.error || null,
				downloading: !!st.downloading, installing: st.installing ? +st.installing : null,
				busy: running()
			};
		}
	},
	check: {
		call: function() {
			if (running()) return { result: false, error: 'busy' };
			system(`${CMD} check >/dev/null 2>&1 &`);
			return { result: true };
		}
	},
	install: {
		call: function() {
			if (running()) return { result: false, error: 'busy' };
			system(`${CMD} install >/dev/null 2>&1 &`);
			return { result: true };
		}
	}
};

return { 'virox.update': update };
