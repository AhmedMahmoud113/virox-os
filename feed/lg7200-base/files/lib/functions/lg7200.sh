#!/bin/sh
# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# /lib/functions/lg7200.sh — per-unit identity for Virox on the Mercury GAPM-7200 and the
# LG U+ GAPD-7200 (BUILD-PLAN 16). Everything that differs between the boards goes through
# lg7200_board (never an assumption about the SoC).
#
# Storage (BUILD-PLAN B6 item 1, planner decision on F16):
#   1. the upstream "provisioning" UBI volume (created by `sysupgrade -P`), accessed only
#      through the upstream `provision` tool, all our keys under the JSON path "lg7200";
#   2. otherwise the overlay file /etc/lg7200/unitcfg (key=value lines), kept across
#      upgrades by /lib/upgrade/keep.d/lg7200-base, lost on factory reset.
#   When the volume appears, lg7200_unitcfg_migrate moves the file into it.
#
# Every path and command is a variable so the logic can be tested off-device.

: "${LG7200_PROVISION:=provision}"
: "${LG7200_UNITCFG_FILE:=/etc/lg7200/unitcfg}"
: "${LG7200_SYSFS_UBI:=/sys/class/ubi}"
: "${LG7200_PROC_MTD:=/proc/mtd}"
: "${LG7200_MAC_BLOCKLIST:=/etc/lg7200/mac-blocklist}"
: "${LG7200_RANDOM:=/dev/urandom}"
# Factory / Config device paths: empty = look up the mtd partition by name.
: "${LG7200_FACTORY_DEV:=}"
: "${LG7200_CONFIG_DEV:=}"

LG7200_KEY_RE='^[a-z0-9_]+$'

# ---------------------------------------------------------------- board (BUILD-PLAN 16)
# The Virox board id from the OpenWrt board name:
#   mercury,gapm7200 -> gapm7200   Mercury GAPM-7200 (ramips mt7621, MT7615 DBDC)
#   asus,rt-ac58u    -> gapd7200   LG U+ GAPD-7200 (ipq40xx; its PandoraBox recovery and the
#                                  image profile davolink_gapd7200 keep the RT-AC58U board name)
#   anything else    -> unknown
: "${LG7200_BOARD_NAME_FILE:=/tmp/sysinfo/board_name}"
lg7200_board() {
	case "$(cat "$LG7200_BOARD_NAME_FILE" 2>/dev/null)" in
		mercury,gapm7200) echo gapm7200 ;;
		asus,rt-ac58u|davolink,gapd7200) echo gapd7200 ;;
		*) echo unknown ;;
	esac
}
# 0 when the sysupgrade image $1 is made for this board: its metadata (fwtool) names this unit's
# board name. A GAPM-7200 image on a GAPD-7200 (or the other way) is refused here, before
# sysupgrade, so the pages can say why in plain words. An image without metadata: 0 (sysupgrade
# -T decides). Prints the image's boards on refusal.
lg7200_image_for_board() {
	local meta="/tmp/lg7200-image-meta.$$" b
	command -v fwtool >/dev/null 2>&1 || return 0
	if ! fwtool -q -i "$meta" "$1" 2>/dev/null; then rm -f "$meta"; return 0; fi
	b="$(jsonfilter -i "$meta" -e '@.supported_devices[*]' 2>/dev/null)"
	rm -f "$meta"
	[ -n "$b" ] || return 0
	echo "$b" | grep -qxF "$(cat "$LG7200_BOARD_NAME_FILE" 2>/dev/null)" && return 0
	echo $b
	return 1
}

# The name on the unit's label (shown in the pages and the install guide)
lg7200_board_label() {
	case "${1:-$(lg7200_board)}" in
		gapm7200) echo GAPM-7200 ;;
		gapd7200) echo GAPD-7200 ;;
		*) cat /tmp/sysinfo/model 2>/dev/null ;;
	esac
}

# ---------------------------------------------------------------- storage

