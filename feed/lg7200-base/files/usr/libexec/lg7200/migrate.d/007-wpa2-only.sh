#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 7 (2026-11-22): Wi-Fi security is WPA2 only. The WPA2/WPA3 mixed default (sae-mixed) kept
# the owner's iPhone 14 Plus and many other devices from joining "Roka" on the main router (owner
# 2026-11-22). Every access-point network (home and guest) that still uses WPA3 or the mixed mode
# moves to WPA2 (psk2+ccmp) with the same name and password; the WPA3-only management-frame setting
# goes with it. Networks with personal passwords (wpa_psk_file) already use WPA2 and are left alone.
# The 802.11s backhaul (mode mesh) keeps its own SAE: it is not a network phones join.
c=1
for s in $(uci -q show wireless | sed -n "s/^wireless\.\([^.]*\)=wifi-iface$/\1/p"); do
	[ "$(uci -q get wireless.$s.mode)" = ap ] || continue
	case "$(uci -q get wireless.$s.encryption)" in
		sae|sae-mixed|sae+*|sae-mixed+*)
			uci set wireless.$s.encryption=psk2+ccmp
			uci -q delete wireless.$s.ieee80211w
			c=0 ;;
	esac
done
[ $c = 0 ] && uci commit wireless
exit 0
