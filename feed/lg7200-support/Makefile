# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=lg7200-support
PKG_VERSION:=0.9.0
PKG_RELEASE:=6
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0

include $(INCLUDE_DIR)/package.mk

define Package/lg7200-support
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Virox help report, settings backup and restore
  DEPENDS:=+lg7200-base +rpcd +rpcd-mod-ucode +ucode-mod-fs +cgi-io +jsonfilter
  PKGARCH:=all
endef

define Package/lg7200-support/description
  The "help report" button (redacted support file), "save my settings" / "restore" with a
  nightly copy to a USB stick (BUILD-PLAN section 12 items 7-8, P7).
endef

define Build/Compile
endef

define Package/lg7200-support/install
	$(INSTALL_DIR) $(1)/usr/libexec/lg7200 $(1)/usr/share/rpcd/ucode $(1)/usr/share/rpcd/acl.d $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/help-report $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/backup $(1)/usr/libexec/lg7200/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-support.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/lg7200-support.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_BIN) ./files/etc/uci-defaults/93-lg7200-support $(1)/etc/uci-defaults/
endef

define Package/lg7200-support/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,lg7200-support))