lg7200_has_volume() {
	local n
	command -v "$LG7200_PROVISION" >/dev/null 2>&1 || return 1
	for n in "$LG7200_SYSFS_UBI"/*/name; do
		[ -r "$n" ] || continue
		[ "$(cat "$n")" = "provisioning" ] && return 0
	done
	return 1
}

lg7200_unitcfg_backend() {
	if lg7200_has_volume; then echo volume; else echo file; fi
}

_lg7200_check_key() {
	echo "$1" | grep -qE "$LG7200_KEY_RE" || { echo "lg7200: bad key '$1'" >&2; return 1; }
}

_lg7200_check_value() {
	# one line of printable ASCII, no quotes or backslashes (keeps both backends trivial)
	case "$1" in
		*[!\ -~]*|*\"*|*\\*|*\'*) echo "lg7200: bad value for '$2'" >&2; return 1 ;;
	esac
	[ "${#1}" -le 128 ] || { echo "lg7200: value too long for '$2'" >&2; return 1; }
}

_lg7200_file_get() {
	[ -r "$LG7200_UNITCFG_FILE" ] || return 1
	local line
	line="$(grep -E "^$1=" "$LG7200_UNITCFG_FILE" | tail -n 1)" || return 1
	[ -n "$line" ] || return 1
	echo "${line#*=}"
}

_lg7200_file_set() {
	local dir tmp
	dir="$(dirname "$LG7200_UNITCFG_FILE")"
	mkdir -p "$dir" || return 1
	tmp="$LG7200_UNITCFG_FILE.tmp.$$"
	{
		[ -r "$LG7200_UNITCFG_FILE" ] && grep -vE "^$1=" "$LG7200_UNITCFG_FILE"
		echo "$1=$2"
	} > "$tmp" && chmod 600 "$tmp" && mv -f "$tmp" "$LG7200_UNITCFG_FILE"
}

unitcfg_get() {
	_lg7200_check_key "$1" || return 1
	local v
	if lg7200_has_volume; then
		v="$("$LG7200_PROVISION" get "lg7200.$1" 2>/dev/null)" || return 1
		[ -n "$v" ] || return 1
		echo "$v"
	else
		_lg7200_file_get "$1"
	fi
}

unitcfg_set() {
	_lg7200_check_key "$1" || return 1
	_lg7200_check_value "$2" "$1" || return 1
	if lg7200_has_volume; then
		"$LG7200_PROVISION" set "lg7200.$1" "$2" >/dev/null
	else
		_lg7200_file_set "$1" "$2"
	fi
}

# Move the file backend into the volume once the volume exists. Idempotent.
# Keys already present in the volume win (they were written later or by provisioning).
lg7200_unitcfg_migrate() {
	lg7200_has_volume || return 0
	[ -r "$LG7200_UNITCFG_FILE" ] || return 0
	local line k v
	while IFS= read -r line; do
		k="${line%%=*}"; v="${line#*=}"
		echo "$k" | grep -qE "$LG7200_KEY_RE" || continue
		_lg7200_check_value "$v" "$k" 2>/dev/null || continue
		[ -n "$("$LG7200_PROVISION" get "lg7200.$k" 2>/dev/null)" ] && continue
		"$LG7200_PROVISION" set "lg7200.$k" "$v" >/dev/null || return 1
	done < "$LG7200_UNITCFG_FILE"
	# verify before removing the file
	while IFS= read -r line; do
		k="${line%%=*}"
		echo "$k" | grep -qE "$LG7200_KEY_RE" || continue
		[ -n "$("$LG7200_PROVISION" get "lg7200.$k" 2>/dev/null)" ] || return 1
	done < "$LG7200_UNITCFG_FILE"
	rm -f "$LG7200_UNITCFG_FILE"
}

# ---------------------------------------------------------------- MAC helpers

lg7200_mtd_dev() {
	# $1 = partition name as in /proc/mtd -> /dev/mtdN
	local dev
	dev="$(grep "\"$1\"" "$LG7200_PROC_MTD" 2>/dev/null | head -n 1 | cut -d: -f1)"
	[ -n "$dev" ] && echo "/dev/$dev"
}

lg7200_mac_norm() {
	# lower case, colon separated, or nothing if not a MAC
	local m
	m="$(echo "$1" | tr 'A-F-' 'a-f:')"
	echo "$m" | grep -qE '^[0-9a-f]{2}(:[0-9a-f]{2}){5}$' && echo "$m"
}

lg7200_mac_blocked() {
	# 0 = blocked. Lines in the blocklist are full MACs or prefixes ("00:0c:43:").
	local m="$1" p
	case "$m" in 00:00:00:00:00:00|ff:ff:ff:ff:ff:ff) return 0 ;; esac
	[ -r "$LG7200_MAC_BLOCKLIST" ] || return 1
	while read -r p _; do
		p="$(echo "$p" | tr 'A-F-' 'a-f:')"
		case "$p" in ''|'#'*) continue ;; esac
		case "$m" in "$p"*) return 0 ;; esac
	done < "$LG7200_MAC_BLOCKLIST"
	return 1
}

lg7200_mac_usable() {
	# unicast, not zero/broadcast, not blocklisted
	local m first
	m="$(lg7200_mac_norm "$1")" || return 1
	[ -n "$m" ] || return 1
	first=$((0x${m%%:*}))
	[ $((first & 1)) -eq 0 ] || return 1
	lg7200_mac_blocked "$m" && return 1
	return 0
}

lg7200_mac_add() {
	# $1 MAC, $2 integer increment on the lower 24 bits (same rule as macaddr_add)
	local m oui nic
	m="$(lg7200_mac_norm "$1")" || return 1
	oui="${m%:*:*:*}"
	nic="$(echo "${m#*:*:*:}" | tr -d ':')"
	nic=$(( (0x$nic + $2) & 0xffffff ))
	printf '%s:%02x:%02x:%02x\n' "$oui" $((nic >> 16)) $(((nic >> 8) & 0xff)) $((nic & 0xff))
}

lg7200_ubi_dev() {
	# $1 = UBI volume name -> /dev/ubiX_Y
	local n
	for n in "$LG7200_SYSFS_UBI"/ubi*_*/name; do
		[ -r "$n" ] || continue
		[ "$(cat "$n")" = "$1" ] && { n="${n%/name}"; echo "/dev/${n##*/}"; return 0; }
	done
	return 1
}

