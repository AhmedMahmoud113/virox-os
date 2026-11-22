# Third-party parts of the Virox pages

## Argon (the default look, BUILD-PLAN 10b)

- Project: luci-theme-argon, https://github.com/jerrykuku/luci-theme-argon
- Version: v2.4.3, commit `adcd445a010da4de2bb7a5c4a32435dd87f9d4c0` (the release the LG-7200 runs as delivered)
- Licence: Apache License 2.0 (`feed/luci-theme-virox/LICENSE.argon`)
- Copyright 2020 Jerrykuku; based on luci-theme-material (Copyright 2015 Lutty Yang) and the
  Argon Dashboard template (Creative Tim); login picture from Unsplash.
- Used in `luci-theme-virox`: the stylesheet (converted to logical properties by
  `tools/css-logical.py`), the menu icons, the login picture, the appearance, compatibility,
  overview, graphs and SSH-key scripts, the palette module; the templates, the menu script and the
  appearance switch are adapted copies that keep the Argon notice. Copied by
  `tools/theme-from-argon.sh`.
- Not used: Argon's font files ("Google Sans" is Google-proprietary, TypoGraphica is all rights
  reserved); Google Sans Flex, Google's open (OFL) version of the same design, is used instead,
  with Cairo for Arabic, its online update check, wallpaper download, branding
  upload and settings page. Our default colours are those of the reseller's `/etc/config/argon`
  (light, `#2563eb`, `#1d4ed8`); no reseller logo, picture or name.
- The page footer credits Argon.

## Google Sans Flex font (owner, 2026-11-19: "the Argon fonts")

- SIL Open Font License 1.1 (`feed/luci-theme-virox/htdocs/luci-static/virox/fonts/GoogleSansFlex-OFL.txt`),
  https://github.com/google/fonts/tree/main/ofl/googlesansflex; Latin subset as served by Google Fonts (v26).

## Cairo font

- SIL Open Font License 1.1 (`feed/luci-theme-virox/htdocs/luci-static/virox/fonts/Cairo-OFL.txt`).

## Vantage (the second look, owner 2026-11-19)

- Project: luci-theme-vantage, https://github.com/anothaDev/luci-theme-vantage
- Version: v1.0.20, commit `0f8d16f2ce25132e6a074575af16468524d2d5dd`
- Licence: GNU GPL 3.0 or later (`feed/luci-theme-virox-vantage/LICENSE`, `NOTICE.vantage`).
  The package `luci-theme-virox-vantage` is GPL-3.0-or-later as a whole; its complete source is
  part of the Virox source release. It is a separate package next to the Apache-2.0 and
  GPL-2.0 packages of the image (aggregation), and it is not selected by default.
- Copied by `tools/theme-from-vantage.sh`, changed by `tools/vantage-patch.py` (right-to-left,
  the Virox menu and notices, the Virox login, Arabic texts, no online update check, no automatic
  switch to HTTPS). Not used: the dashboard app `luci-app-vantage`, prototypes, tests.
- The page footer credits Vantage.
