// SPDX-License-Identifier: Apache-2.0
// One formatter for every value on the Virox pages (BUILD-PLAN 10a item 2): volume, speed,
// minutes, clock time, date, percent. Arabic units in Arabic, English units in English, always
// Western digits, and every value returned as one isolated <bdi> element, so a value never
// mixes with the sentence around it and two values are never joined with "·" or "/".
// The units are glossary terms (docs/ar/glossary.md), kept here, not in the po files.
//   'require virox.fmt as fmt';  fmt.bytes(n), fmt.usedOf(used, total), ...
'use strict';
'require baseclass';

const MB = 1048576, GB = 1024 * MB;   // docs/api.md "Units": GB = 1024 MB

const U = {
	ar: { kb: 'كيلوبايت', mb: 'ميجا', gb: 'جيجا', kbit: 'كيلوبت/ث', mbit: 'ميجابت/ث', kbps: 'كيلوبايت/ث', mbps: 'ميجابايت/ث', min: 'دقيقة', h: 'ساعة',
		hm: (h, m) => '%s و%s'.format(countText(h, 'hour'), countText(m, 'minute')), used: 'مستخدم %s من %s', left: 'المتبقي %s من %s',
		today: 'اليوم %s', dl: 'تحميل', ul: 'رفع' },
	en: { kb: 'KB', mb: 'MB', gb: 'GB', kbit: 'kbit/s', mbit: 'Mbit/s', kbps: 'KB/s', mbps: 'MB/s', min: 'min', h: 'h',
		hm: (h, m) => '%s h %s min'.format(h, m), used: '%s used of %s', left: '%s left of %s',
		today: 'today %s', dl: 'download', ul: 'upload' }
};

// "number + noun" (BUILD-PLAN 15.5 item 2): the Arabic forms by number. Each noun: none (0), one
// (1), two (2), few (3-10, "%s أجهزة"), many (11+, "%s جهازًا"); English: one / other.
const NOUNS = {
	device:  { ar: [ 'لا أجهزة', 'جهاز واحد', 'جهازان', '%s أجهزة', '%s جهازًا' ], en: [ 'no devices', '1 device', '%s devices' ] },
	site:    { ar: [ 'لا مواقع', 'موقع واحد', 'موقعان', '%s مواقع', '%s موقعًا' ], en: [ 'no sites', '1 site', '%s sites' ] },
	day:     { ar: [ '0 يوم', 'يوم واحد', 'يومان', '%s أيام', '%s يومًا' ], en: [ '0 days', '1 day', '%s days' ] },
	minute:  { ar: [ '0 دقيقة', 'دقيقة واحدة', 'دقيقتان', '%s دقائق', '%s دقيقة' ], en: [ '0 min', '1 min', '%s min' ] },
	hour:    { ar: [ '0 ساعة', 'ساعة واحدة', 'ساعتان', '%s ساعات', '%s ساعة' ], en: [ '0 h', '1 h', '%s h' ] },
	outage:  { ar: [ 'لا انقطاعات', 'انقطاع واحد', 'انقطاعان', '%s انقطاعات', '%s انقطاعًا' ], en: [ 'no outages', '1 outage', '%s outages' ] },
	ap:      { ar: [ 'لا نقاط وصول', 'نقطة وصول واحدة', 'نقطتا وصول', '%s نقاط وصول', '%s نقطة وصول' ], en: [ 'no access points', '1 access point', '%s access points' ] },
	computer:{ ar: [ 'لا كمبيوترات', 'كمبيوتر واحد', 'كمبيوتران', '%s كمبيوترات', '%s كمبيوترًا' ], en: [ 'no computers', '1 computer', '%s computers' ] },
	person:  { ar: [ 'لا أشخاص', 'شخص واحد', 'شخصان', '%s أشخاص', '%s شخصًا' ], en: [ 'nobody', '1 person', '%s people' ] }
};
function countText(n, noun) {
	n = Math.max(0, Math.round(+n || 0));
	const f = NOUNS[noun];
	if (!f) return String(n);
	if (lang() == 'ar') {
		const a = f.ar, k = n % 100;
		const t = n == 0 ? a[0] : n == 1 ? a[1] : n == 2 ? a[2] : (k >= 3 && k <= 10) ? a[3] : a[4];
		return t.format(n);
	}
	return (n == 0 ? f.en[0] : n == 1 ? f.en[1] : f.en[2]).format(n);
}

