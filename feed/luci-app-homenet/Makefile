# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

LUCI_TITLE:=Virox home network pages (home, devices, usage, control, settings)
LUCI_DEPENDS:=+luci-lib-uqr +luci-base +homenet +luci-theme-virox +luci-app-lg7200-setup
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0
PKG_VERSION:=0.9.0
PKG_RELEASE:=30

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
