#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 4 (owner 2026-11-21: "a phone should move between the networks easily, for a call or a
# game"): usteer, which runs on every Virox unit, helps a phone that stays on a weak signal.
# With its defaults it only moved phones up to 5 GHz (band steering) and never helped a phone on a
# weak 5 GHz signal, e.g. two rooms away, go to the 2.4 GHz radio or to a nearer access point:
#  - below -70 dBm the phone is asked to look around (802.11k, roam_scan_snr);
#  - below -75 dBm, when another radio or unit hears it at least 8 dB better, it is asked to move
#    there (802.11v BSS transition, roam_trigger_snr, signal_diff_threshold); with access points the
#    move is a fast one (802.11r, apctl), so a call or a game goes on;
#  - nobody is refused or thrown off for a weak signal alone (min_snr, assoc_steering stay off).
# Only options the owner has not set are written, so a choice made in LuCI's usteer page stays.
[ -f /etc/config/usteer ] || exit 0
s="$(uci -q show usteer | sed -n 's/^usteer\.\([^.=]*\)=usteer$/\1/p' | head -n 1)"
[ -n "$s" ] || exit 0
set_default() { [ -n "$(uci -q get "usteer.$s.$1")" ] || uci set "usteer.$s.$1=$2"; }
set_default roam_scan_snr -70
set_default roam_trigger_snr -75
set_default roam_trigger_interval 30000
set_default signal_diff_threshold 8
uci commit usteer
# at an upgrade usteer already runs with the old values (at first boot it starts after this)
pidof usteerd >/dev/null 2>&1 && /etc/init.d/usteer reload >/dev/null 2>&1
exit 0
