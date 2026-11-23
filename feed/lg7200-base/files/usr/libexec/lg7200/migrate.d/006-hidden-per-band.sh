#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 6 (2026-11-22): "hide the network name" became one setting per band (hidden_2g, hidden_5g,
# owner 2026-11-21), but a unit that hid its name before kept the old single lg7200.wifi.hidden=1.
# The pages and the access points read only the per-band settings, so the main router showed "not
# hidden" and its access points broadcast the name it hides (the main router, AP GAPD-7200, 2026-11-22).
# The old value goes to both bands that have no value of their own, then it is removed.
v="$(uci -q get lg7200.wifi.hidden)"
[ -n "$v" ] || exit 0
for b in 2g 5g; do
	[ -n "$(uci -q get lg7200.wifi.hidden_$b)" ] || uci set lg7200.wifi.hidden_$b="$v"
done
uci -q delete lg7200.wifi.hidden
uci commit lg7200
exit 0
