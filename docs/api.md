# Virox API

BUILD-PLAN section 11. Every action of the Virox web pages is a method of our own rpcd/ubus
objects; the LuCI pages are clients of these methods, and a future mobile app will be another
client. JSON in, JSON out.

- API version: **3** (whole numbers only since 2, B7.3e; methods of section 15 added in 3; returned by `virox.info info` and `virox.setup status`).
- Transport: ubus, reached over HTTP through LuCI's JSON-RPC endpoint (`/ubus`) with a session
  id. Nothing is exposed on the WAN side.
- Login: only through the LuCI login, `POST /cgi-bin/luci` with `luci_username` and
  `luci_password`; the `sysauth_http` (or `sysauth_https`) cookie it sets is the session id for
  `/ubus`. `session login` over `/ubus` is refused for everyone (BUILD-PLAN 12.3: rpcd does not log
  failed logins, so the login guard could not count them). Wrong passwords are counted per
  address: after 5 in 5 minutes that address is locked out for 5 minutes (HTTP shows the lockout
  page, HTTPS is refused, `/ubus` included).
- Roles: `admin` = the root login (all methods below, unless marked otherwise). `user` = an rpcd
  login with ACL `homenet-user`, tied to one person (B7.3a): it may call only `virox.homenet me`
  and `virox.info info` (see "User logins"). Every `virox.setup` method is admin-only, and a
  session without the ACL is refused (tested, `tools/vm-tests/b6b-api.sh`, `b7n`).
- Errors are **codes**, never sentences; each client translates them.
- Source: `feed/luci-app-lg7200-setup/root/usr/share/rpcd/ucode/virox-setup.uc`,
  ACL: `.../rpcd/acl.d/luci-app-lg7200-setup.json`.

## virox.info

### `info` — any logged-in session
Result: `{ api: 1, product: "Virox", version: "0.9.0-rc1", base: "OpenWrt 25.12.6", source: "<url>", clock: "ntp"|"approximate"|"none" }`

`clock` (B7.5b): `ntp` = synced; `approximate` = no NTP answer for 10 minutes, so the clock was
set from the `Date` header of a certificate-checked HTTPS request (NTP keeps trying and replaces
it); `none` = not usable yet (usage waits). Page wording: / /.

## virox.setup

### `status` — admin
Result:
```json
{ "api": 1, "has_password": false, "setup_done": false, "mode": "router",
  "mac_source": "factory|override|generated", "lan_moved": "<old> <new> <unix time>" | "",
  "lan_ip": "192.168.72.1", "has_wan": true, "storage": "volume|file",
  "unit_ssid": "Virox-1A2B", "unit_key": "<12 characters>" }
```
`unit_ssid` / `unit_key` are the per-unit defaults (what a factory reset brings back).

### `validate { settings }` — admin
Checks settings, changes nothing. Result: `{ ok: bool, errors: { <field>: <code> } }`.

`settings`:
```json
{ "mode": "router" | "ap",
  "wan": { "proto": "dhcp" | "pppoe" | "static",
           "username": "", "password": "",                       // pppoe
           "ipaddr": "", "netmask": "", "gateway": "", "dns": "" }, // static (dns optional)
  "ssid": "1-32 bytes", "key": "8-63 printable ASCII" }
```
`wan` is only read in `router` mode.

| field | codes |
|---|---|
| `settings` | `missing` |
| `mode`, `wan.proto` | `invalid` |
| `wan.username`, `wan.password` | `required` |
| `wan.ipaddr`, `wan.netmask`, `wan.gateway`, `wan.dns` | `invalid_ipv4` |
| `ssid` | `length_1_32` |
| `key` | `wpa_key_8_63` |

### `plan { settings }` — admin
Validates like `validate`; if valid, returns the configuration changes as a list of generic uci
operations. The backend decides everything (which interfaces, bridge ports, DHCP and firewall
changes each mode needs); the client only executes the list.

Result: `{ ok: true, errors: {}, ops: [ ... ] }`, each op one of
```json
{ "op": "set",    "config": "network", "section": "lan", "values": { "proto": "static" } }
{ "op": "delete", "config": "network", "section": "lan", "option": "netmask" }
{ "op": "delete", "config": "dhcp",    "section": "lan", "options": [ "ignore", "ra" ] }
{ "op": "delete", "config": "network", "section": "lan_fb" }          // whole section
{ "op": "add",    "config": "network", "type": "interface", "name": "lan_fb" }
```
Client sequence (what the LuCI page and the VM test do):
1. `virox.setup set_password` (first setup only),
2. `virox.setup plan`,
3. for each op: `uci set` / `uci delete` / `uci add` with the client's `ubus_rpc_session`
   (changes stay in that session),
4. `uci apply { rollback: true, timeout: 60 }`, then `uci confirm` from the same address
   within the timeout; without confirmation the router returns to the old settings by itself.

Why not stage inside the method: rpcd serves both this plugin and the `uci` object, so a
plugin calling `uci` over ubus deadlocks rpcd (found in the VM test).

Mode effects (applied through the ops):
- `router`: LAN static on its address, WAN enabled with the chosen protocol, DHCP server on.
- `ap`: WAN port added to the LAN bridge, LAN gets its address by DHCP from the main router,
  fallback interface `lan_fb` keeps the old address (so the browser can confirm the change),
  WAN interfaces disabled, DHCP/RA server off, `lan_fb` in the LAN firewall zone.
- Wi-Fi: every access-point interface gets `ssid`, `key`, `encryption sae-mixed`.
- `lg7200.state.mode` and `lg7200.state.setup_done = 1`.

### `set_password { password }` — admin
Sets the root password through `passwd`'s standard input only (never on a command line or in a
log), then re-evaluates the SSH gate (SSH opens once a password exists).
Result: `{ result: true }` or `{ result: false, error: "password_short" | "passwd_failed" }`.
Rule: at least 6 characters (owner 2026-11-21; was 10), no line breaks.

### `factory_reset { confirm }` — admin (owner 2026-11-22)
Back to a new router: `confirm` must be `"RESET"` (error `confirm_needed`); refused while an update
is installing (`update_running`). → `{ result, rebooting }`; 3 s later `firstboot -y` and a restart.
Erased: settings, people, usage history, passwords, family logins. Kept: the unit's own data
(unitcfg: MAC, Wi-Fi name and key); the setup network opens again for 60 minutes. Page: Settings,
Router and sign-out,, after a confirmation.

### `set_language { lang }` — admin
`lang` = `ar` | `en`. Sets and commits the LuCI language at once (no network risk).
Result: `{ result: true }` or `{ result: false, error: "invalid" }`.

### `set_theme { look, mode, accent }` — admin
BUILD-PLAN 10b item 4. Every argument is optional; only the given ones change.
`look` = `argon` (luci-theme-virox, the default) | `vantage` (luci-theme-virox-vantage; error
`not_installed` without it); `mode` = `light` (default) | `dark` | `normal` (follows the device);
`accent` = `#rrggbb` (default `#2563eb`; the dark variant is derived from it). Stored in
`lg7200.ui.mode` / `lg7200.ui.accent` and `luci.main.mediaurlbase`; pages use it from the next
load. Result: `{ result: true }` or `{ result: false, error: "invalid" | "not_installed" }`.

### `theme` — admin
`{ look, mode, accent, looks: [ "argon", "vantage"? ] }`: the current look settings and the looks
installed on this router.

### `notices` — admin
Alerts as data (section 11.4); the LuCI header shows the same list.
Result: `{ notices: [ { code, level: "warn"|"info", dismissable, ... } ] }`, codes:
- `mac_generated` (warn, not dismissable): the unit runs on a generated MAC; ask for the label MAC (`virox.provision set_label_mac`).
- `lan_moved` (info, dismissable): `{ from, to, time }` the LAN moved off a WAN that used the same subnet.
- `storage_file` (info): NAND unit without the provisioning volume yet: a factory reset makes a new Wi-Fi key until the next update.

### `dismiss_notice { code }` — admin
`{ result: true }` or `{ result: false, error: "not_dismissable" }`.

## virox.provision (B6 item 12; used by `tools/provision.sh`)

### `info` — admin
`{ api, factory_mac, factory_sha256, base_mac, mac_source, label_mac, unit_ssid, unit_key, storage: "volume"|"file", nand: bool }`

