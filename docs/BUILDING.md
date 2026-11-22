# Building the Virox image from source

This rebuilds the published image of a version from this repository and the official OpenWrt source.

## What you need

- A Linux computer (or Windows with WSL2), about 60 GB of free disk and 8 GB of RAM or more.
- The build tools of OpenWrt 25.12: https://openwrt.org/docs/guide-developer/toolchain/install-buildsystem

## Steps

Run these in a terminal, next to this repository (folder `virox-os`):

```sh
# 1. OpenWrt at the release this version is built on
git clone https://github.com/openwrt/openwrt.git
cd openwrt
git checkout v25.12.6

# 2. the GAPM-7200 support
git am ../virox-os/device/*.patch

# 3. the Virox packages as a feed
echo "src-link virox $(realpath ../virox-os/feed)" >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a

# 4. the release settings
sh ../virox-os/build/make-config.sh ../virox-os/build > .config
make defconfig

# 5. build (one to three hours the first time)
make download
make -j"$(nproc)"
```

The image is in `bin/targets/ramips/mt7621/`:
`virox-os-<version>-ramips-mt7621-mercury_gapm7200-squashfs-sysupgrade.bin` (install and updates)
and `...-squashfs-factory.bin` (Breed recovery).

Published images are signed with the project's key. An image you build yourself is not, so a router
running a published image does not offer it as an update; install it as in [INSTALL.md](INSTALL.md).
