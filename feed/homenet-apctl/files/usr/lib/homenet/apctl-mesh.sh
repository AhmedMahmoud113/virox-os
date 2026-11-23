# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
# Wireless access points (BUILD-PLAN 15.4 item 1), sourced by /usr/libexec/homenet/apctl.
#
# Virox to Virox: a hidden 802.11s mesh on 5 GHz (WPA3-SAE, its own random key made by the main
# router and sent to each access point when it joins), bridged into the LAN on every unit, so
# homenet, lines, usage, controls and the map work as with a cable. Several hops: the mesh itself
# forwards (HWMP, below the bridge). Cable preferred: the LAN bridge runs STP on every unit (the
# main router is the root), the mesh port costs more than any cable port, so a unit with a cable
# uses the cable and keeps the mesh blocked; cable pulled = STP opens the mesh port within seconds;
# cable back = back to the cable. The mesh is on while the main router has access points (or the
# join window is open); every unit uses the main router's 5 GHz channel.
#
# Joining without a cable: the admin opens a join window on the main router (10 minutes): an open
# network "Virox-Join" (own subnet 10.73.73.0/24, isolated, only DHCP and the router's own web
# port answer). A new unit in access point mode with no cable finds it, connects as a client, and
# says hello there (the same hello / approve as by cable); once approved, its first sync gives it
# the mesh; the join client is removed and the unit reaches the main router through the mesh.
#
# Under a router that is not a Virox: the unit can repeat that router's Wi-Fi (the admin picks the
# network and types its password on the unit): first as a 4-address client in the LAN bridge
# (works with routers that support it), otherwise through relayd (works with any router; its
# devices may be counted together, the page says so).

MESH_SEC=vx_mesh
JOIN_SEC=vx_join
JOIN_SSID=Virox-Join
JOIN_NET=10.73.73.1
MESH_COST=200

band_radio() { uci -q show wireless | sed -n "s/^wireless\.\([^.]*\)\.band='$1'$/\1/p" | head -n 1; }
# the phy of a band (phy0 / phy1): the one that has its first channel
band_phy() { iw phy 2>/dev/null | awk -v f="$([ "$1" = 5g ] && echo 5180 || echo 2412)" '/^Wiphy/ { p = $2 } index($0, "* " f ".0 MHz") || index($0, "* " f " MHz") { if (p != "") { print p; exit } }'; }
lan_brdev() { echo "br-lan"; }
lan_dev_sec() { uci -q show network | sed -n "s/^network\.\([^.]*\)\.name='br-lan'$/\1/p" | head -n 1; }
mesh_ifname() { ubus call network.wireless status 2>/dev/null | jsonfilter -e "@.*.interfaces[@.section=\"$MESH_SEC\"].ifname" 2>/dev/null | head -n 1; }
# n random bytes as hex (busybox here has no od or hexdump): sha256 of fresh random bytes
rnd_hex() { head -c 64 /dev/urandom | sha256sum | cut -c1-$(( $1 * 2 )); }

# set <section.option> <value>; prints 1 when it changed
uset() { [ "$(uci -q get "$1")" = "$2" ] && return 1; uci set "$1=$2"; return 0; }

# the mesh interface on 5 GHz; 0 = changed
mesh_set() { # <radio> <mesh id> <key>
	local c=1
	[ "$(uci -q get wireless.$MESH_SEC)" = wifi-iface ] || { uci set wireless.$MESH_SEC=wifi-iface; c=0; }
	uset wireless.$MESH_SEC.device "$1" && c=0
	uset wireless.$MESH_SEC.mode mesh && c=0
	uset wireless.$MESH_SEC.mesh_id "$2" && c=0
	uset wireless.$MESH_SEC.encryption sae && c=0
	uset wireless.$MESH_SEC.key "$3" && c=0
	uset wireless.$MESH_SEC.network lan && c=0
	uset wireless.$MESH_SEC.mesh_fwding 1 && c=0
	uset wireless.$MESH_SEC.mesh_rssi_threshold 0 && c=0
	uset wireless.$MESH_SEC.disabled 0 && c=0
	return $c
}
mesh_del() { [ "$(uci -q get wireless.$MESH_SEC)" = wifi-iface ] || return 1; uci delete wireless.$MESH_SEC; return 0; }

