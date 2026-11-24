// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// The page translations, as luci-base's action_translations, but kept by the browser: every page
// change fetched them again and the router took about one second to write them (2026-11-24 page
// speed). The address carries the LuCI and Virox version (?v=...) and the language, so a new
// version or another language is a new address; the browser may keep this one for a year.
'use strict';

import { load_catalog, change_catalog, get_translations } from 'luci.core';

return {
	action_translations: function(reqlang) {
		if (reqlang != null && reqlang != dispatcher.lang) {
			load_catalog(reqlang, '/usr/lib/lua/luci/i18n');
			change_catalog(reqlang);
		}

		http.prepare_content('application/javascript; charset=UTF-8');
		if (http.formvalue('v'))
			http.header('Cache-Control', 'public, max-age=31536000, immutable');
		http.write('window.TR={');
		get_translations((key, val) => http.write(sprintf('"%08x":%J,', key, val)));
		http.write('};');
	}
};