### `set_label_mac { mac }` — admin
Stores the label MAC as the unit's base MAC override; applied by the boot step before the network
starts (only the MACs, never the other first-boot defaults).
`{ result: true, mac, applies: "after_reboot" }` or `{ result: false, error: "invalid_mac" | "store_failed" }`.

### `self_upgrade { path }` — admin — HARDWARE-UNTESTED
Runs `sysupgrade -P -n <path>` (creates the provisioning volume, F16). The image must already be in
`/tmp` (LuCI `cgi-upload`) and pass `sysupgrade -T`.
`{ result: true, rebooting: true }` or errors `invalid_path`, `no_nand`, `image_rejected`.

## virox.gaming (P4)

### `get` — admin
`{ installed, enabled, leases: [ { proto, ext_port, ip, int_port, expires, description } ] }` (who opened which port).

### `set { enabled }` — admin
Switches miniupnpd on (enable + restart) or off (stop + disable). `{ result, enabled }` or `error: "not_installed"`.

## virox.wifi (section 13.8)

### `status` — admin
`{ radios: [ { ifname, band: "2g"|"5g", ssid, channel, freq, width, busy_percent,
  client_count, clients: [ { mac, signal, label: "excellent"|"good"|"weak", tx_mbit } ] } ] }`.
Read with `iw` in a child process (the `iwinfo` ubus object lives in rpcd itself).
Also `split`: true when the two bands have separate names; `hidden_2g`, `hidden_5g`: the home
network name of that band is hidden; `power_high`: the stronger signal is on.

### `split { on }` — admin
BUILD-PLAN 13.1. `on: false` (default): one name on both bands, usteer moves capable devices to
5 GHz. `on: true`: the 5 GHz network gets the same name with `-5G` (cut to 32 bytes); the wizard
keeps that when the name changes. Stored in `lg7200.wifi.split`; the radios restart (seconds).
Result: `{ result: true }` or `{ result: false, error: "no_wifi" }`.

Night-only channel choice (13.7): `/usr/libexec/lg7200/wifi-night` runs at 03:20 and restarts the
radios (ACS picks again) only when no device is connected and a radio has `channel auto`.

### `rescan` — admin
"Choose the best channel now": restarts the radios so automatic channel selection runs again.

### `hidden { band, on }` — admin
Hides (or shows again) the home network name of one band, `band` = `2g` | `5g`, or of both
(`both`: one name for both bands is one network on the page, owner 2026-11-21: one checkbox per
network); the guest network is not touched (`virox.homenet guest_hidden`). Devices that know the
network still connect.
Stored in `lg7200.wifi.hidden_2g` / `hidden_5g`; access points follow at their next contact.
Errors `invalid_band`, `no_wifi`.

### `power { high }` — admin
The stronger 2.4 GHz signal (owner 2026-11-20 and 2026-11-21, BUILD-PLAN 13 and 15.2: 25 dBm on
2.4 GHz). `high: true` puts the radios on the US rules for 2.4 GHz; 5 GHz stays on the Egyptian
rules (see "Section 15" below: channels 36-64, 23 dBm on 36-48, 20 dBm on 52-64). `false` puts the
unit's country back (`lg7200.product.country`, EG). Above the legal limit in Egypt on 2.4 GHz: the
page says so, the owner chooses; off at first boot in the one public image (15.8); the owner turns it on once.
Stored in `lg7200.wifi.power` (`high` | `normal`); access points follow (`sync` →
`wifi.power_high`). Error `no_wifi`.

## virox.update (B8.1, section 12.5; package `lg7200-update`)

Plugin `/usr/share/rpcd/ucode/virox-update.uc`, ACL `lg7200-update`. The work is done by
`/usr/sbin/lg7200-update` (`check`, `download`, `install`, `daily`, `status`).

### `status` — admin
`{ current, latest, available, changelog: { ar, en } | null, checked, error, downloading,
installing, busy }`. `available` is set only for a newer version for this board, from a
`latest.json` whose usign signature was verified with a key in `/etc/lg7200/update-keys`.

### `check` — admin, `install` — admin
Both run in the background (downloads can take longer than rpcd allows a call); the page follows
`status`. `install` = check + download + size and sha256 + `sysupgrade -T` + `sysupgrade` with
settings kept (the router restarts; event `system/update_installing`). Errors in `status.error`:
`clock_not_synced` (HTTPS needs the time; the updater waits instead of skipping certificate
checks), `download_failed`, `bad_signature`, `bad_latest`, `wrong_board`, `bad_image` (size or
sha256; the file is deleted), `image_refused` (`sysupgrade -T`), `no_space`, `no_update`,
`no_update_server`; `busy` as the call's own error. The daily check (cron, once a day after the
clock sync) raises `system/update_available` once per version; it sends nothing about the user.

`latest.json` (written by `tools/release.sh`, signed with `usign -S`):
`{ product, version, boards: [ board_name ], image: { file, sha256, size }, changelog: { ar, en } }`.

## virox.support (section 12 items 7-9, P7, B7.3e item 7; package `lg7200-support`)

Plugin `/usr/share/rpcd/ucode/virox-support.uc`, ACL `lg7200-support` (also `cgi-io` download of
`/tmp/virox-backup.tar.gz` and upload to `/tmp/virox-restore.tar.gz`). The scripts in
`/usr/libexec/lg7200/` read files and system tools only, never a `virox.*` object.

### `report` — admin
`{ result, name, text }`: the help report (`help-report`): versions, uptime, memory and storage,
line and Wi-Fi state, home-network counts, the last 50 alerts, recent errors and kernel lines.
Removed: passwords, keys, MAC and IP addresses, device / person / login / DHCP host names,
network names, PPPoE user names, reservations (the words come from the router's own settings;
MAC and IP patterns everywhere). At most 512 KB.

### `backup_create` — admin
`{ result, path, size, name }`; the page downloads `path` through `cgi-download`. The file holds
`/etc/config/{network,wireless,dhcp,firewall,system,homenet,rpcd,luci,uhttpd,dropbear,upnpd,sqm,usteer}`,
lg7200's own choices, `/etc/homenet/data`, the event list, and the `/etc/passwd` / `/etc/shadow`
lines of root and the family logins (`vx_*`). It contains the Wi-Fi password.

### `backup_check { path }`, `backup_restore { path }` — admin
`path` is the upload `/tmp/virox-restore.tar.gz` or a nightly copy on a USB stick. Check:
`{ result, version, date }`. Restore puts everything back, keeps THIS unit's identity (MACs in the
network settings, radio paths, unit state, unit storage, SSH host keys), runs the settings
migrations from the backup's schema version up, writes `system/settings_restored`, and restarts
(`restarting: true`). Errors: `invalid_path`, `no_file`, `not_a_backup`, `unsafe_backup` (absolute
or `../` names, links, devices).

### `backup_list` — admin
`{ backups: [ { path, size, date, kind, from } ] }`: the nightly copies (03:30, P7) on a plugged-in
USB stick, the last 14 kept (`kind: "usb"`), and the copies made on the router itself before an
update (`kind: "update"`, `from` = the version they were made on; owner 2026-11-22):
`lg7200-update install` runs `backup preupdate <from> <to>` first, into `/etc/lg7200/pre-update`
(kept by sysupgrade, the last 2). Both can be given to `backup_check` / `backup_restore`.

### Remote help — removed
Remote control and remote help were removed by the owner (BUILD-PLAN 15.9 item 1); updates fix
problems instead. `virox.support` has no `remote_*` methods and there is no `virox.remote`.

## virox.homenet (B7; package `homenet`)

Plugin: `/usr/share/rpcd/ucode/virox-homenet.uc`, ACL `/usr/share/rpcd/acl.d/homenet.json`.
Writes run `/usr/libexec/homenet/devices` (arguments quoted by the plugin), under homenet's save
and device locks, so a 5-minute save or a newly seen device never meets a half-written file.

### `devices` — admin
`{ today, cycle: { start, next }, devices: [ { id, name, person, person_name, created,
  online, macs: [ { mac, first_seen, last_seen, hostname, online, ip, link: "wifi"|"lan"|"" } ],
  usage: { today_up, today_down, cycle_up, cycle_down } } ] }` (bytes; usage as of the last
5-minute save). Online = an associated Wi-Fi station, or a LAN neighbour entry that is not
FAILED/INCOMPLETE (the same rule as the old homenet page).