# STP on the LAN bridge (fast timers); the main router is the root (priority 4096)
stp_set() { # <priority>
	local s c=1
	s="$(lan_dev_sec)"; [ -n "$s" ] || return 1
	uset network.$s.stp 1 && c=0
	uset network.$s.priority "$1" && c=0
	uset network.$s.forward_delay 4 && c=0
	uset network.$s.hello_time 1 && c=0
	uset network.$s.max_age 6 && c=0
	return $c
}
stp_off() {
	local s; s="$(lan_dev_sec)"; [ -n "$s" ] || return 1
	[ "$(uci -q get network.$s.stp)" = 1 ] || return 1
	for o in stp priority forward_delay hello_time max_age; do uci -q delete network.$s.$o; done
	return 0
}
# the mesh port costs more than a cable port (Linux: 4 at 1 Gbit/s, 19 at 100 Mbit/s)
mesh_cost() {
	local m; m="$(mesh_ifname)"; [ -n "$m" ] || return 0
	[ "$(cat /sys/class/net/$m/brport/path_cost 2>/dev/null)" = "$MESH_COST" ] || bridge link set dev "$m" cost "$MESH_COST" 2>/dev/null
}

# the main router's 5 GHz channel and width now (the mesh needs one channel for every unit)
main_channel() {
	local r5 ch
	r5="$(band_radio 5g)"; [ -n "$r5" ] || return 1
	ch="$(iw dev 2>/dev/null | awk '/channel/ { for (i = 1; i <= NF; i++) if ($i == "channel" && $(i + 1) >= 36) { print $(i + 1); exit } }')"
	[ -n "$ch" ] || { ch="$(uci -q get wireless.$r5.channel)"; [ "$ch" = auto ] && ch=36; }
	echo "$ch $(uci -q get wireless.$r5.htmode || echo VHT80)"
}

join_open() { [ "$(date +%s)" -lt "$(uci -q get apctl.main.join_until || echo 0)" ]; }

# main router: the open join network while the window is open; 0 = changed
join_set() { # <radio>
	local c=1
	[ "$(uci -q get network.vxjoin)" = interface ] || {
		uci -q batch <<-EOF
			set network.vxjoin=interface
			set network.vxjoin.proto=static
			set network.vxjoin.ipaddr=$JOIN_NET
			set network.vxjoin.netmask=255.255.255.0
			set dhcp.vxjoin=dhcp
			set dhcp.vxjoin.interface=vxjoin
			set dhcp.vxjoin.start=10
			set dhcp.vxjoin.limit=40
			set dhcp.vxjoin.leasetime=10m
			set firewall.vxjoin=zone
			set firewall.vxjoin.name=vxjoin
			add_list firewall.vxjoin.network=vxjoin
			set firewall.vxjoin.input=REJECT
			set firewall.vxjoin.output=ACCEPT
			set firewall.vxjoin.forward=REJECT
			set firewall.vxjoin_dhcp=rule
			set firewall.vxjoin_dhcp.name='Virox join DHCP'
			set firewall.vxjoin_dhcp.src=vxjoin
			set firewall.vxjoin_dhcp.proto=udp
			set firewall.vxjoin_dhcp.dest_port=67
			set firewall.vxjoin_dhcp.target=ACCEPT
			set firewall.vxjoin_web=rule
			set firewall.vxjoin_web.name='Virox join'
			set firewall.vxjoin_web.src=vxjoin
			set firewall.vxjoin_web.proto=tcp
			set firewall.vxjoin_web.dest_port=443
			set firewall.vxjoin_web.target=ACCEPT
		EOF
		c=0
	}
	[ "$(uci -q get wireless.$JOIN_SEC)" = wifi-iface ] || { uci set wireless.$JOIN_SEC=wifi-iface; c=0; }
	uset wireless.$JOIN_SEC.device "$1" && c=0
	uset wireless.$JOIN_SEC.mode ap && c=0
	uset wireless.$JOIN_SEC.ssid "$JOIN_SSID" && c=0
	uset wireless.$JOIN_SEC.encryption none && c=0
	uset wireless.$JOIN_SEC.network vxjoin && c=0
	uset wireless.$JOIN_SEC.isolate 1 && c=0
	uset wireless.$JOIN_SEC.disabled 0 && c=0
	return $c
}
join_del() {
	local c=1
	[ "$(uci -q get wireless.$JOIN_SEC)" = wifi-iface ] && { uci delete wireless.$JOIN_SEC; c=0; }
	[ "$(uci -q get network.vxjoin)" = interface ] && {
		uci -q delete network.vxjoin; uci -q delete dhcp.vxjoin
		uci -q delete firewall.vxjoin; uci -q delete firewall.vxjoin_dhcp; uci -q delete firewall.vxjoin_web
		c=0
	}
	return $c
}

