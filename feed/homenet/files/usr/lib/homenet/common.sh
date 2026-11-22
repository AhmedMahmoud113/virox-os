# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# homenet shared helpers (ported from the owner's homenet, BUILD-PLAN B7 / docs/b7-homenet-port.md).
# Source with: . /usr/lib/homenet/common.sh
#
# Data model (B7.3a): devices have an internal id and a list of MACs; usage, limits, schedules
# and the future line/ap fields hang off the device id; a person owns devices.
#   devices.tsv      id  name  person_id  line  ap  created
#   device-macs.tsv  mac  device_id  first_seen  last_seen  hostname
#   people.tsv       id  name
#   usage-history.tsv  day  device_id  up_bytes  down_bytes
# Files that change every few minutes live in RAM ($HN_RUN) and are copied to flash
# ($HN_DATA) every 10 minutes, only when changed, atomically (P2).

. /lib/functions/lg7200.sh 2>/dev/null

: "${HN_DATA:=/etc/homenet/data}"
: "${HN_RUN:=/tmp/homenet}"
HN_HOT='usage-state.tsv usage-history.tsv usage-lines.tsv ap-usage.tsv ipmap.tsv device-macs.tsv unattributed.tsv wan-totals.tsv screentime.tsv wire-ratio.tsv kidsites.tsv'
HN_DEVICES="$HN_DATA/devices.tsv"
HN_PEOPLE="$HN_DATA/people.tsv"
HN_MACS="$HN_RUN/device-macs.tsv"       # hot: last_seen changes often
HN_STATE="$HN_RUN/usage-state.tsv"
HN_HISTORY="$HN_RUN/usage-history.tsv"
HN_IPMAP="$HN_RUN/ipmap.tsv"
TAB="$(printf '\t')"

hn_today() { date +%F; }       # system timezone (lg7200-base sets Africa/Cairo)

hn_is_mac() {
	printf '%s\n' "$1" | grep -Eq '^([0-9a-f]{2}:){5}[0-9a-f]{2}$'
}

# Clock synced? Without lg7200-base (homenet alone) the clock is trusted.
hn_synced() {
	command -v lg7200_time_synced >/dev/null 2>&1 || return 0
	lg7200_time_synced
}

# Atomic write from stdin (lg7200-base helper, or a local fallback).
hn_write() {
	if command -v lg7200_write_atomic >/dev/null 2>&1; then
		lg7200_write_atomic "$1"
	else
		cat > "$1.tmp.$$" && mv -f "$1.tmp.$$" "$1"
	fi
}

# Guarded write for the record files (devices.tsv, people.tsv, device-macs.tsv), B7.3c:
#   some_command | hn_write_records <file> [id-that-may-disappear ...]
# The first column is the record id. A write that would drop any id not named in the call is
# refused (the merge bug once emptied devices.tsv): nothing is written, the refusal is logged
# and goes to the event list.
# Before an accepted write to one of the flash record files, all three are copied together to
# $HN_DATA/prev/: one consistent previous version (the state just before the last change),
# which `devices restore-previous` puts back. (Copying each file alone would mix moments: a
# device could come back without its MAC.)
HN_RECORDS="devices.tsv people.tsv device-macs.tsv"
hn_snapshot() {
	local f
	mkdir -p "$HN_DATA/prev.new" || return 1
	for f in $HN_RECORDS; do
		if [ -f "$HN_DATA/$f" ]; then cp -f "$HN_DATA/$f" "$HN_DATA/prev.new/$f"; else : > "$HN_DATA/prev.new/$f"; fi
	done
	sync
	rm -rf "$HN_DATA/prev"
	mv "$HN_DATA/prev.new" "$HN_DATA/prev"
}

