# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=homenet-apctl
PKG_VERSION:=0.9.0
PKG_RELEASE:=17
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0

include $(INCLUDE_DIR)/package.mk

define Package/homenet-apctl
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Virox home network: access points managed by the main router
  DEPENDS:=+homenet +lg7200-update +uclient-fetch +jsonfilter +iwinfo +hostapd-utils +ip-full +ip-bridge +kmod-vxlan +coreutils-base64
  PKGARCH:=all
endef

define Package/homenet-apctl/description
  Any number of Virox access points paired with the main router by a short code (BUILD-PLAN B9
  Y1, docs/dualwan-spec.md section 5): the main router gives them the Wi-Fi name, the household
  and personal passwords, the channel plan and fast roaming, sees which device is on which access
  point with its signal (Y3) and updates their firmware one at a time.
endef

define Package/homenet-apctl/conffiles
/etc/config/apctl
endef

define Build/Compile
endef

define Package/homenet-apctl/install
	$(INSTALL_DIR) $(1)/usr/libexec/homenet $(1)/etc/config $(1)/usr/share/rpcd/ucode $(1)/usr/share/rpcd/acl.d
	$(INSTALL_BIN) ./files/usr/libexec/homenet/apctl $(1)/usr/libexec/homenet/
	$(INSTALL_DIR) $(1)/usr/lib/homenet
	$(INSTALL_DATA) ./files/usr/lib/homenet/apctl-mesh.sh $(1)/usr/lib/homenet/
	$(INSTALL_CONF) ./files/etc/config/apctl $(1)/etc/config/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-apctl.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-apctl.json $(1)/usr/share/rpcd/acl.d/
endef

define Package/homenet-apctl/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

$(eval $(call BuildPackage,homenet-apctl))
