# Licence

Required Notice: Copyright (c) 2026 Ahmed Mahmoud. Virox OS for the Mercury GAPM-7200 (LG-7200).

## Personal use only, not for sale

The Virox packages in `feed/` (homenet, homenet-apctl, homenet-dualwan, lg7200-base, lg7200-support,
lg7200-update, luci-app-homenet, luci-app-lg7200-setup) and the guides in `docs/` are licensed under
the **PolyForm Noncommercial License 1.0.0** ([LICENSES/PolyForm-Noncommercial-1.0.0.md](LICENSES/PolyForm-Noncommercial-1.0.0.md)).

You may use, study and change them for **personal and other noncommercial purposes**. Selling them, or
routers that carry them, or any other commercial use needs a separate written licence from the author:

**Ahmed Mahmoud — ahmedmahmoud0131@gmail.com**

Anyone who passes the software on must pass on this file, including the Required Notice line above.

## Parts under other licences

These parts are not the author's own work alone and keep their licences:

| Part | Licence |
|---|---|
| `device/` (GAPM-7200 support patches for OpenWrt and the Linux kernel) | GPL-2.0 ([LICENSES/GPL-2.0.txt](LICENSES/GPL-2.0.txt)) |
| `feed/luci-theme-virox` (built on luci-theme-argon) | Apache-2.0 and GPL-3.0-or-later, see its `LICENSE.argon` and file headers |
| `feed/luci-theme-virox-vantage` (built on luci-theme-vantage) | GPL-3.0-or-later, see its `LICENSE` and `NOTICE.vantage` |
| Fonts in `feed/luci-theme-virox/.../fonts` | SIL Open Font License, see the files next to them |
| OpenWrt and the packages it builds | their own licences |

The published router images contain all of the above; the source of every part is in this
repository or in OpenWrt `v25.12.6`.
