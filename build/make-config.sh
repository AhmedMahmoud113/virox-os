#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
# The OpenWrt .config of the Virox release image: the seed plus the product identity of
# product.conf (name, version, update host, defaults). The same lines as tools/build.sh writes.
#   sh make-config.sh <dir with release.seed and product.conf> > .config ; make defconfig
set -eu
d="${1:-.}"
. "$d/product.conf"
cat "$d/release.seed"
echo "CONFIG_IMAGEOPT=y"
echo "CONFIG_VERSIONOPT=y"
echo "CONFIG_VERSION_DIST=\"$PRODUCT_SYSTEM_NAME\""
echo "CONFIG_VERSION_NUMBER=\"$PRODUCT_VERSION\""
echo "CONFIG_VERSION_MANUFACTURER=\"$PRODUCT_NAME\""
echo "CONFIG_VERSION_PRODUCT=\"$PRODUCT_NAME\""
echo "CONFIG_VERSION_REPO=\"$UPDATE_BASE_URL/$PRODUCT_VERSION\""
echo "CONFIG_VERSION_HOME_URL=\"$SOURCE_URL\""
echo "CONFIG_VERSION_SUPPORT_URL=\"$SOURCE_URL\""
echo "CONFIG_VERSION_BUG_URL=\"$SOURCE_URL\""
echo "CONFIG_VERSION_MANUFACTURER_URL=\"$SOURCE_URL\""
echo "CONFIG_LG7200_PRODUCT_NAME=\"$PRODUCT_NAME\""
echo "CONFIG_LG7200_SSID_PREFIX=\"$PRODUCT_SSID_PREFIX\""
echo "CONFIG_LG7200_HOSTNAME=\"$PRODUCT_HOSTNAME\""
echo "CONFIG_LG7200_LAN_IP=\"$DEFAULT_LAN_IP\""
echo "CONFIG_LG7200_LAN_CANDIDATES=\"$DEFAULT_LAN_CANDIDATES\""
echo "CONFIG_LG7200_UPDATE_URL=\"$UPDATE_BASE_URL\""
echo "CONFIG_LG7200_OPENWRT_FEEDS=\"${OPENWRT_FEEDS_URL%/mipsel_24kc}\""
echo "CONFIG_LG7200_OPENWRT_BASE=\"OpenWrt ${OPENWRT_BASE_TAG#v}\""
echo "CONFIG_LG7200_SOURCE_URL=\"$SOURCE_URL\""
echo "CONFIG_LG7200_COUNTRY=\"$DEFAULT_COUNTRY\""
echo "CONFIG_LG7200_TIMEZONE=\"$DEFAULT_TIMEZONE\""
echo "CONFIG_LG7200_ZONENAME=\"$DEFAULT_ZONENAME\""
if [ "${WIFI_DEFAULT_ON:-1}" = 1 ]; then echo "CONFIG_LG7200_WIFI_DEFAULT_ON=y"; else echo "# CONFIG_LG7200_WIFI_DEFAULT_ON is not set"; fi