# main router (or lead), every minute: the mesh while there are access points or a join window
m_mesh() {
	local want=0 r5 id key wch=1 nch=1
	r5="$(band_radio 5g)"
	# off unless the admin turned it on (it broke the 5 GHz network of the GAPM-7200 main router, 2026-11-22)
	if [ -n "$r5" ] && [ "$(uci -q get apctl.main.mesh)" = 1 ]; then
		{ [ -n "$(uci -q show apctl | grep '=ap$')" ] || join_open; } && want=1
	fi
	if [ "$want" = 1 ]; then
		id="$(uci -q get apctl.main.mesh_id)"; key="$(uci -q get apctl.main.mesh_key)"
		if [ -z "$id" ] || [ -z "$key" ]; then
			id="vx-$(rnd_hex 4)"; key="$(rnd_hex 16)"
			uci set apctl.main.mesh_id="$id"; uci set apctl.main.mesh_key="$key"; uci commit apctl
		fi
		mesh_set "$r5" "$id" "$key" && wch=0
		stp_set 4096 && nch=0
	else
		mesh_del && wch=0
		# STP stays only while a mesh exists on this unit
		stp_off && nch=0
	fi
	if [ -n "$r5" ] && [ "$want" = 1 ] && join_open; then join_set "$r5" && { wch=0; nch=0; }
	else join_del && { wch=0; nch=0; }; fi
	if [ "$nch" = 0 ]; then
		uci commit network; uci commit dhcp; uci commit firewall
		/etc/init.d/network reload; /etc/init.d/firewall reload >/dev/null 2>&1; /etc/init.d/dnsmasq reload >/dev/null 2>&1
	fi
	if [ "$wch" = 0 ]; then uci commit wireless; wifi reload >/dev/null 2>&1; sleep 5; fi
	mesh_cost
}

# access point: the mesh of the main router from the sync answer; a join client goes when it is in
a_mesh() {
	local r="$1" id key ch ht r5 wch=1 nch=1
	r5="$(band_radio 5g)"; [ -n "$r5" ] || return 0
	id="$(echo "$r" | jsonfilter -e '@.mesh.id' 2>/dev/null)"
	if [ -n "$id" ]; then
		key="$(echo "$r" | jsonfilter -e '@.mesh.key')"; ch="$(echo "$r" | jsonfilter -e '@.mesh.channel')"; ht="$(echo "$r" | jsonfilter -e '@.mesh.htmode')"
		# one channel for the whole mesh, at once (not at night: the link needs it)
		[ -n "$ch" ] && uset wireless.$r5.channel "$ch" && wch=0
		[ -n "$ht" ] && uset wireless.$r5.htmode "$ht" && wch=0
		mesh_set "$r5" "$id" "$key" && wch=0
		stp_set 32768 && nch=0
		if [ "$(uci -q get wireless.vx_joinsta)" = wifi-iface ]; then
			uci delete wireless.vx_joinsta; uci -q delete network.vxjoinc; wch=0; nch=0
			logger -t homenet "access point: joined by Wi-Fi; the join client is removed, the mesh link is used"
		fi
	else
		mesh_del && wch=0
		stp_off && nch=0
	fi
	[ "$nch" = 0 ] && { uci commit network; /etc/init.d/network reload; }
	[ "$wch" = 0 ] && { uci commit wireless; wifi reload >/dev/null 2>&1; sleep 5; }
	mesh_cost
	return 0
}

