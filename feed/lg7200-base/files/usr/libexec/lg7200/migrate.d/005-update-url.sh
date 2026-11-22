#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Schema 5 (owner 2026-11-22): the update address moves from GitHub's ".../releases/latest/download",
# which skips pre-releases (every rc: no unit ever found an update, "download_failed"), to the fixed
# release ".../releases/download/updates" (tools/publish-updates.sh). Only the old default is
# changed; an address the owner set by hand stays.
old="https://github.com/AhmedMahmoud113/virox-os/releases/latest/download"
new="https://github.com/AhmedMahmoud113/virox-os/releases/download/updates"
[ "$(uci -q get lg7200.update.url)" = "$old" ] || exit 0
uci set lg7200.update.url="$new"
uci commit lg7200
[ -x /usr/libexec/lg7200/repos ] && /usr/libexec/lg7200/repos >/dev/null 2>&1
exit 0
