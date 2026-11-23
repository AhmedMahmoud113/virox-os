# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=homenet
PKG_VERSION:=0.9.0
PKG_RELEASE:=31
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0

include $(INCLUDE_DIR)/package.mk

define Package/homenet
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Virox home network: per-device usage, limits and controls
  DEPENDS:=+lg7200-base +nftables +kmod-nft-core +kmod-nft-nat +rpcd +rpcd-mod-ucode +ucode-mod-uci \
	+ucode-mod-fs +ucode-mod-uloop +conntrack +dnsmasq +uclient-fetch +ca-bundle +etherwake +hostapd-utils
  PKGARCH:=all
endef

define Package/homenet/description
  Per-device usage accounting (devices with an internal id and a list of MACs, owned by
  people), billing cycle, and the home-network controls of Virox. Data in /etc/homenet/data,
  kept across upgrades. Ported from the owner's homenet scripts (BUILD-PLAN B7).
endef

define Package/homenet/conffiles
/etc/config/homenet
endef

define Build/Compile
endef

define Package/homenet/install
	$(INSTALL_DIR) $(1)/usr/lib/homenet $(1)/usr/libexec/homenet $(1)/etc/init.d \
		$(1)/etc/config $(1)/etc/hotplug.d/iface $(1)/etc/hotplug.d/dhcp $(1)/etc/hotplug.d/ntp \
		$(1)/lib/upgrade/keep.d $(1)/usr/share/rpcd/ucode $(1)/usr/share/rpcd/acl.d $(1)/usr/share/homenet
	$(INSTALL_BIN) ./files/usr/libexec/homenet/dns $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/wake-sched $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/filter $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/watch $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/live $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/quality $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/wifitest $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/kidsites $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/etc/init.d/homenet-dns $(1)/etc/init.d/
	$(INSTALL_DATA) ./files/usr/share/homenet/site-catalog.tsv $(1)/usr/share/homenet/
	$(INSTALL_DATA) ./files/usr/share/homenet/doh-servers.txt $(1)/usr/share/homenet/
	$(INSTALL_DATA) ./files/usr/share/homenet/makers.tsv $(1)/usr/share/homenet/
	$(INSTALL_DATA) ./files/usr/share/homenet/doh-names.txt $(1)/usr/share/homenet/
	$(INSTALL_DATA) ./files/usr/lib/homenet/common.sh $(1)/usr/lib/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/accounting $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/devices $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/controls $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/homenet-migrate $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/persist $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/ipv6-lan $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/identity $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/guest $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/vpn $(1)/usr/libexec/homenet/
	$(INSTALL_BIN) ./files/usr/libexec/homenet/ports $(1)/usr/libexec/homenet/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-ports.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-ports.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-vpn.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-vpn.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_BIN) ./files/etc/init.d/homenet-identity $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/homenet $(1)/etc/init.d/
	$(INSTALL_CONF) ./files/etc/config/homenet $(1)/etc/config/
	$(INSTALL_DATA) ./files/etc/hotplug.d/iface/40-homenet $(1)/etc/hotplug.d/iface/
	$(INSTALL_DATA) ./files/etc/hotplug.d/dhcp/40-homenet $(1)/etc/hotplug.d/dhcp/
	$(INSTALL_DATA) ./files/etc/hotplug.d/ntp/50-homenet $(1)/etc/hotplug.d/ntp/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-homenet.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-user.json $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DATA) ./files/usr/share/rpcd/ucode/virox-pc.uc $(1)/usr/share/rpcd/ucode/
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/homenet-pc.json $(1)/usr/share/rpcd/acl.d/
	echo /etc/homenet/data/ > $(1)/lib/upgrade/keep.d/homenet
endef

define Package/homenet/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || /etc/init.d/rpcd reload
exit 0
endef

define Package/homenet/prerm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/homenet stop
	/etc/init.d/homenet-dns stop
	rm -f /tmp/dnsmasq*.d/homenet-filter.conf && /etc/init.d/dnsmasq restart
	/usr/libexec/homenet/ipv6-lan on
}
endef

$(eval $(call BuildPackage,homenet))