# access point not joined and without a cable: find the join network of a main router and connect
# to it as a client (a_hello then says hello through it: its DHCP gives the default route)
a_join_wireless() {
	local r5 ifc
	[ "$(my_mode)" = ap ] || return 0
	[ -n "$(uci -q get apctl.agent.token)" ] && return 0
	[ "$(uci -q get wireless.vx_joinsta)" = wifi-iface ] && return 0
	# a cable to a router gives an address first: only after 2 minutes without any
	[ "$(cut -d. -f1 /proc/uptime)" -gt 120 ] || return 0
	ip -4 route show default | grep -q . && return 0
	[ -n "$(uci -q get wireless.vx_repeat)" ] && return 0
	r5="$(band_radio 5g)"; [ -n "$r5" ] || return 0
	ifc="$(ubus call network.wireless status 2>/dev/null | jsonfilter -e "@.$r5.interfaces[0].ifname" 2>/dev/null)"
	[ -n "$ifc" ] || return 0
	iw dev "$ifc" scan ap-force 2>/dev/null | grep -q "SSID: $JOIN_SSID$" || return 0
	logger -t homenet "access point: no cable; a Virox join network is in reach, connecting to it"
	uci -q batch <<-EOF
		set network.vxjoinc=interface
		set network.vxjoinc.proto=dhcp
		set wireless.vx_joinsta=wifi-iface
		set wireless.vx_joinsta.device=$r5
		set wireless.vx_joinsta.mode=sta
		set wireless.vx_joinsta.ssid=$JOIN_SSID
		set wireless.vx_joinsta.encryption=none
		set wireless.vx_joinsta.network=vxjoinc
	EOF
	uci commit network; uci commit wireless
	/etc/init.d/network reload; wifi reload >/dev/null 2>&1
}

# access point: how it reaches the main router now, for the map and the page:
# "cable" | "wireless <signal dBm>" | "none"
a_uplink() {
	local m rp pn sig
	m="$(mesh_ifname)"
	if [ -n "$m" ] && [ "$(cat /sys/class/net/br-lan/bridge/stp_state 2>/dev/null)" != 0 ]; then
		rp="$(cat /sys/class/net/br-lan/bridge/root_port 2>/dev/null)"; pn="$(cat /sys/class/net/$m/brport/port_no 2>/dev/null)"
		if [ -n "$rp" ] && [ -n "$pn" ] && [ "$((rp))" = "$((pn))" ] && [ "$((rp))" != 0 ]; then
			sig="$(iw dev "$m" station dump 2>/dev/null | awk '$1 == "signal:" { if (b == "" || $2 > b) b = $2 } END { print b }')"
			echo "wireless ${sig:-0}"; return 0
		fi
	fi
	[ -n "$(uci -q get wireless.vx_repeat)" ] && { sig="$(iw dev "$(ubus call network.wireless status 2>/dev/null | jsonfilter -e "@.*.interfaces[@.section=\"vx_repeat\"].ifname" | head -n 1)" link 2>/dev/null | awk '$1 == "signal:" { print $2 }')"; echo "repeat ${sig:-0}"; return 0; }
	ip -4 route show default | grep -q . && echo cable || echo none
}

# ------------------------------------------------------------------ Wi-Fi client (both images)
# Owner 2026-11-22: "internet from Wi-Fi" on 5 GHz kept searching, found no networks for a long time,
# or did not stay connected. Found in the code: the scan used the first interface of the radio,
# which is the client itself once one exists (busy searching: the scan failed); the client always
# used sae-mixed; the 5 GHz radio was held to 36-48 (and wifi-power put a fixed channel above 64
# back to automatic at every boot), so the radio fought the channel of the router above; the night
# schedule switched the whole radio off, client included. Now the security type and the channel
# come from the scan, the radio follows the router above while a client is on it (its own channel
# settings are kept in lg7200_saved_* and put back when the client goes), and the state of the
# client is read from wpa_supplicant's and hostapd's log lines.