# The unit's own MAC as the maker wrote it (read only, never written):
#  - GAPM-7200: mtd "Factory", offset 4;
#  - GAPD-7200: UBI volume "Factory" (the ART copy), offset 0x5006 = 20486, the MAC the board's
#    DTS gives the LAN (unit AA54: ...:a0:ae:2c; 0x1006 holds the WAN / 2.4 GHz one, ...:28).
lg7200_factory_dev() {
	case "$(lg7200_board)" in
		gapd7200) echo "${LG7200_FACTORY_DEV:-$(lg7200_ubi_dev Factory)}" ;;
		*) echo "${LG7200_FACTORY_DEV:-$(lg7200_mtd_dev Factory)}" ;;
	esac
}
lg7200_factory_mac() {
	local dev off=4
	dev="$(lg7200_factory_dev)"
	[ "$(lg7200_board)" = gapd7200 ] && off=20486
	[ -r "$dev" ] || return 1
	lg7200_mac_norm "$(hexdump -v -n 6 -s "$off" -e '5/1 "%02x:" 1/1 "%02x"' "$dev" 2>/dev/null)"
}

# Locally administered MAC, stable for this unit: derived from the stock per-unit
# config block in mtd1 (0x40000, 0x80 bytes) when it holds data; random otherwise.
# [A] assumes that block differs between units (checked on hardware day).
lg7200_generate_mac() {
	local dev="${LG7200_CONFIG_DEV:-$(lg7200_mtd_dev Config)}" h=""
	if [ -r "$dev" ]; then
		local blk
		blk="$(dd if="$dev" bs=4096 skip=64 count=1 2>/dev/null | head -c 128 | hexdump -v -e '1/1 "%02x"')"
		case "$blk" in
			''|*[!f]*) [ -n "$blk" ] && h="$(echo "lg7200-mac:$blk" | sha256sum | cut -c1-12)" ;;
		esac
	fi
	[ -n "$h" ] || h="$(hexdump -v -n 6 -e '6/1 "%02x"' "$LG7200_RANDOM")"
	local b0=$(( (0x${h%??????????} & 0xfc) | 0x02 ))
	local r="${h#??}"
	printf '%02x:%s:%s:%s:%s:%s\n' "$b0" \
		"$(echo "$r" | cut -c1-2)" "$(echo "$r" | cut -c3-4)" "$(echo "$r" | cut -c5-6)" \
		"$(echo "$r" | cut -c7-8)" "$(echo "$r" | cut -c9-10)"
}

# Base MAC (LAN). Prints "<mac> <source>", source = override|factory|generated.
# PLAN 7.1: override, then Factory unless blocklisted, then a generated LA MAC (stored).
lg7200_base_mac() {
	local m
	m="$(unitcfg_get base_mac_override 2>/dev/null)"
	if [ -n "$m" ] && lg7200_mac_usable "$m"; then echo "$(lg7200_mac_norm "$m") override"; return 0; fi
	m="$(lg7200_factory_mac)"
	if [ -n "$m" ] && lg7200_mac_usable "$m"; then echo "$m factory"; return 0; fi
	m="$(unitcfg_get base_mac_generated 2>/dev/null)"
	if [ -z "$m" ] || ! lg7200_mac_norm "$m" >/dev/null; then
		m="$(lg7200_generate_mac)" || return 1
		unitcfg_set base_mac_generated "$m" || return 1
	fi
	echo "$(lg7200_mac_norm "$m") generated"
}

# ---------------------------------------------------------------- clock (P2)

# 0 once the clock can be trusted in this boot; time-based features wait for it.
#  - NTP synced (marker from the ntp hotplug), or
#  - "approximate" (B7.5b): the WAN was up for 10 minutes without an NTP answer and the clock
#    was set from the Date header of a certificate-checked HTTPS request (time-fallback);
#    NTP keeps trying and replaces it.
: "${LG7200_TIMESYNC_MARK:=/var/run/lg7200-time-synced}"
: "${LG7200_TIMEAPPROX_MARK:=/var/run/lg7200-time-approx}"
lg7200_time_synced() {
	[ -e "$LG7200_TIMESYNC_MARK" ] || [ -e "$LG7200_TIMEAPPROX_MARK" ]
}

