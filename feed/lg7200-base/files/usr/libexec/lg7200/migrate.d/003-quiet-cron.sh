#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 3: busybox crond logged every job it started ("USER root pid ... cmd ..."), as cron.err.
# With homenet's jobs every minute that was 6 lines a minute: on the first unit 872 of the 1020
# lines of the system log (a small ring in RAM), so real messages and the help report's log were
# pushed out within hours (review 2026-11-20). Level 9 keeps only crond's own errors.
cur="$(uci -q get system.@system[0].cronloglevel)"
if [ -z "$cur" ] || [ "$cur" -lt 9 ] 2>/dev/null; then
	uci set system.@system[0].cronloglevel=9
	uci commit system
	# at an upgrade crond already runs with the old level (at first boot it starts after this)
	pidof crond >/dev/null 2>&1 && /etc/init.d/cron restart >/dev/null 2>&1
fi
exit 0
