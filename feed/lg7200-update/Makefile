# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=lg7200-update
PKG_VERSION:=0.9.0
PKG_RELEASE:=4
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0

include $(INCLUDE_DIR)/package.mk

define Package/lg7200-update
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Virox updater (signed latest.json, sha256, sysupgrade)
  DEPENDS:=+lg7200-base +usign +uclient-fetch +ca-bundle +jsonfilter +rpcd +rpcd-mod-ucode +ucode-mod-fs
  PKGARCH:=all
endef

define Package/lg7200-update/description
  Checks the update server once a day (after the clock is synced) and shows "update available";
  installing is a manual button. Only a latest.json signed by a key shipped in the image, and an
  image with the matching sha256, are ever installed (BUILD-PLAN B8.1).
endef

define Build/Compile
endef

# The release signing key's public half (usign, B4.3) is shipped under its fingerprint, so usign
# finds it by the fingerprint written in the signature. A tree without the key ships none, and
# then no update can be verified (never installed).
define Package/lg7200-update/install
	$(INSTALL_DIR) $(1)/usr/sbin $(1)/usr/share/rpcd/ucode $(1)/usr/share/rpcd/acl.d $(1)/etc/uci-defaults \
		$(1)/etc/lg7200/update-keys
	$(INSTALL_BIN) ./files/usr/sbin/lg7200-update $(1)/usr/sbin/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-update.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/lg7200-update.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_BIN) ./files/etc/uci-defaults/92-lg7200-update $(1)/etc/uci-defaults/
	if [ -f $(TOPDIR)/key-build.pub ]; then \
		fp="$$$$($(STAGING_DIR_HOST)/bin/usign -F -p $(TOPDIR)/key-build.pub)"; \
		$(INSTALL_DATA) $(TOPDIR)/key-build.pub $(1)/etc/lg7200/update-keys/$$$$fp; \
	fi
endef

define Package/lg7200-update/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,lg7200-update))
