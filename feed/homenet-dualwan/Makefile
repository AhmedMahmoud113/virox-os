# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=homenet-dualwan
PKG_VERSION:=0.9.0
PKG_RELEASE:=9
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0

include $(INCLUDE_DIR)/package.mk

define Package/homenet-dualwan
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Virox home network: two internet lines
  DEPENDS:=+homenet +ip-full +kmod-sched-cake +kmod-sched-core +kmod-ifb +tc-tiny +conntrack +kmod-nft-core
  PKGARCH:=all
endef

define Package/homenet-dualwan/description
  Two internet lines (BUILD-PLAN B9, docs/dualwan-spec.md): the second line on a LAN port,
  each device or person on its own line, both lines or borrowing on request, health watch with
  failover, per-line usage and package. Off until enabled.
endef

define Package/homenet-dualwan/conffiles
/etc/config/lines
endef

define Build/Compile
endef

define Package/homenet-dualwan/install
	$(INSTALL_DIR) $(1)/usr/libexec/homenet $(1)/etc/init.d $(1)/etc/config $(1)/etc/hotplug.d/iface \
		$(1)/usr/share/rpcd/ucode $(1)/usr/share/rpcd/acl.d
	$(INSTALL_BIN) ./files/usr/libexec/homenet/lines $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/etc/init.d/homenet-lines $(1)/etc/init.d/
	$(INSTALL_CONF) ./files/etc/config/lines $(1)/etc/config/
	$(INSTALL_DATA) ./files/etc/hotplug.d/iface/45-homenet-lines $(1)/etc/hotplug.d/iface/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-lines.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-dualwan.json $(1)/usr/share/rpcd/acl.d/
endef

define Package/homenet-dualwan/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

define Package/homenet-dualwan/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /usr/libexec/homenet/lines disable >/dev/null 2>&1
exit 0
endef

$(eval $(call BuildPackage,homenet-dualwan))