hn_write_records() {
	local f="$1" new="$1.new.$$" lost
	shift
	cat > "$new" || { rm -f "$new"; return 1; }
	if [ -s "$f" ]; then
		lost="$(awk -F '\t' -v allow=" $* " '
			FILENAME == ARGV[1] { keep[$1] = 1; next }
			$1 != "" && !($1 in keep) && index(allow, " " $1 " ") == 0 { n++ }
			END { print n + 0 }' "$new" "$f")"
		if [ "$lost" -gt 0 ]; then
			rm -f "$new"
			logger -t homenet "refused a write to $f that would drop $lost record(s)"
			hn_event data_write_refused danger file="${f##*/}" dropped="$lost"
			return 1
		fi
		cmp -s "$new" "$f" && { rm -f "$new"; return 0; }
	fi
	case "$f" in "$HN_DATA"/*) hn_snapshot ;; esac
	hn_write "$f" < "$new"
	rm -f "$new"
}

# Shared event list (section 11.4); silently skipped without lg7200-base.
hn_event() {
	command -v lg7200_event_add >/dev/null 2>&1 || return 0
	lg7200_event_add homenet "$@"
}

# LAN bridge device and WAN devices from uci / netifd (never literal names).
# WAN is a list: B9 adds the second line without rewriting rules.
# the VPN client's device while it is on (homenet/vpn): counted like a line for the devices that use it
hn_vpn_dev() {
	[ "$(uci -q get homenet.vpn.enabled)" = 1 ] || return 0
	case "$(uci -q get homenet.vpn.type)" in wireguard) echo vpn ;; openvpn) echo tun-vpn ;; esac
}

hn_lan_dev() {
	local d
	d="$(uci -q get network.lan.device)"
	echo "${d:-br-lan}"
}

hn_wan_devs() {
	local i d out=""
	for i in $(uci -q show network | sed -n "s/^network\.\(wan[0-9]*\)=interface$/\1/p"); do
		d="$(ubus call network.interface.$i status 2>/dev/null | jsonfilter -e '@.l3_device' 2>/dev/null)"
		[ -n "$d" ] || d="$(uci -q get network.$i.device)"
		[ -n "$d" ] && case " $out " in *" $d "*) ;; *) out="$out $d" ;; esac
	done
	echo $out
}

# Copy the persisted hot files to RAM once per boot.
hn_prepare() {
	[ -f "$HN_RUN/.ready" ] && return 0
	mkdir -p "$HN_RUN" "$HN_DATA" || return 1
	chmod 700 "$HN_RUN" "$HN_DATA"
	(
		flock 8
		[ -f "$HN_RUN/.ready" ] && exit 0
		for f in $HN_HOT; do
			if [ -f "$HN_DATA/$f" ]; then cp -p "$HN_DATA/$f" "$HN_RUN/$f" || exit 1
			else : > "$HN_RUN/$f"; fi
		done
		[ -f "$HN_DEVICES" ] || : > "$HN_DEVICES"
		[ -f "$HN_PEOPLE" ] || : > "$HN_PEOPLE"
		: > "$HN_RUN/.ready"
	) 8>"$HN_RUN.prepare.lock"
}

# Copy changed hot files to flash (cron every 10 minutes and at shutdown).
hn_persist() {
	[ -f "$HN_RUN/.ready" ] || return 0
	local f
	for f in $HN_HOT; do
		[ -f "$HN_RUN/$f" ] || continue
		cmp -s "$HN_RUN/$f" "$HN_DATA/$f" 2>/dev/null && continue
		if [ "$f" = device-macs.tsv ]; then
			hn_write_records "$HN_DATA/$f" < "$HN_RUN/$f"
		else
			hn_write "$HN_DATA/$f" < "$HN_RUN/$f"
		fi
	done
}

# New-devices policy (B7.3c): allow (default) | ask = a new MAC gets no internet until the
# admin approves its device or links the MAC to a known device
HN_HELD="$HN_DATA/held.tsv"           # device_id  date  mac
hn_policy() {
	local p
	p="$(uci -q get homenet.main.new_devices)"
	[ "$p" = ask ] && echo ask || echo allow
}

# Next device / person id: d1, d2, ... (never reused)
hn_new_id() { # $1 prefix (d|p)
	local f="$HN_DATA/next-$1" n
	n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))
	echo "$n" | hn_write "$f"
	echo "$1$n"
}

# Device id for a MAC; a MAC never seen before gets a new device record (and an event).
# usage: hn_device_for_mac <mac> [hostname]
hn_device_for_mac() {
	local mac="$1" host="${2:-}" id today
	hn_is_mac "$mac" || return 1
	id="$(awk -F '\t' -v m="$mac" '$1 == m { print $2; exit }' "$HN_MACS" 2>/dev/null)"
	[ -n "$id" ] && { echo "$id"; return 0; }
	(
		flock 7
		id="$(awk -F '\t' -v m="$mac" '$1 == m { print $2; exit }' "$HN_MACS" 2>/dev/null)"
		if [ -z "$id" ]; then
			today="$(hn_today)"
			id="$(hn_new_id d)"
			host="$(printf '%s' "$host" | tr -d '\t\n' | cut -c1-40)"
			{ cat "$HN_DEVICES" 2>/dev/null; printf '%s\t%s\t\t\t\t%s\n' "$id" "$host" "$today"; } | hn_write_records "$HN_DEVICES" || exit 1
			{ cat "$HN_MACS" 2>/dev/null; printf '%s\t%s\t%s\t%s\t%s\n' "$mac" "$id" "$today" "$today" "$host"; } | hn_write_records "$HN_MACS" || exit 1
			# new devices are rare: put the MAC list on flash now, so a power cut cannot
			# leave a device record without its MAC (it would come back as a duplicate)
			hn_write_records "$HN_DATA/device-macs.tsv" < "$HN_MACS"
			if [ "$(hn_policy)" = ask ]; then
				# no internet yet (the MAC is not in the known set); the alert carries the
				# device id so the page can offer "approve" and "this is device X"
				{ cat "$HN_HELD" 2>/dev/null; printf '%s\t%s\t%s\n' "$id" "$today" "$mac"; } | hn_write "$HN_HELD"
				hn_event new_device_held warn device_id="$id" mac="$mac" name="$host"
			else
				hn_event new_device info device_id="$id" mac="$mac" name="$host"
			fi
		fi
		echo "$id"
	) 7>"$HN_RUN.devices.lock"
}

# Package size in bytes from homenet.main.package_mb (whole MB, 1 MB = 1048576 bytes, B7.3e);
# a config from before B7.3e has package_gb (GB of 1024 MB). 0 = no package.
hn_package_bytes() {
	local mb gb
	mb="$(uci -q get homenet.main.package_mb)"
	if [ -z "$mb" ]; then
		gb="$(uci -q get homenet.main.package_gb)"
		mb="$(awk -v g="${gb:-0}" 'BEGIN { printf "%.0f", g * 1024 }')"
	fi
	case "$mb" in ''|*[!0-9]*) mb=0 ;; esac
	awk -v m="$mb" 'BEGIN { printf "%.0f\n", m * 1048576 }'
}

# ISP calibration (B7.3e item 5c): bytes added to the router's own package figure so the package
# continues from what the ISP showed as remaining; only in the billing cycle it was typed in.
# usage: hn_calib_offset <cycle start>
hn_calib_offset() {
	local o
	[ "$(uci -q get homenet.main.calib_cycle)" = "$1" ] || { echo 0; return; }
	o="$(uci -q get homenet.main.calib_offset)"
	case "$o" in ''|*[!0-9-]*) o=0 ;; esac
	echo "$o"
}

# bytes the house used in the cycle that starts on <day> (all bookings + unattributed),
# the router's own figure before any ISP calibration
hn_cycle_used() {
	cat "$HN_HISTORY" "$HN_RUN/unattributed.tsv" 2>/dev/null |
		awk -F '\t' -v s="$1" '$1 >= s { t += $3 + $4 } END { printf "%.0f\n", t }'
}

# Billing cycle from homenet.main.renew_day (1-31, clamped to the month length).
# Prints: <cycle start YYYY-MM-DD> <next renewal YYYY-MM-DD>
hn_cycle() {
	local rd
	rd="$(uci -q get homenet.main.renew_day)"
	awk -v t="$(hn_today)" -v r="${rd:-1}" '
	function mdays(y,m) {
		if (m == 2) return (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 29 : 28
		return (m == 4 || m == 6 || m == 9 || m == 11) ? 30 : 31
	}
	BEGIN {
		y = substr(t,1,4)+0; m = substr(t,6,2)+0; d = substr(t,9,2)+0
		rd = r+0; if (rd < 1 || rd > 31) rd = 1
		sd = rd > mdays(y,m) ? mdays(y,m) : rd
		if (d < sd) { m--; if (m < 1) { m = 12; y-- } sd = rd > mdays(y,m) ? mdays(y,m) : rd }
		ny = y; nm = m + 1; if (nm > 12) { nm = 1; ny++ }
		ed = rd > mdays(ny,nm) ? mdays(ny,nm) : rd
		printf "%04d-%02d-%02d %04d-%02d-%02d\n", y, m, sd, ny, nm, ed
	}'
}