`devices` also returns `unknown: { today_up, today_down, cycle_up, cycle_down }` (B7.5d): usage
that could not be given to a device. Bytes of an address that has no
device yet wait as "unattributed" and are handed to the device as soon as the address belongs
to one (every save and every DHCP lease); after an hour without an owner they are booked as
unknown. Every WAN byte is in a device or in `unknown`.

Alert `homenet/usage_mismatch` (warn, `day`, `booked`, `wan`): the daily check (00:15, for the
day before) found that the bytes booked to devices + unknown differ by more than 2 % from the
WAN totals counted by the router's own counters. The page text:. A usage history write that would lose bytes is refused
(`data_write_refused`, `file=usage-history.tsv`).

### `live` — admin (owner 2026-11-22: who uses the internet now)
→ `{ devices: [ { id, down_bps, up_bps } ], down_bps, up_bps, seconds }`: bytes per second of each
device at this moment, biggest first, from the per-address counters of the usage count (router:
table inet homenet; access point: bridge homenet_ap). `id` is a device id, or `ip:<address>` for an
address without a device yet. Measured from the previous call when it was 1-20 s ago, otherwise over
1 s (`seconds`). Home:, refreshed every 5 s.

### `quality { minutes }` — admin (owner 2026-11-22: line quality over the day)
→ `{ minutes, lines: [ { line, now, down_kbit, up_kbit, buckets: [ { time, ping_ms, worst_ms,
jitter_ms, loss_pct, down_kbit, up_kbit } ] } ] }`. `homenet/quality run` (cron, every minute) pings
the first of `lines.main.probe_hosts` (else 1.1.1.1) 5 times through each line's own device (two
lines on: line 1 and 2; else `wan`; an access point: the internet as it reaches it) and keeps the
average, worst, jitter (mean change between answers), loss and the line rate of that minute, 24 hours
in RAM. `minutes` = bucket size, 5-240 (default 30); `ping_ms` null = no answer at all. `down_kbit` /
`up_kbit` of the line = its measured speed (`lines.lineN`), null when never measured. Internet, Ping
and games: the chart of the day, the times the ping was high (≥ 100 ms, jitter ≥ 30 ms or loss ≥ 3 %)
and why: the house filled the line (≥ 70 % of its speed) or the line itself was weak.

### `outages { month }` — admin (owner 2026-11-22: a report for the internet company)
→ `{ month, outages: [ { start, end, seconds, line, reason } ], count, seconds, months }`. `month` =
YYYY-MM (default this month). Rows from `homenet/watch` (`/etc/homenet/data/outages.tsv`, one row per
finished outage, the last 1000): `reason` = what the line was during the outage (`no_internet`: the
modem answered, the internet did not; `no_modem`; `wan_down`). `months` = the months that have rows.
Home, Internet connection: "Report for the internet company" (print, or copy as text). Error:
`invalid_month`.

### `night_use { target }` — admin (owner 2026-11-22: was the kid online at night?)
→ `{ target, days: [ { date, minutes, hours: [ { hour, minutes } ] } ] }`, newest first, the last 14
mornings. `homenet/controls` (every minute, 00:00-05:59) gives a device one minute in that hour when
it moved more than `homenet.main.active_kb` KB in it (the "active minute" of the daily time). A person
(`pN`) adds up its devices, at most 60 minutes per hour. Device sheet: "Internet at night". Error:
`unknown_target`.

### `wifi_test` — admin and family logins (owner 2026-11-22: is it the Wi-Fi or the internet?)
→ `{ result, download, size, upload, seconds }`: opens a test on this unit for 3 minutes
(`homenet/wifitest open`): `download` = a 32 MB file of zeros in RAM (`/virox-speed/test.bin`),
`upload` = `/cgi-bin/virox-upload`, which takes up to 64 MB by POST and throws it away (it answers only
while a test is open). The client times both itself (the page: 8 s down, 16 MB up) and compares the
result with the measured line speed. Nothing goes to the internet. Errors: `no_memory` (under 80 MB
free), `serve_failed`. Internet page, tab "Wi-Fi or internet?"; the phone app later.

### `priority_set { target, on }` — admin (owner 2026-11-22: one device or person first)
`controls priority <target> 0|1` (`/etc/homenet/data/priority.tsv`, at most 3: error `too_many`). On the
main router, `controls apply` keeps table `inet homenet_prio`: connections a chosen MAC opens from the LAN
get ct mark bits 31-26 = AF41 and bit 24; their upload leaves with DSCP AF41 (cake diffserv4 Video tin),
their download gets the same tin from the mark (`homenet/lines`: tc `action ctinfo dscp 0xfc000000
0x01000000` before the ifb, kmod-sched-ctinfo; without it the download is as before). Small UDP packets of
games and calls of every device still get EF (Voice tin, homenet_qos, later hook). Needs a shaped line.
`devices` gives `priority` and `priority_via_person`.

`devices` also gives, per device, `maker` (from the first three bytes of a MAC,
`/usr/share/homenet/makers.tsv`, tools/makers-table.py) and `private_mac` (every MAC of the device
is a "locally administered" private address a phone made up), and per MAC `maker` and `private`.
A device without a name shows "<maker> device" or "Phone or tablet (private address)".

### `people` — admin
`{ people: [ { id, name, devices: [ device ids ] } ] }`.

### `set_name { id, name }`, `set_person { id, person }` — admin
Name: any text (Arabic too), control characters removed, at most 40 characters, `""` clears.
`person: ""` = nobody. Errors: `unknown_device`, `name_too_long`, `unknown_person`.

### `person_add { name }` → `{ result, id }`, `person_rename { id, name }`, `person_delete { id }` — admin
Ids `p1, p2, …` are never reused. Deleting a person keeps its devices (without a person).
Errors: `name_empty`, `name_taken`, `name_too_long`, `unknown_person`.

### `link { mac, id }` — admin
The MAC belongs to device `id` from now on (a phone that changed its random MAC). If its old
device has no other MAC, that device is merged into `id` (usage moves, nothing counted twice).
Errors: `invalid_mac`, `unknown_device`.

### `merge { from, into }` — admin
Everything of `from` (MACs, usage per day, waiting usage, name/person where `into` has none)
moves to `into`; `from` is removed. Errors: `same_device`, `unknown_device`.

### `device_forget { id }` — admin
Removes a device from the list (owner 2026-11-20): its MACs, addresses and settings go; its usage
stays in the totals, as the row `removed` ("Removed devices"), so no total changes. A device that
comes back is a new device. Error `unknown_device`.

### `usage_range { target, from, to }` — admin
Usage of a period (`from`/`to` = `YYYY-MM-DD`, at most 366 days apart) for the whole house
(`target ""`), one device (`d..`), a person (`p..`, all their devices), `router`, `guest` or
`unknown` → `{ from, to, target, total: { up, down }, days: [ { day, up, down } ], lines,
devices: [ { id, up, down, lines } ] }` (bytes). With two lines (B9): `lines: [ { line, name, up,
down } ]` and in each device `lines: { "1": { up, down }, "2": { up, down } }` (usage per line,
from `usage-lines.tsv`; what has no device yet is in the total only); `lines: null` with one
line. Errors `invalid_range`, `unknown_target`.

### Controls (B7 feature 2, BUILD-PLAN B7.3c) — admin
`target` is a device id (`dN`: every MAC of the device) or a person id (`pN`: every device of
the person). A control starts at once: the device's MACs are dropped on the way out, its
current addresses on the way in, and its open connections are deleted from conntrack, so a
running video or download stops immediately. Scripts: `/usr/libexec/homenet/controls`.
- `block { target }`, `unblock { target }`
- `pause { target, minutes }` (1 – 1440; ends by itself, checked every minute), `resume { target }`
- `controls` → `{ policy, controls: [ { target, kind: "block"|"pause", until } ], held: [ { id, since } ] }`
- `devices` shows per device `blocked` (true/false), `paused_until` (epoch or null), `held`.

Errors: `unknown_target`, `invalid_minutes`.