# scan_parse <band>: iw scan output -> "band<TAB>signal<TAB>channel<TAB>security<TAB>ssid" per network;
# security: none | sae | sae-mixed | psk2 | psk | wep | eap
scan_parse() {
	awk -v b="$1" -F '\n' '
		function out() {
			if (s == "") return
			e = "none"
			if (rsn) { e = (sae && psk) ? "sae-mixed" : (sae ? "sae" : (psk ? "psk2" : "eap")) }
			else if (wpa) e = "psk"
			else if (priv) e = "wep"
			printf "%s\t%d\t%d\t%s\t%s\n", b, sig, ch, e, s
		}
		/^BSS / { out(); s = ""; sig = 0; ch = 0; rsn = 0; wpa = 0; sae = 0; psk = 0; priv = 0; blk = ""; next }
		/^\tfreq: / { f = $0; sub(/.*freq: /, "", f); f = int(f)
			ch = (f == 2484) ? 14 : (f < 3000 ? (f - 2407) / 5 : (f - 5000) / 5) }
		/^\tsignal: / { v = $0; sub(/.*signal: /, "", v); sig = int(v) }
		/^\tSSID: / { s = $0; sub(/^\tSSID: /, "", s) }
		/^\tcapability: / { if (index($0, "Privacy")) priv = 1 }
		/^\tRSN:/ { rsn = 1; blk = "rsn" }
		/^\tWPA:/ { wpa = 1; blk = "wpa" }
		/Authentication suites:/ { if (blk == "rsn") { if (index($0, "SAE")) sae = 1; if (index($0, "PSK")) psk = 1 } }
		END { out() }'
}
# the networks one band of this unit can hear. An active scan from a home (AP) interface of that
# radio; when that fails (a client on the radio is searching, the driver answers busy) the results
# the radio already has (scan dump: the client's own scans); with no interface at all, a short-lived
# client interface scans
band_scan() { # <band>
	local r ph ifc t
	r="$(band_radio "$1")"; [ -n "$r" ] || return 0
	ph="$(band_phy "$1")"
	t="$(ubus call network.wireless status 2>/dev/null)"
	ifc="$(echo "$t" | jsonfilter -e "@.$r.interfaces[@.config.mode=\"ap\"].ifname" 2>/dev/null | head -n 1)"
	[ -n "$ifc" ] || ifc="$(echo "$t" | jsonfilter -e "@.$r.interfaces[*].ifname" 2>/dev/null | head -n 1)"
	if [ -n "$ifc" ]; then
		{ iw dev "$ifc" scan ap-force 2>/dev/null || iw dev "$ifc" scan dump 2>/dev/null; } | scan_parse "$1"
	elif [ -n "$ph" ] && iw phy "$ph" interface add vxscan0 type managed 2>/dev/null; then
		ip link set vxscan0 up 2>/dev/null; sleep 1
		iw dev vxscan0 scan 2>/dev/null | scan_parse "$1"
		iw dev vxscan0 del 2>/dev/null
	fi
}
# the strongest network of that name on that band: "signal<TAB>channel<TAB>security"
find_net() { # <band> <ssid>
	band_scan "$1" | awk -F '\t' -v s="$2" '$5 == s' | sort -t "$(printf '\t')" -k2 -n -r | head -n 1 | cut -f2-4
}
# the radio follows the channel of the router above while a client is on it. Prints notes for the
# page: "dfs" (a channel with a radar check: the home network on that band waits about a minute after
# each start) and/or "high" (above 64: phones set for Egypt may not see the 5 GHz home network).
# Returns 1 when the channel may not be used here.
radio_follow() { # <radio> <channel>
	local r="$1" ch="$2" o
	[ -n "$ch" ] && [ "$ch" -gt 0 ] 2>/dev/null || return 0
	case "$(uci -q get wireless.$r.band)" in
		2g) [ "$ch" -le 11 ] || return 1 ;;
		5g) case "$ch" in 36|40|44|48|52|56|60|64|100|104|108|112|116|120|124|128|132|136|140|144|149|153|157|161|165) ;; *) return 1 ;; esac ;;
	esac
	if [ -z "$(uci -q get wireless.$r.lg7200_saved)" ]; then
		uci set wireless.$r.lg7200_saved=1
		for o in channel channels acs_exclude_dfs; do
			uci -q get wireless.$r.$o >/dev/null && uci set "wireless.$r.lg7200_saved_$o=$(uci -q get wireless.$r.$o)"
		done
	fi
	uci set wireless.$r.channel="$ch"
	uci -q delete wireless.$r.channels
	uci -q delete wireless.$r.acs_exclude_dfs
	[ "$ch" -ge 52 ] && [ "$ch" -le 144 ] && echo dfs
	[ "$ch" -gt 64 ] && echo high
	return 0
}
# the radio's own channel settings back, when no client is left on it
radio_restore() { # <radio>
	local r="$1" o v
	[ "$(uci -q get wireless.$r.lg7200_saved)" = 1 ] || return 0
	uci -q show wireless | grep -q "^wireless\.[^.]*\.device='$r'$" && for s in $(uci -q show wireless | sed -n "s/^wireless\.\([^.]*\)\.device='$r'$/\1/p"); do
		[ "$(uci -q get wireless.$s.mode)" = sta ] && return 0
	done
	for o in channel channels acs_exclude_dfs; do
		v="$(uci -q get wireless.$r.lg7200_saved_$o)"
		if [ -n "$v" ]; then uci set "wireless.$r.$o=$v"; else uci -q delete wireless.$r.$o; fi
		uci -q delete wireless.$r.lg7200_saved_$o
	done
	uci -q delete wireless.$r.lg7200_saved
}
# client_set <section> <security> <key>: the security of the client interface
client_sec() {
	case "$2" in
		none) uci set wireless.$1.encryption=none; uci -q delete wireless.$1.key ;;
		*) uci set wireless.$1.encryption="$2"; uci set wireless.$1.key="$3" ;;
	esac
}
# security for the client from the scan (unknown with a key: WPA2, which every router accepts;
# a mixed WPA2/WPA3 router is joined with WPA2 too, WPA2 only (owner 2026-11-22: WPA2/WPA3 mixed kept the iPhone and many devices out))
client_enc() { # <scanned security> <key>
	case "$1" in
		none|'') [ -n "$2" ] && echo psk2+ccmp || echo none ;;
		sae) echo sae ;;
		sae-mixed) echo psk2+ccmp ;;
		psk2) echo psk2+ccmp ;;
		psk) echo psk-mixed ;;
		*) echo "$1" ;;
	esac
}
# the state of a client interface: connected | address | connecting | channel_check |
# wrong_password | not_found (the newest log line of its wpa_supplicant, and hostapd's radar check)
client_state() { # <section> <has address 0|1>
	local ifc ph l
	ifc="$(ubus call network.wireless status 2>/dev/null | jsonfilter -e "@.*.interfaces[@.section=\"$1\"].ifname" 2>/dev/null | head -n 1)"
	if [ -n "$ifc" ] && iw dev "$ifc" link 2>/dev/null | grep -q '^Connected'; then
		[ "$2" = 1 ] && echo connected || echo address; return 0
	fi
	ph="${ifc%%-*}"
	l="$(logread 2>/dev/null | grep -E "${ph:-none}-ap[0-9]*: DFS-CAC-|DFS-CAC-" | tail -n 1)"
	case "$l" in *DFS-CAC-START*) echo channel_check; return 0 ;; esac
	[ -n "$ifc" ] || { echo connecting; return 0; }
	l="$(logread 2>/dev/null | grep -F "$ifc:" | grep -E 'WRONG_KEY|4-Way Handshake failed|pre-shared key may be incorrect|NETWORK-NOT-FOUND|CTRL-EVENT-CONNECTED|Trying to associate' | tail -n 1)"
	case "$l" in
		*WRONG_KEY*|*"4-Way Handshake failed"*|*"may be incorrect"*) echo wrong_password ;;
		*NETWORK-NOT-FOUND*) echo not_found ;;
		*) echo connecting ;;
	esac
}

