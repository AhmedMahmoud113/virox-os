# SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
include $(TOPDIR)/rules.mk

PKG_NAME:=lg7200-base
PKG_VERSION:=0.9.0
PKG_RELEASE:=21
PKG_LICENSE:=LicenseRef-PolyForm-Noncommercial-1.0.0
PKG_CONFIG_DEPENDS:= \
	CONFIG_LG7200_PRODUCT_NAME CONFIG_LG7200_SSID_PREFIX CONFIG_LG7200_HOSTNAME \
	CONFIG_LG7200_LAN_IP CONFIG_LG7200_LAN_CANDIDATES CONFIG_LG7200_UPDATE_URL \
	CONFIG_LG7200_OPENWRT_FEEDS CONFIG_LG7200_OPENWRT_BASE CONFIG_LG7200_SOURCE_URL \
	CONFIG_LG7200_COUNTRY CONFIG_LG7200_TIMEZONE CONFIG_LG7200_ZONENAME \
	CONFIG_LG7200_WIFI_DEFAULT_ON

include $(INCLUDE_DIR)/package.mk
include $(INCLUDE_DIR)/version.mk

define Package/lg7200-base
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=Virox per-unit identity and defaults (Mercury GAPM-7200)
  DEPENDS:=+provision +ucode +ucode-mod-uloop +ucode-mod-uclient +ca-bundle
  PKGARCH:=all
endef

define Package/lg7200-base/description
  Per-unit identity for Virox: base MAC resolution (override, Factory unless
  blocklisted, generated), storage in the upstream provisioning volume with an
  overlay-file fallback, safe first-boot defaults, package repositories, and
  the SSH gate until a root password is set.
endef

# Product identity comes from config/product.conf through tools/build.sh.
define Package/lg7200-base/config
  if PACKAGE_lg7200-base
	config LG7200_PRODUCT_NAME
		string "Product name"
		default "Virox"
	config LG7200_SSID_PREFIX
		string "Wi-Fi name prefix"
		default "Virox-"
	config LG7200_HOSTNAME
		string "Hostname"
		default "Virox"
	config LG7200_LAN_IP
		string "Default LAN address"
		default "192.168.72.1"
	config LG7200_LAN_CANDIDATES
		string "LAN addresses tried when the WAN uses the same subnet"
		default "192.168.72.1 192.168.73.1 10.72.0.1 172.30.72.1"
	config LG7200_UPDATE_URL
		string "Update base URL (our core, kmods and feed)"
		default "https://updates.invalid/virox"
	config LG7200_OPENWRT_FEEDS
		string "Official OpenWrt userspace feeds base URL"
		default "https://downloads.openwrt.org/releases/25.12.6/packages"
	config LG7200_OPENWRT_BASE
		string "OpenWrt base version"
		default "OpenWrt 25.12.6"
	config LG7200_SOURCE_URL
		string "Source code URL"
		default "https://updates.invalid/virox/source"
	config LG7200_COUNTRY
		string "Wi-Fi country"
		default "EG"
	config LG7200_TIMEZONE
		string "Timezone (POSIX)"
		default "EET-2EEST,M4.5.5/0,M10.5.4/24"
	config LG7200_ZONENAME
		string "Timezone name"
		default "Africa/Cairo"
	config LG7200_WIFI_DEFAULT_ON
		bool "Wi-Fi on at first boot (random key)"
		default y
  endif
endef

define Package/lg7200-base/conffiles
/etc/config/lg7200
/etc/lg7200/unitcfg
endef

define Build/Compile
endef