# ntp | approximate | none
lg7200_time_state() {
	if [ -e "$LG7200_TIMESYNC_MARK" ]; then echo ntp
	elif [ -e "$LG7200_TIMEAPPROX_MARK" ]; then echo approximate
	else echo none; fi
}

# Atomic write: never leave a half-written file after a power cut (P2).
# usage: some_command | lg7200_write_atomic /path/file
lg7200_write_atomic() {
	local tmp="$1.tmp.$$"
	cat > "$tmp" && sync "$tmp" 2>/dev/null; mv -f "$tmp" "$1"
}

# ---------------------------------------------------------------- shared event list (11.4)
# One list for every Virox alert (homenet new device / limits / network-watch, B9 lines, ...),
# readable through `virox.events`. One line per event, tab-separated:
#   id  time  synced  level  source  code  key=value;key=value
# Kept on flash (events are rare), newest last, at most LG7200_EVENTS_MAX lines.
: "${LG7200_EVENTS:=/etc/lg7200/events}"
: "${LG7200_EVENTS_MAX:=200}"

# usage: lg7200_event_add <source> <code> <info|warn|danger> [key=value ...]
lg7200_event_add() {
	local src="$1" code="$2" level="$3" kv="" a now synced id lock seq
	shift 3 2>/dev/null || return 1
	echo "$src$code" | grep -qE '^[a-z0-9_]+$' || return 1
	case "$level" in info|warn|danger) ;; *) return 1 ;; esac
	for a in "$@"; do
		case "$a" in
			*=*) ;;
			*) return 1 ;;
		esac
		# no tabs, newlines or separators inside values
		a="$(printf '%s' "$a" | tr '\t\n;' '   ')"
		kv="${kv:+$kv;}$a"
	done
	now="$(date +%s)"
	synced=0; lg7200_time_synced && synced=1
	mkdir -p "$(dirname "$LG7200_EVENTS")"
	lock="$LG7200_EVENTS.lock"
	(
		flock 9
		# monotonic sequence (the line count stops growing at the cap, so it cannot be the id)
		seq=$(( $(cat "$LG7200_EVENTS.seq" 2>/dev/null || echo 0) + 1 ))
		echo "$seq" | lg7200_write_atomic "$LG7200_EVENTS.seq"
		id="$now-$seq"
		{
			[ -f "$LG7200_EVENTS" ] && tail -n $((LG7200_EVENTS_MAX - 1)) "$LG7200_EVENTS"
			printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$now" "$synced" "$level" "$src" "$code" "$kv"
		} | lg7200_write_atomic "$LG7200_EVENTS"
	) 9>"$lock"
}

# ---------------------------------------------------------------- IPv4 helpers

lg7200_ip2int() {
	local oldifs="$IFS" x
	echo "$1" | grep -qE '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || return 1
	IFS=.; set -- $1; IFS="$oldifs"
	for x in "$@"; do [ "$x" -le 255 ] || return 1; done
	echo $(( ($1 << 24) | ($2 << 16) | ($3 << 8) | $4 ))
}

# 0 when the two networks (address/prefix each) overlap
lg7200_nets_overlap() {
	local a="${1%/*}" pa="${1#*/}" b="${2%/*}" pb="${2#*/}" ia ib p mask
	[ "$pa" = "$1" ] && pa=24
	[ "$pb" = "$2" ] && pb=24
	ia="$(lg7200_ip2int "$a")" || return 1
	ib="$(lg7200_ip2int "$b")" || return 1
	p=$pa; [ "$pb" -lt "$p" ] && p=$pb
	mask=$(( p == 0 ? 0 : (0xffffffff << (32 - p)) & 0xffffffff ))
	[ $((ia & mask)) -eq $((ib & mask)) ]
}

# ---------------------------------------------------------------- Wi-Fi key

# 12 characters, alphabet without look-alikes (no 0 O o 1 l I i B 8)
lg7200_wifi_key() {
	tr -dc 'abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ2345679' < "$LG7200_RANDOM" | head -c 12
}

# LAN = base, WAN = base+1, 2.4 GHz = base+2, 5 GHz = base+3 (PLAN 7.1)
lg7200_port_mac() {
	local base off
	base="$(lg7200_base_mac | cut -d' ' -f1)" || return 1
	case "$1" in
		lan) off=0 ;; wan) off=1 ;; phy0|wlan2g) off=2 ;; phy1|wlan5g) off=3 ;;
		*) return 1 ;;
	esac
	lg7200_mac_add "$base" "$off"
}
