#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 2: the first builds wrote the Cairo timezone as "EET-2EEST,M4.5.5/0,L10.4.4/24".
# "L10.4.4" is not POSIX: musl then never ends summer time, so the clock showed UTC+3 all
# winter (one hour wrong for day totals, schedules and time limits). Replace that exact value
# with the LuCI zoneinfo string for Africa/Cairo; any other timezone the owner chose is kept.
BAD='EET-2EEST,M4.5.5/0,L10.4.4/24'
GOOD='EET-2EEST,M4.5.5/0,M10.5.4/24'

if [ "$(uci -q get system.@system[0].timezone)" = "$BAD" ]; then
	uci set system.@system[0].timezone="$GOOD"
	uci commit system
	echo "$GOOD" > /tmp/TZ
fi
if [ "$(uci -q get lg7200.product.timezone)" = "$BAD" ]; then
	uci set lg7200.product.timezone="$GOOD"
	uci commit lg7200
fi
exit 0