define Package/lg7200-base/install
	$(INSTALL_DIR) $(1)/lib/functions $(1)/etc/lg7200 $(1)/lib/upgrade/keep.d \
		$(1)/etc/config $(1)/etc/uci-defaults $(1)/etc/init.d \
		$(1)/etc/hotplug.d/ieee80211 $(1)/etc/hotplug.d/iface $(1)/usr/libexec/lg7200
	$(INSTALL_DATA) ./files/lib/functions/lg7200.sh $(1)/lib/functions/
	$(INSTALL_DATA) ./files/etc/lg7200/mac-blocklist $(1)/etc/lg7200/
	$(INSTALL_DATA) ./files/lib/upgrade/keep.d/lg7200-base $(1)/lib/upgrade/keep.d/
	$(INSTALL_BIN) ./files/etc/uci-defaults/90-lg7200-identity $(1)/etc/uci-defaults/
	$(INSTALL_BIN) ./files/etc/init.d/lg7200-gate $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/lg7200-firstsetup $(1)/etc/init.d/
	$(INSTALL_DATA) ./files/etc/hotplug.d/ieee80211/20-lg7200-wifi-mac $(1)/etc/hotplug.d/ieee80211/
	$(INSTALL_DATA) ./files/etc/hotplug.d/ieee80211/30-lg7200-wifi-defaults $(1)/etc/hotplug.d/ieee80211/
	$(INSTALL_DATA) ./files/etc/hotplug.d/iface/30-lg7200-lan-guard $(1)/etc/hotplug.d/iface/
	$(INSTALL_DATA) ./files/etc/hotplug.d/iface/31-lg7200-ap-fallback $(1)/etc/hotplug.d/iface/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/repos $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/lan-guard $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/loginguard $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/setupnet $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/ap-fallback $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/wifi-defaults $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/apply-macs $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/wifi-night $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/wifi-power $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/schedule $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/usb $(1)/usr/libexec/lg7200/
	$(INSTALL_DIR) $(1)/etc/hotplug.d/block $(1)/etc/hotplug.d/usbmisc
	$(INSTALL_DATA) ./files/etc/hotplug.d/block/60-lg7200-usb $(1)/etc/hotplug.d/block/
	$(INSTALL_DATA) ./files/etc/hotplug.d/usbmisc/60-lg7200-printer $(1)/etc/hotplug.d/usbmisc/
	$(INSTALL_DIR) $(1)/usr/libexec/lg7200/migrate.d $(1)/www-lockout $(1)/etc/hotplug.d/ntp \
		$(1)/etc/hotplug.d/button $(1)/usr/share/nftables.d/table-pre \
		$(1)/usr/share/nftables.d/chain-pre/dstnat $(1)/usr/share/nftables.d/chain-pre/input
	$(INSTALL_BIN) ./files/etc/uci-defaults/80-lg7200-migrate $(1)/etc/uci-defaults/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/migrate.d/*.sh $(1)/usr/libexec/lg7200/migrate.d/
	$(INSTALL_BIN) ./files/etc/uci-defaults/91-lg7200-services $(1)/etc/uci-defaults/
	$(INSTALL_BIN) ./files/etc/init.d/lg7200-loginguard $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/lg7200-setupnet $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/etc/init.d/lg7200-watch $(1)/etc/init.d/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/watch $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/dhcp-guard $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/time-fallback $(1)/usr/libexec/lg7200/
	$(INSTALL_BIN) ./files/usr/libexec/lg7200/http-date $(1)/usr/libexec/lg7200/
	$(INSTALL_DATA) ./files/etc/hotplug.d/ntp/20-lg7200-timesync $(1)/etc/hotplug.d/ntp/
	$(INSTALL_DATA) ./files/etc/hotplug.d/button/50-lg7200-setupnet $(1)/etc/hotplug.d/button/
	$(INSTALL_DATA) ./files/www-lockout/index.html $(1)/www-lockout/
	$(INSTALL_DATA) ./files/usr/share/nftables.d/table-pre/30-lg7200-loginguard.nft $(1)/usr/share/nftables.d/table-pre/
	$(INSTALL_DATA) ./files/usr/share/nftables.d/chain-pre/dstnat/30-lg7200-loginguard.nft $(1)/usr/share/nftables.d/chain-pre/dstnat/
	$(INSTALL_DATA) ./files/usr/share/nftables.d/chain-pre/input/30-lg7200-loginguard.nft $(1)/usr/share/nftables.d/chain-pre/input/
	( \
		echo "config product 'product'"; \
		echo "	option name '$(call qstrip,$(CONFIG_LG7200_PRODUCT_NAME))'"; \
		echo "	option ssid_prefix '$(call qstrip,$(CONFIG_LG7200_SSID_PREFIX))'"; \
		echo "	option hostname '$(call qstrip,$(CONFIG_LG7200_HOSTNAME))'"; \
		echo "	option country '$(call qstrip,$(CONFIG_LG7200_COUNTRY))'"; \
		echo "	option timezone '$(call qstrip,$(CONFIG_LG7200_TIMEZONE))'"; \
		echo "	option zonename '$(call qstrip,$(CONFIG_LG7200_ZONENAME))'"; \
		echo "	option wifi_default_on '$(if $(CONFIG_LG7200_WIFI_DEFAULT_ON),1,0)'"; \
		echo ""; \
		echo "config update 'update'"; \
		echo "	option url '$(call qstrip,$(CONFIG_LG7200_UPDATE_URL))'"; \
		echo "	option openwrt_feeds '$(call qstrip,$(CONFIG_LG7200_OPENWRT_FEEDS))'"; \
		echo ""; \
		echo "config lan 'lan'"; \
		echo "	option default_ip '$(call qstrip,$(CONFIG_LG7200_LAN_IP))'"; \
		echo "	option candidates '$(call qstrip,$(CONFIG_LG7200_LAN_CANDIDATES))'"; \
	) > $(1)/etc/config/lg7200
	( \
		echo "PRODUCT_NAME='$(call qstrip,$(CONFIG_LG7200_PRODUCT_NAME))'"; \
		echo "PRODUCT_VERSION='$(VERSION_NUMBER)'"; \
		echo "PRODUCT_REVISION='$(REVISION)'"; \
		echo "BASE='$(call qstrip,$(CONFIG_LG7200_OPENWRT_BASE))'"; \
		echo "SOURCE_URL='$(call qstrip,$(CONFIG_LG7200_SOURCE_URL))'"; \
	) > $(1)/etc/lg7200-release
endef

$(eval $(call BuildPackage,lg7200-base))
