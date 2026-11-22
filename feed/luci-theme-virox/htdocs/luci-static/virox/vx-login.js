// SPDX-License-Identifier: Apache-2.0
// Virox login page (both looks): the language switch before login, and the isolation of Latin
// words and numbers in Arabic text (BUILD-PLAN 10a item 2). No LuCI scripts on this anonymous page.
// Reads the two languages from <script type="application/json" id="vx-login-texts">.
(function() {
	var data = document.getElementById('vx-login-texts');
	if (!data) return;
	var cfg = JSON.parse(data.textContent), T = cfg.texts, cur = cfg.lang;
	// a run of Latin letters or digits ("Virox", "5", "Reset") goes into its own <bdi dir="ltr">
	var RUN = /[A-Za-z0-9][A-Za-z0-9.,:%+_-]*(?:\s+[A-Za-z0-9][A-Za-z0-9.,:%+_-]*)*/g;
	var put = function(e, s, rtl) {
		e.textContent = '';
		if (!rtl) { e.textContent = s; return; }
		var last = 0;
		s.replace(RUN, function(run, at) {
			if (at > last) e.appendChild(document.createTextNode(s.slice(last, at)));
			var b = document.createElement('bdi'); b.dir = 'ltr'; b.textContent = run; e.appendChild(b);
			last = at + run.length;
			return run;
		});
		if (last < s.length) e.appendChild(document.createTextNode(s.slice(last)));
	};
	var apply = function(lang) {
		var t = T[lang];
		document.documentElement.lang = lang;
		document.documentElement.dir = lang == 'ar' ? 'rtl' : 'ltr';
		document.querySelectorAll('[data-t]').forEach(function(e) { put(e, t[e.getAttribute('data-t')], lang == 'ar'); });
		document.querySelectorAll('[data-t-label]').forEach(function(e) { e.setAttribute('aria-label', t[e.getAttribute('data-t-label')]); });
		var sw = document.getElementById('vx-login-lang');
		if (sw) sw.textContent = t.other;
		cur = lang;
	};
	var sw = document.getElementById('vx-login-lang');
	if (sw) sw.addEventListener('click', function() {
		var lang = cur == 'ar' ? 'en' : 'ar';
		apply(lang);
		try { localStorage.setItem('vx-lang-want', lang); } catch (e) {}
	});
	var want = null;
	try { want = localStorage.getItem('vx-lang-want'); } catch (e) {}
	apply(want && T[want] ? want : cur);
	var pw = document.getElementById('luci_password');
	if (pw) pw.focus();
})();