function lang() { return (document.documentElement.lang || 'en').slice(0, 2) == 'ar' ? 'ar' : 'en'; }
function u() { return U[lang()]; }

// one value: number and unit in reading order of the page language, isolated
function val(text, ltrAlways) {
	return E('bdi', { 'class': 'vx-val', 'dir': ltrAlways || lang() != 'ar' ? 'ltr' : 'rtl' }, [ String(text) ]);
}

// trailing zeros away: 4.10 -> 4.1, 20.00 -> 20
function num(x, digits) {
	return String(+(+x).toFixed(digits));
}

function bytesText(n) {
	n = +n || 0;
	if (n < MB) return '%s %s'.format(Math.round(n / 1024), u().kb);
	if (n < GB) return '%s %s'.format(num(n / MB, 1), u().mb);
	return '%s %s'.format(num(n / GB, n < 100 * GB ? 2 : 1), u().gb);
}

function speedText(kbit) {
	kbit = +kbit || 0;
	return kbit < 1000 ? '%s %s'.format(Math.round(kbit), u().kbit) : '%s %s'.format(num(kbit / 1000, 1), u().mbit);
}

// what is moving now, in bytes per second as download programs show it (owner 2026-11-20:
// 30 Mbit/s on fast.com should read 3.75 MB/s on the router)
function rateText(bps) {
	bps = Math.max(0, +bps || 0);
	return bps < 1000 * 1024 ? '%s %s'.format(Math.round(bps / 1024), u().kbps) : '%s %s'.format(num(bps / MB, bps < 10 * MB ? 2 : 1), u().mbps);
}

function minutesText(m) {
	m = Math.max(0, Math.round(+m || 0));
	if (m < 60) return countText(m, 'minute');
	return (m % 60) ? u().hm(Math.floor(m / 60), m % 60) : countText(m / 60, 'hour');
}

// a sentence with %s slots filled by elements (values stay isolated inside it)
function sentence(tpl, parts) {
	const out = [];
	tpl.split('%s').forEach((t, i) => {
		if (t) out.push(t);
		if (i < parts.length) out.push(parts[i]);
	});
	return E('span', { 'class': 'vx-sentence' }, out);
}

const fmt = {
	MB, GB,
	lang,
	bytes: n => val(bytesText(n)),
	bytesText,
	speed: kbit => val(speedText(kbit)),
	rate: bps => val(rateText(bps)),
	minutes: m => val(minutesText(m)),
	minutesText,
	// "number + noun" with the Arabic plural forms: fmt.count(3, 'device') -> "3 أجهزة"
	count: (n, noun) => val(countText(n, noun)),
	countText,
	// clock time from epoch seconds, 24 h
	time: epoch => { const d = new Date(epoch * 1000); return val('%02d:%02d'.format(d.getHours(), d.getMinutes()), true); },
	// "2026-12-03" or epoch -> "3 ديسمبر" / "3 December" (Western digits)
	date: v => {
		const d = typeof v == 'number' ? new Date(v * 1000) : new Date(String(v) + 'T12:00:00');
		if (isNaN(d)) return val(String(v), true);
		return val(d.toLocaleDateString(lang() == 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { 'day': 'numeric', 'month': 'long' }));
	},
	percent: p => val('%s%%'.format(Math.round(+p || 0)), true),
	// a number the user typed or an id: isolated, left-to-right (MAC, IP, names in Latin letters)
	ltr: text => val(text, true),
	// a name typed by the user (Arabic or Latin letters): isolated, its own direction
	name: text => E('bdi', { 'dir': 'auto' }, [ String(text) ]),
	// "مستخدم 4.1 ميجا من 20 جيجا" / "4.1 MB used of 20 GB"
	usedOf: (used, total) => sentence(u().used, [ val(bytesText(used)), val(bytesText(total)) ]),
	leftOf: (left, total) => sentence(u().left, [ val(bytesText(left)), val(bytesText(total)) ]),
	today: n => sentence(u().today, [ val(bytesText(n)) ]),
	sentence,
	word: k => u()[k]
};

return baseclass.extend(fmt);
