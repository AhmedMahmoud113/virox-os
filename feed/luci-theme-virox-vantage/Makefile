# SPDX-License-Identifier: GPL-3.0-or-later
# Virox, second look (owner, 2026-11-19): luci-theme-vantage v1.0.20 (Copyright 2026 anothaDev,
# GPL-3.0-or-later, LICENSE + NOTICE.vantage, https://github.com/anothaDev/luci-theme-vantage,
# commit 0f8d16f) with the Virox changes of tools/vantage-patch.py: Arabic right-to-left, the
# Virox simple menu in Vantage's rail, the shared Virox notices and page components, the Virox
# login, no online update check, no automatic switch to HTTPS. The Vantage dashboard
# (luci-app-vantage) is not included. Chosen in Settings; luci-theme-virox stays the default.
# This package is GPL-3.0-or-later as a whole; its source is in the Virox source release.
include $(TOPDIR)/rules.mk

LUCI_TITLE:=Virox second look (based on Vantage)
LUCI_DEPENDS:=+luci-base +luci-theme-virox
PKG_LICENSE:=GPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE NOTICE.vantage
PKG_VERSION:=0.9.0
PKG_RELEASE:=4
LUCI_MINIFY_CSS:=0

define Package/luci-theme-virox-vantage/conffiles
/etc/config/vantage_theme
endef

define Package/luci-theme-virox-vantage/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	[ "$$(uci -q get luci.main.mediaurlbase)" = /luci-static/virox-vantage ] && uci set luci.main.mediaurlbase=/luci-static/virox
	uci -q delete luci.themes.VantageVirox
	uci commit luci
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
