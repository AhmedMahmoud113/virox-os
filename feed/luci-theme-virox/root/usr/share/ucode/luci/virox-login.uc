// SPDX-License-Identifier: Apache-2.0
// Texts of the Virox login page in both languages (both are in the page so the language switch
// works before login). Shared by both looks (themes/virox and themes/virox-vantage sysauth.ut).
// Simple formal Arabic (BUILD-PLAN 10a item 11); listed in docs/ar/strings-review.md.
'use strict';

function texts(product) {
	return {
		ar: { title: `تسجيل الدخول إلى ${product}`, label: 'كلمة مرور الراوتر', button: 'تسجيل الدخول',
		      error: 'كلمة المرور غير صحيحة. حاول مرة أخرى.',
		      tries: 'بعد 5 محاولات خاطئة يتوقف تسجيل الدخول من هذا الجهاز لمدة 5 دقائق.',
		      forgot: 'نسيت كلمة المرور؟ اضغط زر Reset في ظهر الراوتر لمدة 10 ثوانٍ وهو يعمل. يعود الراوتر إلى إعدادات المصنع، ثم تبدأ الإعداد من جديد.',
		      show: 'إظهار كلمة المرور', other: 'English', starting: 'جارٍ تجهيز الإعداد…' },
		en: { title: `Sign in to ${product}`, label: 'Router password', button: 'Sign in',
		      error: 'That password is not correct. Try again.',
		      tries: 'After 5 wrong tries, sign-in from this device is blocked for 5 minutes.',
		      forgot: 'Forgot the password? Hold the Reset button on the back of the router for 10 seconds while it is on. It returns to factory settings and you run the setup again.',
		      show: 'Show password', other: 'العربية', starting: 'Starting the setup…' }
	};
}

export { texts };