### Schedules (B7 feature 3) — admin
`schedules` → `{ now: "<dow> HH:MM", schedules: [ { id, target, days, start, end, enabled, label, active } ] }`.
`schedule_add { target, days, start, end, label }` → `{ result, id }`; `schedule_update { id, target, days,
start, end, label }`; `schedule_enable { id, enabled }`; `schedule_remove { id }`. Days are digits 0–6
(0 = Sunday), times local `HH:MM`; `end <= start` runs past midnight (the part after midnight
belongs to the day it started). A schedule cuts like a block (open connections deleted when it
starts). At most 64. Nothing before the clock is synced (P2). `devices` shows `scheduled_off`.
Errors: `unknown_target`, `invalid_days`, `invalid_time`, `same_time`, `too_many`, `unknown_schedule`.

### Daily internet time (B7 feature 4) — admin
`timelimits` → `{ today, timelimits: [ { target, minutes, extra_today, used_today, left, up } ] }`;
`timelimit_set { target, minutes }` (0 removes, at most 1440). A minute counts only when the
device (or the person's devices together) moved more than `active_kb` KB in it (a setting,
default 40, B7.3d). Used up → cut until local
midnight; alert `homenet/time_limit_reached` once a day. `devices` shows `time` (the device's own
limit, else its person's). Errors: `unknown_target`, `invalid_minutes`.

Extra time (owner 2026-11-22): `timelimit_extra { target, minutes }` (admin; 5-720, today only,
added to what was given before today; needs a set clock, `clock_not_synced`). A person's extra also
counts for each of its devices that has a limit of its own; `left` and `up` include it. Event
`time_extra_given` (target=, minutes=); the «used up» alert may come again the same day.
`me_ask_time { minutes }` (**user role**: a family login asks for 30 or 60 minutes) → event
`time_request` (person=, minutes=) that Home shows with (calls `timelimit_extra` for the
person) and; one request per person in 10 minutes (`too_soon`), `not_a_user` for any
other login.

`devices` also returns `router`: the router's own WAN traffic (NTP, DNS for the devices, updates),
shown (B7.5d).

### New-devices policy — admin
- `set_policy { new_devices: "allow"|"ask" }`. `allow` (default): a new MAC is a new device
  with internet. `ask` ("ask me first"): only MACs of known, approved devices may go out
  through the WAN, so a new random MAC has no internet from its first packet. Its device is
  **held** and an alert `homenet/new_device_held` (warn, `device_id`, `mac`) goes to the event
  list; the page offers "approve" and "this is device X" (`link`). Switching to `ask` first
  records every device present, so the admin's own computer is never cut. `kids_set` answers
  `suggest_policy: "ask"` while the policy is `allow`.
- `approve { id }`: a held device gets internet. Errors: `not_held`, `invalid_policy`.

### Record protection (B7.3c)
Every write of `devices.tsv`, `people.tsv` and `device-macs.tsv` goes through one check: a write
that would drop a record is refused unless the call is an explicit delete of exactly those
records (a merge drops only `from`, a person delete only that person). A refusal is logged
and written as `homenet/data_write_refused` (danger). Before every accepted change, the three
files are copied **together** to `/etc/homenet/data/prev/`: one consistent version, the state
just before the last change (copying each file alone mixed moments, so a device could come
back without its MAC; found by the VM test).
- `restore_previous` — admin: puts that version back, all three files at once (the current
  ones are kept in `/etc/homenet/data/bad/`), event `homenet/data_restored`. Error `no_previous`.

| error | Message on the page |
|---|---|
| `unknown_target` | This device or person no longer exists. |
| `invalid_minutes` | This duration is not allowed. |
| `not_held` | This device is not waiting for approval. |
| `invalid_policy` | Unknown choice. |
| `write_refused` | An error was stopped before it could delete data. Nothing changed. |
| `no_previous` | There is no earlier version to go back to. |

| error | Message on the page |
|---|---|
| `unknown_device` | This device no longer exists (it may have been merged or removed). |
| `unknown_person` | This person no longer exists. |
| `name_empty` | Type a name. |
| `name_too_long` | The name is too long: at most 40 characters. |
| `name_taken` | There is already a person with this name. |
| `same_device` | This is the same device. |

### Units (B7.3e item 6)
Every number in this API is a **whole number** (rpcd checks argument types strictly; a decimal
such as `1.5` is refused by rpcd itself). Speeds are in **kbit/s**, volumes in **MB**
(1 MB = 1048576 bytes), byte counters in bytes. The pages show GB everywhere with one factor:
**1 GB = 1024 MB** (= 1073741824 bytes, like the old homenet), and convert themselves.

### Settings — admin
`settings` → `{ package_mb, renew_day, package_warn, active_kb, new_devices }`.
`settings_set { package_mb?, renew_day?, package_warn?, active_kb? }`, any subset:
`package_mb` 0-102400000 (0 = no package), `renew_day` 1-31, `package_warn` 50-100 (%),
`active_kb` 1-10000: a minute of daily internet time counts only above this many KB (default
40, B7.3d; an idle phone's background sync stays below it). A change of the package or the
renewal day judges the package again at once and may alert again. (A config from before
API 2 has `package_gb`; it is read as GB of 1024 MB until the next `settings_set`.)

| error | Message on the page |
|---|---|
| `invalid_package` | Type the package size in GB (0 to 100000). |
| `invalid_renew_day` | The renewal day is a day of the month, 1 to 31. |
| `invalid_warn` | The warning is 50 % to 100 %. |
| `invalid_active_kb` | Use 1 to 10000 KB. |

### Speed limits (B7 feature 5) — admin
`speed_limits` → `{ speed_limits: [ { target, down_kbit, up_kbit } ] }`;
`speed_limit_set { target, down_kbit, up_kbit }` (0 = none that way, else 100-1000000 kbit/s;
both 0 removes). One limiter per direction for all MACs of the device, or **shared** by all
devices of the person; a device limit and its person's limit both apply. Download is limited
after counting (bytes the ISP already delivered are booked, B7.5d), upload before. `devices`
shows `speed` (own) and `person_speed`. Errors: `unknown_target`, `invalid_speed`.

### Usage limits and the package (B7 feature 6) — admin
- `limits` → `{ cycle, limits: [ { target, mb, bytes, warn, used, up } ] }`;
  `limit_set { target, mb, warn }` (`mb` 0 removes, else 1-102400000; `warn` 50-100, default
  80). Usage is the bytes booked in the current billing cycle (a person: all its devices). At
  `warn` % alert `homenet/usage_limit_warn`, at 100 % `homenet/usage_limit_reached` (both warn
  level, `target`, `used`, `limit`), once per cycle each; the device (or all the person's
  devices) is cut until the next cycle or a higher limit. Usage is folded every 5 minutes, so a
  limit acts within about 5 minutes. Nothing before the clock is synced (P2). `devices` shows
  `limit` and `person_limit`. Errors: `unknown_target`, `invalid_limit`,
  `invalid_warn`.
- `usage` → `{ cycle, package_mb, package_warn, used, router_used, remaining, percent,
  calibration: null | { time, offset, router_used_then }, days: [ { day, up, down, wire_ratio } ] }`:
  the whole house (devices, the router itself, unknown). Since B7.3e item 5 every booking is
  scaled to the line's **wire-level IP bytes** (per frame, before GRO merged them), so devices +
  router + unknown add up to what the line carried; `wire_ratio: { up, down }` per day is wire /
  booked before scaling (diagnosis only). Scaling uses the day ratio once the day has 4 MB booked, before that the ratio of the latest day with 4 MB (none on the first day); always bounded to 1.00-1.05. `used` = `router_used` + the calibration
  offset of this cycle. With a package, alerts `homenet/package_warn` (warn) and
  `homenet/package_used_up` (danger, `used`, `package`) once per cycle; nobody is cut (the ISP
  does that).
- `package_calibrate { remaining_mb }` (B7.3e item 5c, from B9 R8): the admin types what the
  ISP shows as remaining; from then on, in this billing cycle, the package continues from that
  figure (`used` = package − typed remaining + what was used since). The page shows the router's
  own figure (`router_used`) next to it. A new cycle starts without calibration. Event
  `homenet/package_calibrated` (info). Errors: `invalid_remaining`,
  `no_package`, `clock_not_synced`.

### Kids mode (B7 feature 7, P8) — admin
- `kids` → `{ targets: [ id ], blocklist: [ domain ], policy }`.
- `kids_set { target, on }` → `{ result, suggest_policy? }`: `suggest_policy: "ask"` while the
  new-devices policy is `allow` (a child could come back with a new random MAC, B7.3c).
- `kids_block { domain }` / `kids_unblock { domain }`: sites blocked for kids devices only
  (a typed address like `https://www.site.com/x` becomes `site.com`).
- What a kids device gets: Google / Bing / DuckDuckGo in safe mode and YouTube in strict
  Restricted Mode; the kids list blocked; **P8**: its DNS to any server is answered by the router,
  DNS-over-TLS (853) and the public DNS-over-HTTPS servers (443, TCP and QUIC;
  `/usr/share/homenet/doh-servers.txt`) are dropped, and the DoH host names plus the canaries that
  make Firefox and iPhones (iCloud Private Relay) switch their own encrypted DNS off do not exist
  (`doh-names.txt`). IPv6 is off on the LAN while homenet runs (P1). Turning it on cuts the
  device's open connections (B7.3c). `devices` shows `kids` and `kids_via_person`.
- Errors: `unknown_target`, `invalid_value`, `invalid_domain`,
  `too_many` (500 sites).

Sites opened by kids devices (owner 2026-11-22): `kid_sites { target, day }` → `{ day, days, on,
sites: [ { site, label, first, last, count } ] }` for a device, or a person's devices together; `day`
YYYY-MM-DD (default today, `invalid_day`), `days` = the days that have rows (7 kept). Only devices in
kids mode are logged: their own dnsmasq (homenet/dns) logs the names asked into
/var/log/homenet-kids (root and dnsmasq only), `homenet/kidsites` (cron, every 2 minutes) turns
them into rows: the app of the site catalog (label) or the registrable name, background names left
out, never what was seen. `kids` returns `kids_log`; `kids_log_set { on }` switches it (default on;
off deletes the lists).

### Site locks (B7 feature 8) — admin
- `site_catalog` → `{ sites: [ { id, group, label, domains } ] }` (71 sites: social, video,
  streaming, music, games, shopping; owner 2026-11-22 added PUBG Mobile, Free Fire, Fortnite, Call
  of Duty, eFootball, EA SPORTS FC, the Supercell games and Mobile Legends).
- `site_locks` → `{ site_locks: [ { id, target, until, always, minutes_left, sites, domain } ] }`
  (running only; a lock without an end has `until` 0, `always` true, `minutes_left` null).
- `site_lock { target, minutes, sites: [ id ], domain }` → `{ result, id }`: 5-1440 minutes, or 0 =
  until it is removed (owner 2026-11-22); catalog ids and/or one typed domain; a timed lock ends by
  itself. `site_unlock { id }` ends it now.
- The locked names do not exist for the device, their current addresses are unreachable for it
  (looked up every minute, kept 3 minutes, so a name the device cached does not help), the P8
  rules of kids mode apply, and its open connections are cut when the lock starts. A kids device
  with a YouTube lock gets YouTube blocked, not Restricted Mode. `devices` shows `site_locks` (ids).
- Errors: `unknown_target`, `invalid_minutes` (not 0 and not 5-1440), `unknown_site`,
  `nothing_to_lock`, `invalid_domain`, `too_many` (64), `unknown_lock`.

### Whole-house filter (B7 feature 9) — admin
- `filter` → `{ lists: { ads|adult|gambling|bypass: { on, state: "ok"|"failed"|"none", time,
  domains } }, safesearch, youtube, domains, built, builds, error, blocked: [ domain ], allowed: [ domain ] }`.
- `filter_set { ads, adult, gambling, bypass, safesearch, youtube, ads_size? }` (booleans;
  `ads_size` `light` | `normal` (default, HaGeZi "multi") | `pro` | `pro.plus`, the page names
  them in plain words with their number of names). **Memory guard (B7.3e item 2):** before a list
  goes to dnsmasq and again after dnsmasq has loaded it, `MemAvailable` is checked; if it would
  fall or has fallen below 64 MB, the next smaller ads list is used (down to none) and
  `homenet/filter_memory` (warn: `from`, `to`, `mem_kb`, `when`) goes to the event list; the next
  full update (daily, or a settings change) tries the chosen size again. `filter` returns
  `ads_size`, `ads_effective` and `memory_kb`. Lists are fetched
  **at runtime** (HaGeZi "wildcard onlydomains", base address `homenet.filter.base_url`), kept in
  RAM, fetched again after a boot, daily at 04:20, and every 10 minutes while one is missing.
  `bypass` = encrypted-DNS / VPN / proxy services (the old "anti-bypass" option).
  `safesearch` / `youtube`: safe search / YouTube Restricted for every device.
- `filter_block|filter_unblock|filter_allow|filter_unallow { domain }`: own lists; the allow
  list wins (also for subdomains). The router always keeps its package servers, NTP servers,
  openwrt.org and tailscale.
- `filter_update`: fetch again now.
- Writes return at once; the build (sorting the lists, restarting dnsmasq) runs in the
  background, because with big lists it can take longer than rpcd allows a call (30 s). The page
  watches `built` / `error`. A download that fails keeps the list it had (`state: "failed"`).
  If dnsmasq does not come back with a new list, the previous state is put back and
  `homenet/filter_failed` (danger) goes to the event list (B7.5b: never lose DNS and DHCP).
- Errors: `invalid_value`, `invalid_size`, `invalid_domain`, `too_many` (2000 own entries).

### Wake a computer (B7 feature 10) — admin
`wake { id, mac? }` → `{ result, sent: [ mac ] }`: a Wake-on-LAN packet (etherwake, broadcast on
the LAN) for every MAC of the device, or only `mac`. Errors: `unknown_device`, `unknown_mac`,
`invalid_mac`, `send_failed`.

### Computers (owner 2026-11-21) — admin
The computers page shows computers only.
`computers` → `{ computers: [ { device, name, online, why, pc, pc_online, cable } ], others: [ { device,
name, online } ] }`: `why` = `program` (the Virox program on it reported its MAC, `pc` = its
virox.pc id), `chosen` (the admin said so) or `name` (its name or DHCP host name says computer:
Windows DESKTOP-/LAPTOP-, a Mac, a laptop model, Linux...); `others` = every other device.
`computer_set { device, on }`: the admin says a device is a computer (`on`) or is not one
(also for one found by its name); uci `homenet.computers` lists `device` and `not`. Error
`unknown_device`.
At a time: `wakes` → `{ wakes: [ { id, device, time, days, action, enabled } ] }`; `wake_add { id,
time, days, action }` with `action` = `wake` (default, Wake-on-LAN) | `shutdown` | `sleep` (the
last two through the Virox program, `virox.pc command`, at that minute; refused with `no_program`
when no program is linked to that device). Named sections `wake<n>`; `wake_remove { id }`. Errors
`unknown_device`, `invalid_time`, `invalid_days`, `invalid_action`, `no_program`, `too_many` (32).
Not from outside the house: remote control was removed (15.9.1).

### Network watch (B7 feature 11) — admin
`network` → `{ lines: [ { line, state, since, gateway, checked } ], events: [ { time, kind:
"down"|"up", line, reason, seconds } ] }`. Every minute, per WAN line: `up` (gateway and
internet answer), `no_internet`, `no_modem`, `wan_down`. A change counts after 2 checks in a row; alerts
`homenet/internet_down` (warn, `line`, `reason`) and `homenet/internet_up` (info, `line`,
`seconds`). Internet targets: `homenet.watch.targets` (default 1.1.1.1 8.8.8.8 9.9.9.9).

### User logins (B7.3a, section 11.2)
- admin: `users` → `{ users: [ { username, person, person_name } ] }`;
  `user_add { username, password, person }`; `user_password { username, password }`;
  `user_delete { username }` (also ends the user's open sessions).
- A user login is an rpcd login with ACL `homenet-user`, tied to one person. Its password is the
  shadow password of a system user `vx_<username>` without a shell, set through `passwd`'s
  stdin: it is never on a command line, in uci or in a log. The root password is never shared.
- user (and nothing else): `me` → `{ username, person, person_name, today, cycle, devices: [ { id,
  name, online, usage, blocked, paused_until, scheduled_off, time, limit, kids } ] }`, the
  person's own devices only (filtered here, never in the page); `virox.info info`. Every other
  method is refused by rpcd (tested over ubus and over HTTP `/ubus`).
- Errors: `invalid_username` (3-16 of a-z 0-9 _, starting with a letter; not a system name),
  `invalid_password` (8-64 characters), `unknown_person`, `user_exists`, `unknown_user`,
  `passwd_failed`, `write_failed`, `not_a_user` (`me` called by an admin or without a session).

### `reservations` — admin
`{ reservations: [ { mac, ip, name, section } ] }` (DHCP static leases, one row per MAC).

### `reserve { mac, ip, name, replace }` — admin
Gives a device a fixed address. Everything is checked **before** anything is written (B7.5b: a
duplicate makes dnsmasq refuse to start and then no device gets an address). Then dnsmasq is
reloaded through `dhcp-guard apply`, which puts the last working DHCP settings back if dnsmasq
still fails. `{ result: true, mac, ip }` or `{ result: false, error, ... }`:

| error | extra | Message on the page |
|---|---|---|
| `invalid_mac` | | This device number (MAC) is not valid. |
| `invalid_ip` | | Type a valid address. |
| `invalid_name` | | The name is too long or has a sign that is not allowed. |
| `ip_outside_lan` | | This address is not in the home network. |
| `ip_router` | | This is the address of the router itself. |
| `ip_network` | | This address is reserved for the network. |
| `ip_reserved` | `by` | This address is reserved for another device. |
| `mac_reserved` | `ip` | This device already has a fixed address. |
| `ip_in_use` | `by` | Another device uses this address now. |
| `no_lan` | | The address of this router could not be read. |
| `dhcp_restored` | | This setting stopped address handout, so the last working settings were put back. |
| `dhcp_down` | | Address handout is stopped and there are no working settings to go back to. |

`replace: true` changes the existing reservation of that MAC instead of refusing it.

### `unreserve { mac }` — admin
`{ result: true }` or `invalid_mac`, `not_reserved`, `dhcp_restored`, `dhcp_down`.

### Alerts written to the shared event list (B7.5b)
- `network` / `dhcp_restored` (warn): dnsmasq failed after a DHCP change; the last working
  settings were put back (the bad file is kept in `/tmp/lg7200-dhcp.bad`).
- `network` / `dhcp_down` (danger): dnsmasq is not running and there is nothing to put back.
- `system` / `time_approximate` (warn, `source=<host>`): clock set from an HTTPS Date header.
- `homenet` / `import_done` (info): `homenet-migrate import` finished.

## B9 (branch b9, merged after RC1; docs/dualwan-spec.md)

### virox.lines (package `homenet-dualwan`, admin)
- `status` → `{ enabled, default_line, lines: [ { id, iface, name, colour, up, package_mb, renew_day,
  warn, up_kbit, down_kbit, used_mb, today_mb, cycle_start, used_up, days_left } ], assignments:
  [ { target, kind: line|both|borrow, line, minutes_left, mb_limit } ] }`. `days_left`: forecast
  from the last 7 full days (X2), `null` without a package or history.
- `enable { on }`: second line on (port `lines.main.port`, default `lan4`, becomes `wan2`) / off.
- `set_line { id, name, colour, package_mb, renew_day, warn, up_kbit, down_kbit }`: empty fields stay.
  Errors `invalid_line`, `invalid_name`, `invalid_colour`, `invalid_<field>`.
- `renewed { id }`: new package cycle from today. `calibrate { id, remaining_mb }`: the cycle
  continues from the ISP figure (`no_package` without a package size).
- `assign { target, line }`: own line of a device (`d..`) or person (`p..`); `line 0` = default.
  The device setting wins over the person's.
- `both { target, minutes }`: both lines (target `all` = everyone); `minutes 0` = until ended.
- `borrow { target, minutes, mb }`: the other line, limited by time and/or volume (R3:
  `limit_required` without either); ends by itself (event `borrow_ended`).
- `end { target }`: ends both / borrowing. `speedtest { id }` → `{ result, down_kbit }` (X3;
  errors `line_down`, `no_dns`, `not_enabled`, `failed`).
- Events (`homenet`): `line_down`, `line_up` (line=), `line_package_level` (percent=),
  `line_package_used_up`, `line_renewed`, `both_started`, `both_ended`, `borrow_started`,
  `borrow_ended` (target=).

### virox.homenet additions (package `homenet`)
- `wifikeys` → `{ keys: [ { person, key } ], wpa2, autolink }` (admin: the owner passes them on).
- `wifikey_set { person, key }`: personal Wi-Fi password, `""` removes; 8-63 printable ASCII;
  errors `unknown_person`, `invalid_key`, `key_taken`. While any exists the home networks use WPA2.
- `autolink { on }`: link a phone that comes back with a new MAC when host name, DHCP fingerprint
  and client id match one known device (event `device_autolinked`); partial matches only raise
  `device_match_proposed` (mac=, device_id=, new_id=) for the Home question.
- `guest` → `{ enabled, ssid, key, line, band, hidden, down_kbit, up_kbit, hours, off_at }`;
  `guest_limits { down_kbit, up_kbit, hours }` (admin, owner 2026-11-22): one speed limiter per
  direction for all guests together (0 = none, else 100-1000000 kbit/s, `invalid_speed`) on
  br-guest, so guests of access points share it too; `hours` 0-24 (`invalid_hours`): the guest
  network switches itself off that many hours after it is turned on (`off_at`, epoch; set from now
  when it is on already), event `guest_auto_off`. Applied by `controls apply` within a minute.
  `guest_hidden { on }` (admin, owner
  2026-11-21) hides the guest network name, kept while it is off, access points follow;
  `guest_set { enabled, ssid, key, line, band }`
  (errors `invalid_ssid`, `invalid_key`, `invalid_line`, `invalid_guest`). `band` (owner
  2026-11-20): `2g` (default) | `5g` | `both`, on the main router and its access points. Guests' usage is the `guest` row
  of `devices` (like `router` and `unknown`).
- `devices`: each device gains `where: { ap, name, signal, band }` (Y3; `ap` = `main` or an AP id).
- Event `device_person_from_key` (device_id=, person_id=).

### virox.apctl (package `homenet-apctl`)
- Main router, admin: `list` → `{ mode, version, roaming, aps: [ { id, name, mac, model, online,
  seen, version, uptime, clients, channels: { ch2, ch5 }, channel2, channel5, updating } ] }`;
  `pair_code` → `{ code, minutes }` (6 digits, 10 minutes, 5 wrong tries end it); `set_ap { id,
  name, channel2, channel5 }` ("auto" or a channel); `forget { id }`; `update { id }`;
  `update_all` (one after the other); `settings { roaming }`.
- Main router, anonymous (each checks its own proof; also `hello`, `backup_get`, `backup_put`
  below, and `peer`):
  `pair { code, mac, model, version }` → `{ id, token }`; `sync { id, token, version, uptime,
  clients: [ { mac, signal, band, keyid } ] }` → `{ wifi: { ssid, ssid5, key, encryption, keys,
  roaming, mobility_domain }, channels: { ch2, ch5 }, install }`. Errors `no_code`,
  `wrong_code`, `invalid_mac`, `unknown_ap`, `not_main`.
- Access point, admin: `join { code }` (errors `not_ap`, `wrong_code`, `no_main`, `no_answer`);
  `agent_status` → `{ mode, paired, main, id, last }`.

### B9 additions (same branch)
- `virox.lines tune { id }` → `{ result, state: "running" }` (P5; owner 2026-11-21: low ping for
  games and calls): measures download AND upload in the background (about 20 s; busybox has no
  `timeout`, before 2026-11-21 the measurement always failed), then shapes the line at about 90 %
  of both with the overhead `lines.lineN.overhead` (default `pppoe-ptm`, a VDSL modem in front).
  Works on line 1 of a single router too (`shaper_single`). Errors `busy`, `invalid_line`.
  `virox.lines tune_state { id }` (read) → `{ state: "running" }` | `{ state: "done", down_kbit,
  up_kbit }` | `{ state: "failed", error }` (`too_slow`, `failed`, `no_dns`, `line_down`) |
  `{ state: "none" }`. The speed is read from the line's byte counters (`lines.main.speedtest_url`,
  `speedtest_up_url`: Cloudflare by default). `status` → each line has `shaping` (cake on its device
  now: the page says "on" only then). Shaped lines: small UDP packets (games, voice and video calls,
  DNS; not QUIC on 443) leave with DSCP EF (cake's Voice tin, nft table `inet homenet_qos`), and an
  upload 8 times slower than the download gets cake's `ack-filter`.
- Roaming (owner 2026-11-21, migration 004): usteer asks a phone below -70 dBm to look around and
  below -75 dBm to move to a radio or unit that hears it at least 8 dB better (802.11k/v; 802.11r with
  access points). Options the owner set in LuCI are kept; nobody is thrown off for a weak signal.
- `virox.apctl set_ap { ..., power }`: `auto` | `high` | `medium` | `low` (section 13 item 4).
  `sync` → `channels: { ch2, ch5, ht5, power }` (item 9: 5 GHz 80 MHz blocks 52/36, or 40 MHz pairs
  44/52/60/36 with more than two units); access points apply channel and power at night only
  (03:00-03:59), except the first time; `guest: { enabled, ssid, key, band, hidden, vni }` (the guest network
  through a VXLAN to the main router's br-guest).
- `virox.apctl backup_get { id, token, offset }` → `{ size, data (base64), done }` and
  `backup_put { id, token, offset, data, final }` (anonymous, token-checked; P7 item 1): the main
  router's backup kept on an access point (`/etc/homenet/peer-backups/main.tar.gz`), each AP's own
  backup on the main router (`/etc/homenet/ap-backups/<id>.tar.gz`); 48 KB chunks, root-only files,
  at most 4 MB per AP backup. Errors `no_backup`, `bad_offset`, `too_big`.

### Access points under a router that is not a Virox (owner 2026-11-20: "one collects the others")
- `virox.apctl hello { mac, model, version, nonce }` (anonymous): a unit not joined announces
  itself every minute; the owner adds it with `approve { mac }` (admin); the next hello with the
  same nonce gets `{ id, token }`. `list` also returns `found: [ { mac, model, version, seen } ]`.
- `virox.apctl peer` (anonymous, read-only) → `{ mac, mode, main_kind: virox|other|null, lead,
  paired, version }`: how access points find each other (they answer a broadcast ping).
- Under a gateway that is not a Virox, the access points choose a lead: a unit that leads stays the
  lead; otherwise the lowest MAC among the units not joined. The lead answers `pair`, `hello`,
  `approve`, `sync` as a main router; `list` on it returns `mode: "router", lead: true`. On an
  access point `list` also returns `paired, via (gateway|lead), main_ip, role (lead|member),
  lead_ip, main_kind`.
- A member's `sync` carries `usage: [ { day, mac, up, down, name } ]` (running totals of today and
  yesterday per MAC, as text); the lead books the growth on the device with that MAC and does not
  count those MACs a second time when the member is plugged into its port.
- Trust: a lead is found on the LAN and nothing proves it is a Virox, so a member sends its own
  backup only to a Virox main router (the gateway), never to a lead (review 2026-11-20).

## virox.pc (package `homenet`; owner 2026-11-20)
Shut down, restart, sleep, hibernate, lock, sign out or cancel a shutdown of a Windows computer. The
Virox program on the computer (`/luci-static/resources/homenet/pc/virox-pc.ps1`, Windows PowerShell
5.1) asks the router every 3 seconds; nothing listens on the computer. It does only the fixed
commands. Setup: the Wake computers page gives a small `.cmd` file (router address + a code for 10
minutes); it runs `virox-pc-setup.ps1`, which links the computer and starts the program at every
sign-in (Startup folder, no administrator rights).
- Admin: `list` → `{ pcs: [ { id, name, host, user, online (asked in the last 20 s), seen, macs,
  device (homenet device id by MAC), pending, last: { cmd, ok, error, at } } ], commands }`;
  `code` → `{ code, minutes }` (6 digits, 10 minutes, 5 wrong tries end it); `command { id, cmd }`
  (`shutdown` and `restart` after 60 seconds with a message; `sleep`, `hibernate`, `lock`,
  `signout`, `cancel`; errors `unknown_pc`, `invalid_command`, `offline`); `rename { id, name }`;
  `forget { id }` (the program removes itself at its next question).
- Anonymous: `pair { code, name, host }` → `{ id, token }` (errors `no_code`, `wrong_code`);
  `poll { id, token, host, user, macs, uptime, result: { nonce, ok, error } }` → `{ cmd: { name,
  nonce } | null, interval }`: a command reaches the program once; its result comes with the next
  question (sleep, hibernate, lock and sign out report "done" before doing it); a command not
  picked up in 2 minutes ends as `not_picked_up`. Error `unknown_pc`.

## virox.vpn (package `homenet`; owner 2026-11-20: any VPN service)
The file the VPN service gives for routers: WireGuard `.conf`, or OpenVPN `.ovpn` with its user name
and password (package `openvpn-mbedtls`, in the image from 0.9.0-rc2). Everyone, or chosen people and
devices, go to the internet through it; the router itself and everyone else keep the normal line.
- `status` → `{ enabled, type: wireguard|openvpn|"", server, connected (WireGuard: a handshake in the
  last 3 minutes), handshake, rx, tx, who: all|chosen, targets, killswitch, openvpn_installed }`.
- `import { text, username, password }`: the file's text (64 KB at most). WireGuard: keys, IPv4
  address, endpoint, MTU taken (the house is IPv4-only, P1). OpenVPN: lines that run programs or move
  files are removed (it comes from outside and OpenVPN runs as root); the router adds its own device,
  mark, up/down script and ignores the server's redirect-gateway. Errors `invalid_file`,
  `invalid_vpn_key`, `invalid_endpoint`, `invalid_address`, `invalid_login`, `no_openvpn`.
- `set { enabled, who, targets, killswitch }` (targets: device and person ids; errors `no_vpn`,
  `invalid_who`, `no_targets`). Kill switch (default on): while the VPN is down the chosen devices
  have no internet rather than going out without it.
- `remove`: the VPN, its rules, its file.
- How: the chosen devices' packets get mark 0x10000 (nft `inet hn_vpn`, by MAC; after the lines'
  chain); rule 881 → table 110 (default route = the VPN: WireGuard by netifd `ip4table`, OpenVPN by
  its up script); rule 880 keeps house and router addresses on the main table; `unreachable default
  metric 4096` in table 110 is the kill switch. The tunnel's own packets carry mark 0x20000 and are
  not the router's own traffic for homenet; the traffic through the VPN is counted on each device;
  "ask me first" holds new devices on the VPN too.

## Section 15 (2026-11-21): finish the whole system

API version **3** (methods added; nothing removed or changed in meaning).

### virox.wifi `power { high }` — see above; 5 GHz stays on the Egyptian rules
`/usr/libexec/lg7200/wifi-power apply` sets the country (`US` with `high`, else the unit's country)
and holds 5 GHz to the Egyptian rules in every case: channels 36-64 only (a fixed channel above 64
goes back to automatic; the automatic choice list is 36-48 under other rules than EG), 23 dBm on
36-48 (the same value in both rule sets), and a `txpower` of 20 (the Egyptian value) on a fixed
channel 52-64 under the US rules, which would allow 24. A lower level of an access point (`set_ap`
power medium / low) is kept. The one public image starts with it off (15.8);
the owner turns it on once and it stays through updates. `virox.apctl set_ap` refuses 5 GHz channels above 64 (`invalid_channel`).

### virox.update — one public image (15.3 item 1, 15.8 item 1)
`latest.json`: `{ product, version, boards, image: {file, sha256, size}, changelog }`. Every unit
takes the same public image (it carries the home-network pages, two lines and access points); with
GitHub Releases (`.../releases/latest/download`) `file` is the bare file name. `sysupgrade -P` on
install (the protected unit storage of B6 item 1 is made by the first update).

### virox.apctl additions (15.3 item 2, 15.4 items 1, 3, 4) — admin unless noted
- `update_all` → `{ result }` | `not_main`, `busy`. This router checks, downloads once and offers
  the update on the LAN at `http://<this router>/virox-update/` (`lg7200-update serve`, RAM only);
  the access points update one at a time (each fetches from there with `LG7200_UPDATE_URL` and
  still checks signature and sha256 with its own keys; the update server if that fails); each must
  report the target version within 10 minutes or the rest stop; an access point offline at its turn
  is skipped; this router installs last. Events `ap/update_all_failed` (warn, `ap_id`),
  `ap/update_all_skipped`, `ap/update_all_done`.
- `update_status` → `{ state: idle|preparing|updating|main|done|failed|error, target, error, failed,
  current, wait_minutes: 10, version, units: [ { id, name, version, state:
  waiting|updating|done|skipped|failed } ] }`. Errors in `error`: the updater's codes (`virox.update`).
- `join_open { minutes }` (1-30, default 10) → `{ result, until }`: an open network `Virox-Join`
  (subnet 10.73.73.0/24, isolated, firewall zone `vxjoin`: DHCP and TCP 443 only, nothing
  forwarded) for an access point without a cable; it says `hello` there and is approved as usual.
  `join_close` → `{ result }`.
- `mesh_set { enabled }`: the wireless link between Virox units (on by default). While this router
  has access points (or a join window), a hidden 802.11s mesh on 5 GHz (SAE, random `mesh_id` and
  `mesh_key` made once, in `apctl.main`) is bridged into the LAN, and STP runs on the LAN bridge
  (this router root, priority 4096; forward delay 4 s); the mesh port costs 200, so a cable is
  always preferred and the mesh carries when a cable is pulled.
- `repeat { band, ssid, key }` (access point mode only; a router that is not a Virox above) →
  `{ result }` | `not_ap`, `invalid_band`, `invalid_ssid`, `invalid_key`: repeat that router's
  Wi-Fi: a 4-address client in the LAN bridge first; relayd (`network.vxrelay`, `wwan` by DHCP)
  when no address comes through it within 90 s. `repeat_off`. `scan` → `{ result, networks: [ {
  band, signal, ssid } ] }`.
- `restart_aps` (also called by the scheduled restart): the access points restart one at a time,
  each must come back (a report with a shorter uptime) within 10 minutes or the rest stop (event
  `ap/restart_aps_failed`); offline ones are skipped.
- `list` adds `mesh`, `join_until`, `repeat: { ssid, mode: wds|relay } | null`, `uplink` (on an
  access point) and per access point `uplink: { kind: cable|wireless|repeat|none, signal, label:
  excellent|good|weak }`.
- `sync` (anonymous, token) takes `uplink` ("cable" | "wireless <dBm>" | "repeat <dBm>" | "none")
  and answers in addition `install_url` (update all), `schedule: { wifi: [...], leds: {...} }` (the
  access point copies it), `restart` (true: restart now, see `restart_aps`) and `mesh: { id, key,
  channel, htmode } | null` (the access point puts its 5 GHz radio on that channel at once).

### virox.ports (15.4 item 2; package `homenet`) — admin, router mode only
Open a port for a device. A rule follows the device record: its current address is reserved when
the rule is added, and the firewall rule (`firewall.vxpf_<id>`, DNAT from zone wan) uses the
reserved address.
- `list` → `{ router, two_lines, rules: [ { id, device, device_name, name, proto, ext, int, line,
  enabled, state: ok|no_address|line_down|off, ip } ], wan: [ { line, ip, kind:
  public|private|cgnat|down } ] }`. `private`: an ISP router in front (DMZ or bridge mode needed);
  `cgnat`: the ISP's shared address, not reachable from the internet.
- `add { device, proto: tcp|udp|both, ext: "N"|"N-M" (at most 1000), int: ""|"N" (single ext),
  line: both|1|2, name }` → `{ result, id }`. Errors `not_router`, `unknown_device`,
  `invalid_proto`, `invalid_port`, `invalid_line`, `invalid_name`, `too_many` (64),
  `port_router` (a port of the router itself on the WAN; none today), `port_taken` (+ `by`),
  `device_offline` (no address to reserve), `dhcp_restored`.
- `set { id, enabled }`, `remove { id }` → `{ result }` | `unknown_rule`.
With two lines, a rule on one line matches that line's address only (`src_dip`, left out while the
line is down), and a connection that comes in on a line answers through that line
(`homenet-dualwan`: inbound connections get that line's mark).

### virox.schedule (15.4 items 3-4; package `luci-app-lg7200-setup`, work by `lg7200-base`) — admin
All off by default; `/usr/libexec/lg7200/schedule tick` every minute.
- `get` → `{ wifi: [ { target: all|2g|5g|guest, days: [0-6], off: "HH:MM", on: "HH:MM", enabled } ],
  leds: { mode: on|off|night, off, on }, restart: { enabled, every: daily|weekly, day, time },
  now: { wifi_all, wifi_2g, wifi_5g, wifi_guest, leds: on|off }, managed }` (`managed`: an access
  point that follows its main router).
- `set_wifi { items }` (replaces the list, at most 16; days = the days of the off-time; an on-time
  earlier than the off-time is the next morning), `set_leds { mode, off, on }`,
  `set_restart { enabled, every, day, time }` → `{ result }` | `invalid_schedule`.
- `preview_wifi { items }` → `{ result, you: [ { mac, ip, band } ] }`: the devices that have the
  router pages open now (TCP to 80/443) and are on a Wi-Fi these windows switch off.
Access points copy the Wi-Fi and light schedules (`sync`). The scheduled restart saves the usage
first, never runs during an update, once a day, after the clock is right (event
`system/scheduled_restart`); then `virox.apctl restart_aps`.

### virox.usb (15.4 item 5; package `luci-app-lg7200-setup`, work by `lg7200-base`) — admin
USB disks mount by themselves under `/mnt`. LAN only; never the WAN or the guest network.
- `status` → `{ disks: [ { dev, disk, mount, label, fs, size_mb, free_mb, shared } ], share: {
  enabled, name, password_set, installed }, printer: { enabled, present, name, address, port:
  9100, installed } }`.
- `set_share { enabled, name, password, clear_password }` → `{ result }`: ksmbd (SMB2/3, no SMB1)
  on the LAN interface, read and write; guests, or the user `virox` with a password of 8-64
  characters (kept only in ksmbd's own user file); the nightly backups folder is hidden. Errors
  `invalid_share_name`, `invalid_password`, `password_failed`, `not_installed`.
- `set_printer { enabled }`: p910nd on port 9100 of the LAN address (raw printing).
- `eject { disk: "sdX" }`: unmount every partition and power the disk down. Errors `invalid_disk`,
  `busy`.

### BUILD-PLAN 15.9 items 2-4 (2026-11-21)

**virox.homenet `wifi_cards`** — admin. `{ networks: [ { kind: home|guest|person, ssid, key, open,
hidden, bands: [2g|5g], person?, name? } ] }`: every network of the house with its name and
password, for its QR code and printed card (home networks once per name; the guest network when
on; each person with a password, on the home network name). A family login never gets it. The
page builds the QR text `WIFI:T:WPA|nopass;S:<name>;P:<password>;[H:true;];` with `\ ; , : "`
escaped by a backslash, and prints only the card (`window.print`, A4 or 86 x 54 mm).

**virox.homenet `person_with_key { name, key }`** — admin → `{ result, id }`: "Add a person" in one
step, a name and a Wi-Fi password (8-63 printable ASCII). Errors `invalid_key`, `key_taken` (another
person's or the household password), the `person_add` errors (`name_empty`, `name_too_long`,
`name_taken`); nothing is left half-made. Every device that joins with that password is added to
the person by itself (`identity`, event `device_person_from_key`), on this router and on every
access point (the access point reports the keyid in `sync`). One password per person for all their
devices. `wifikey_set` also refuses the household password now (`key_taken`).

**virox.apctl `addresses`** — admin → `{ router, net, router_ip, units_start, units_end, dev_start,
dev_end, aps: [ { id, name, ip } ] }` (last numbers of the LAN addresses; defaults units 2-49,
devices 100-249 = the DHCP pool).

**virox.apctl `addresses_set { units_start, units_end, dev_start, dev_end }`** — admin, router mode.
Errors `invalid_range`, `range_overlap`, `range_router`, `range_small` (fewer than 10 device
addresses), `range_reserved` (a device's fixed address inside the units range, `ip`),
`range_ap_outside` (an access point's fixed address outside the new units range, `ip`),
`dhcp_restored`, `not_router`.

**Access points get a fixed address by themselves:** on `pair` / `approve` (cable or wireless) the
lowest free address of the units range becomes a reservation (`dhcp` host `vxap_<id>`, option
`vxap`), kept through restarts and updates, freed on `forget`. An old reservation of the unit is
kept when it is in the units range and moved into it otherwise (event `ap/ap_address_moved`).
A full units range: `pair` / `approve` answer `units_full` and nothing is made. Under a router that
is not a Virox, the access points take what that router gives.