# ------------------------------------------------------------------ internet from Wi-Fi (router)
# Owner 2026-11-22: a Virox router can take its internet from another router's Wi-Fi (the band the
# admin picks: that radio becomes a client too, its home network, if any, follows the other
# router's channel). The link is network "wan3" (dhcp, firewall zone wan, metric 20 so a cable on
# the WAN port stays first): homenet counts every network named wan, wan2, wan3... as a line, so
# usage, outages and the internet state include it.
#   wifiwan <2g|5g> <ssid> <key>   wifiwan-off   wifiwan-status: "ssid band up|down ip signal clash"
a_wifiwan() {
	local band="$1" ssid="$2" key="$3" r z net sig ch sec notes
	[ "$(my_mode)" = router ] || { echo "ERR not_router"; return 0; }
	r="$(band_radio "$band")"; [ -n "$r" ] || { echo "ERR no_wifi"; return 0; }
	net="$(find_net "$band" "$ssid")"
	ch="$(echo "$net" | cut -f2)"; sec="$(echo "$net" | cut -f3)"
	case "$sec" in wep|eap) echo "ERR unsupported_security"; return 0 ;; esac
	[ -n "$sec" ] && [ "$sec" != none ] && [ -z "$key" ] && { echo "ERR key_needed"; return 0; }
	uci -q delete wireless.vx_wifiwan
	notes="$(radio_follow "$r" "$ch")" || { uci revert wireless; echo "ERR channel_not_allowed"; return 0; }
	uci -q batch <<-EOF
		set wireless.$r.disabled=0
		set wireless.vx_wifiwan=wifi-iface
		set wireless.vx_wifiwan.device=$r
		set wireless.vx_wifiwan.mode=sta
		set wireless.vx_wifiwan.network=wan3
		set network.wan3=interface
		set network.wan3.proto=dhcp
		set network.wan3.metric=20
	EOF
	uci set wireless.vx_wifiwan.ssid="$ssid"
	client_sec vx_wifiwan "$(client_enc "$sec" "$key")" "$key"
	z="$(uci -q show firewall | sed -n "s/^firewall\.\([^.]*\)\.name='wan'$/\1/p" | head -n 1)"
	[ -n "$z" ] && ! uci -q get "firewall.$z.network" | grep -qw wan3 && uci add_list "firewall.$z.network=wan3"
	uci commit wireless; uci commit network; uci commit firewall
	/etc/init.d/network reload; /etc/init.d/firewall reload >/dev/null 2>&1; wifi reload >/dev/null 2>&1
	echo "OK $(echo $notes)"
}
a_wifiwan_off() {
	local z r
	r="$(uci -q get wireless.vx_wifiwan.device)"
	uci -q delete wireless.vx_wifiwan; uci -q delete network.wan3
	[ -n "$r" ] && radio_restore "$r"
	z="$(uci -q show firewall | sed -n "s/^firewall\.\([^.]*\)\.name='wan'$/\1/p" | head -n 1)"
	[ -n "$z" ] && uci -q del_list "firewall.$z.network=wan3"
	uci commit wireless; uci commit network; uci commit firewall
	/etc/init.d/network reload; /etc/init.d/firewall reload >/dev/null 2>&1; wifi reload >/dev/null 2>&1
	echo OK
}
# ssid band up|down ip signal clash(1 = the other router gives addresses of this router's own range) state
a_wifiwan_status() {
	local ssid band st ip ifc sig lan clash=0
	[ "$(uci -q get wireless.vx_wifiwan)" = wifi-iface ] || { echo "none"; return 0; }
	ssid="$(uci -q get wireless.vx_wifiwan.ssid)"; band="$(uci -q get "wireless.$(uci -q get wireless.vx_wifiwan.device).band")"
	st="$(ubus call network.interface.wan3 status 2>/dev/null)"
	ip="$(echo "$st" | jsonfilter -e '@["ipv4-address"][0].address' 2>/dev/null)"
	ifc="$(ubus call network.wireless status 2>/dev/null | jsonfilter -e '@.*.interfaces[@.section="vx_wifiwan"].ifname' 2>/dev/null | head -n 1)"
	sig="$([ -n "$ifc" ] && iw dev "$ifc" link 2>/dev/null | awk '/signal:/ { print int($2) }')"
	lan="$(uci -q get network.lan.ipaddr)"
	[ -n "$ip" ] && [ -n "$lan" ] && [ "${ip%.*}" = "${lan%.*}" ] && clash=1
	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$ssid" "$band" "$([ "$(echo "$st" | jsonfilter -e '@.up' 2>/dev/null)" = true ] && [ -n "$ip" ] && echo up || echo down)" "${ip:--}" "${sig:--}" "$clash" \
		"$(client_state vx_wifiwan "$([ -n "$ip" ] && echo 1 || echo 0)")"
}

