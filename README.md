# Virox OS — firmware for the LG-7200 (Mercury GAPM-7200) router

Firmware for the **Mercury GAPM-7200** dual-band router (sold as "LG-7200"), built on
**OpenWrt 25.12**. It turns the router into a home router that anyone can run: who is connected, how
much each device uses, internet time for children, two internet lines, access points, all from simple
pages in English and Arabic.

> Status: release candidate (0.9.0-rc2), under hardware testing.

## Which routers?

**Only the Mercury GAPM-7200 / LG-7200.** The image carries this board's device tree, flash layout
and MAC handling; it does not start on any other router. The label under the router must say
**GAPM-7200** (the GAPD-7200 is a different device).

The packages in `feed/` (devices, usage, controls, two lines, access points, the pages) are plain
OpenWrt 25.12 packages and could be built for other OpenWrt routers, but only the GAPM-7200 is tested
and supported.

## Guides

| Guide | For |
|---|---|
| [Back up the router first](docs/BACKUP.md) | before anything else |
| [Install Virox](docs/INSTALL.md) | step by step, for anyone |
| [When something goes wrong](docs/RECOVERY.md) | forgotten password, router does not start, back to the old software |
| [Breed, the rescue program](docs/BREED.md) | open Breed, full backup, install or restore from it |
| [Questions people ask](docs/FAQ.md) | usage, kids mode, family logins, updates |
| [USB disk and printer](docs/USB.md) | sharing a USB disk or printer |
| [Phones that change their MAC](docs/PHONE-MAC.md) | Android and iPhone settings |
| [API](docs/api.md) | for app makers: every action is a `virox.*` call |

## What it does

- **Home**: is the internet working, live speed, who is using the internet right now, the package
  (what is left, when it renews), outages, and one clear sentence for the latest alert.
- **Devices**: every device with its usage; switch its internet off, pause it, limit its speed or
  its usage, a daily internet time (with extra time for today), kids mode, block sites and apps
  for a while or until removed. Devices are grouped into **people**. For kids devices: the list of
  sites and apps they opened (names only, 7 days).
- **Usage**: per day, per device and per line, counted on the line itself; when the provider's app
  shows another figure, type it in and the count goes on from it.
- **Control**: off schedules, daily time, limits, kids mode, house filter, new devices (allow, or ask
  first).
- **Internet**: one or two lines (the second on port LAN 4), failover, both lines together, borrowing;
  **low ping for games and calls** (one tap measures and shapes the line) and the ping, jitter and
  loss of each line over the day.
- **Wi-Fi**: one name for both bands, hide each network on its own, a guest network with its own
  speed and an automatic switch-off, a password per person, a QR code and a printable card for every
  network; phones move to the better band or access point.
- **Access points**: more GAPM-7200 units join by cable or without a cable (mesh), get their address
  by themselves and are updated together.
- **Computers**: switch on, shut down or sleep the computers of the house, now or at set times.
- **USB**: share a USB disk or printer (off until switched on).
- **Settings**: family logins (each sees only their own devices and can ask for more time), updates,
  help report, backup and restore, scheduled restart, back to a new router, language, light or dark.

## Updates

The router checks the releases of this repository once a day and offers an update only when a newer,
**signed** release exists; it refuses anything else. Updates are installed only when you click
**Install now**, and keep your settings.

## Source

- `feed/` — the Virox packages (GPL-2.0-only unless a file says otherwise).
- `device/` — the GAPM-7200 support for OpenWrt 25.12.6: patches on top of the tag `v25.12.6`.
- `build/` — the build settings of the release image (`release.seed`, `product.conf`).

To build the image: [docs/BUILDING.md](docs/BUILDING.md).

## Licence: personal use only, not for sale

Copyright (c) 2026 Ahmed Mahmoud.

Virox is free for **personal and other noncommercial use** (PolyForm Noncommercial 1.0.0). Selling it,
selling routers that carry it, or any other commercial use needs a written licence from the author:
**ahmedmahmoud0131@gmail.com**. The parts that come from other projects (the OpenWrt device patches,
the two looks, the fonts) keep their own licences. Details: [LICENSE.md](LICENSE.md) and
[docs/THIRD-PARTY.md](docs/THIRD-PARTY.md).

## Keywords

LG-7200 firmware, LG7200 OpenWrt, LG 7200 router, Mercury GAPM-7200, GAPM7200, mercury gapm7200
openwrt, MT7621 router firmware, MT7615, Breed recovery, OpenWrt 25.12, home router parental control,
data usage per device, internet package counter, dual WAN, two internet lines, low ping games and
calls, WE Egypt router.
