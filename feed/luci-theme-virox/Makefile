# SPDX-License-Identifier: Apache-2.0
# Virox theme (BUILD-PLAN 10b): the look of luci-theme-argon v2.4.3 (Copyright 2020 Jerrykuku,
# Apache-2.0, LICENSE.argon, https://github.com/jerrykuku/luci-theme-argon, commit c5c0873),
# with Arabic right-to-left support, the Virox menu and page components. The Argon parts are
# copied by tools/theme-from-argon.sh; the stylesheet is converted to logical properties. Argon's
# online services (update check, wallpaper download, branding upload) and its fonts are not
# included. Templates derived from Argon keep its copyright notice.
include $(TOPDIR)/rules.mk

LUCI_TITLE:=Virox theme (based on Argon, Arabic RTL, phone first)
LUCI_DEPENDS:=+luci-base +ucode-mod-math
PKG_LICENSE:=Apache-2.0 GPL-3.0-or-later
PKG_LICENSE_FILES:=LICENSE.argon
PKG_VERSION:=0.9.0
PKG_RELEASE:=31

define Package/luci-theme-virox/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Virox
	uci commit luci
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