# ------------------------------------------------------------------ repeater (not a Virox above)
# repeat <band> <ssid> <key>: join that router's Wi-Fi as a client and repeat it
a_repeat() {
	local band="$1" ssid="$2" key="$3" r net ch sec notes
	r="$(band_radio "$band")"; [ -n "$r" ] || { echo "ERR no_wifi"; return 0; }
	[ "$(my_mode)" = ap ] || { echo "ERR not_ap"; return 0; }
	net="$(find_net "$band" "$ssid")"
	ch="$(echo "$net" | cut -f2)"; sec="$(echo "$net" | cut -f3)"
	case "$sec" in wep|eap) echo "ERR unsupported_security"; return 0 ;; esac
	[ -n "$sec" ] && [ "$sec" != none ] && [ -z "$key" ] && { echo "ERR key_needed"; return 0; }
	uci -q delete wireless.vx_repeat; uci -q delete network.vxrelay; uci -q delete network.wwan
	notes="$(radio_follow "$r" "$ch")" || { uci revert wireless; echo "ERR channel_not_allowed"; return 0; }
	uci -q batch <<-EOF
		set wireless.vx_repeat=wifi-iface
		set wireless.vx_repeat.device=$r
		set wireless.vx_repeat.mode=sta
		set wireless.vx_repeat.network=lan
		set wireless.vx_repeat.wds=1
		set apctl.repeat=repeat
		set apctl.repeat.started=$(date +%s)
		set apctl.repeat.mode=wds
	EOF
	uci set wireless.vx_repeat.ssid="$ssid"
	client_sec vx_repeat "$(client_enc "$sec" "$key")" "$key"
	uci commit wireless; uci commit apctl
	wifi reload >/dev/null 2>&1
	echo "OK $(echo $notes)"
}
a_repeat_off() {
	local r
	r="$(uci -q get wireless.vx_repeat.device)"
	uci -q delete wireless.vx_repeat; uci -q delete network.vxrelay; uci -q delete network.wwan; uci -q delete apctl.repeat
	[ -n "$r" ] && radio_restore "$r"
	uci commit wireless; uci commit network; uci commit apctl
	/etc/init.d/network reload; wifi reload >/dev/null 2>&1
	echo OK
}
# every minute: 4-address first; if the router above does not take it within 90 s (no address on
# the LAN through it), relayd instead
a_repeat_check() {
	local st now
	[ "$(uci -q get wireless.vx_repeat)" = wifi-iface ] || return 0
	[ "$(uci -q get apctl.repeat.mode)" = wds ] || return 0
	now="$(date +%s)"; st="$(uci -q get apctl.repeat.started || echo 0)"
	ip -4 route show default | grep -q . && return 0
	[ $((now - st)) -gt 90 ] || return 0
	command -v relayd >/dev/null 2>&1 || [ -x /usr/sbin/relayd ] || return 0
	logger -t homenet "repeater: the router above does not take a 4-address client; relayd instead"
	uci -q batch <<-EOF
		set wireless.vx_repeat.network=wwan
		delete wireless.vx_repeat.wds
		set network.wwan=interface
		set network.wwan.proto=dhcp
		set network.vxrelay=interface
		set network.vxrelay.proto=relay
		add_list network.vxrelay.network=lan
		add_list network.vxrelay.network=wwan
		set network.vxrelay.forward_dhcp=1
		set network.vxrelay.forward_bcast=1
		set apctl.repeat.mode=relay
	EOF
	uci commit wireless; uci commit network; uci commit apctl
	/etc/init.d/network reload; wifi reload >/dev/null 2>&1
}
# the networks in reach, for the repeater and internet-from-Wi-Fi pages, strongest first:
# band<TAB>signal<TAB>channel<TAB>security<TAB>ssid
a_scan() {
	local band
	for band in 2g 5g; do band_scan $band; done |
		awk -F '\t' '$5 != "" && $5 != "Virox-Join" && $5 != "Virox-Setup"' | sort -t "$(printf '\t')" -k2 -n -r |
		awk -F '\t' '!seen[$1 "\t" $5]++' | head -n 30
}
