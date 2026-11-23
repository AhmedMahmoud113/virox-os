# Install Virox on your router

This guide is for anyone: no knowledge of networks is needed. Follow the steps in order and do not
skip any. Plan about 30 minutes.

Look at the sticker under the router. Virox has one file for each of two routers:

- **GAPM-7200** (Mercury, sold as "LG-7200"): the file with `mercury_gapm7200` in its name;
- **GAPD-7200** (Davolink): the file with `davolink_gapd7200` in its name. This one is installed
  from its rescue page or from OpenWrt, see "GAPD-7200" at the end of this guide (still in testing).

The difference is one letter, **M** or **D**. The wrong file leaves the router unable to start.
If the sticker says anything else, **stop**.

## Before you start

- **Make the full backup first:** [BACKUP.md](BACKUP.md). Do not continue without it.
- A Windows computer with a network port (or a USB-to-Ethernet adapter), and one network cable.
- About 20 minutes during which the router may stay off the internet.

## 1. Download the two files

1. On the computer, open this page:
   **https://github.com/AhmedMahmoud113/virox-os/releases/latest**
2. Scroll down to **Assets**. Click these two files to download them (they go to your
   **Downloads** folder):
   - the file whose name ends with **`-squashfs-sysupgrade.bin`**
     (for example `virox-os-0.9.0-rc2-ramips-mt7621-mercury_gapm7200-squashfs-sysupgrade.bin`);
   - the file **`sha256sums`**.

## 2. Check that the file arrived complete

A file that was cut during the download must never be installed. This check takes one minute.

1. Press the **Windows key**, type `powershell` and press **Enter**. A blue or black window opens.
2. Copy this line, paste it into that window (right-click pastes), and press **Enter**:
   ```
   cd $HOME\Downloads; (Get-FileHash (Get-ChildItem *-squashfs-sysupgrade.bin | Select-Object -First 1) -Algorithm SHA256).Hash.ToLower()
   ```
   It prints a long line of letters and numbers.
3. Now copy this line, paste it, and press **Enter**:
   ```
   Get-Content .\sha256sums | Select-String sysupgrade
   ```
   It prints a line that starts with a long line of letters and numbers too.
4. Compare the two long lines. They must be **exactly the same**. If they differ: delete both files,
   download them again, and repeat this step. Never install a file whose numbers do not match.

## 3. Connect the computer to the router only

1. Unplug the cable from your internet modem to the router.
2. Connect the computer to one of the router's LAN ports with the network cable (any port except
   WAN / Internet).
3. Switch the computer's Wi-Fi off for now (click the Wi-Fi icon at the bottom right, then the Wi-Fi
   tile so it turns grey).

## 4. Install

1. Open a web browser and go to `192.168.1.1`. Sign in to the router's current page.
2. In the top menu click **System**, then **Backup / Flash Firmware**.
3. Find **Flash new firmware image** and click **Flash image...**.
4. Click **Browse...** (or **Choose file**), open your **Downloads** folder, choose the file ending
   with `-squashfs-sysupgrade.bin`, and click **Upload**.
5. A window opens with details of the file. **Remove the tick** from **Keep settings and retain the
   current configuration**. This is important: the old settings do not fit Virox.
6. Click **Continue**.
7. **Wait 5 minutes.** The lights blink and the page may say it lost the connection; that is
   normal. **Do not unplug the router** during this time. Unplugging it now can damage it.

## 5. The first setup

After the restart the router has a new address: **192.168.72.1**.

1. Wait until the computer shows the network connection again (about a minute after the lights calm
   down). If it does not come back, unplug the network cable from the computer for 5 seconds and plug
   it in again.
2. In the browser go to **http://192.168.72.1**. The **Quick setup** opens by itself.
   - With a phone instead of the computer: on the phone open Wi-Fi and join the network
     **Virox-Setup** (it has no password, and it is there for 60 minutes after each start until the
     setup is done). The setup page opens by itself; if not, open `192.168.72.1` in the phone's
     browser.
3. Follow the five steps of the setup:
   1. **Language**: choose Arabic or English, click **Next**.
   2. **Router password**: type a password of at least 6 characters in both boxes, click **Next**.
      Write it down: you need it to open these pages again.
   3. **How the router is used**:
      - choose **Router (recommended)** when this router connects to your internet modem;
      - choose **Access point** only if you already have another main router and this one should
        just add Wi-Fi.
      Then, for **How does the internet reach this router?**, choose **Automatic (recommended)**.
      This works with the normal WE / Vodafone / Orange / Etisalat modems. Click **Next**.
   4. **Wi-Fi**: the Wi-Fi name and password are filled in already. Change them if you like, click
      **Next**.
   5. **Check and save**: click **Save**. Wait about a minute.
4. The last page shows the Wi-Fi name, the password and a QR code. **Take a photo of it.** Phones
   can join by pointing the camera at the QR code.

## 6. Connect the internet

1. Take a network cable from one of your **modem's** LAN ports to the router's **WAN** (Internet)
   port.
2. After about a minute the router's home page says **The internet is working**.

## 7. On the internet modem (recommended)

Two small changes on the modem make Virox count usage correctly and make games and calls work best.
The menus differ between modem models; the names below are the usual ones.

**a) Switch off the modem's own Wi-Fi.** Every device should connect to Virox, not to the modem;
otherwise its usage is not counted.

1. On a computer connected to Virox, open `192.168.1.1` (the modem's page).
2. Sign in with the modem's user name and password (they are on the sticker under the modem).
3. Find the Wi-Fi settings (often **Local Network → WLAN**, or **WLAN**, or **Wireless**).
4. Switch the Wi-Fi off (untick **Enable** or choose **Off**) for 2.4 GHz and for 5 GHz, and click
   **Apply** / **Save**.
5. Do not plug any device into the modem's other ports either.

**b) Only if online games say "strict NAT" or a call does not connect: DMZ.**

1. On the modem's page, find the list of connected devices (often **Status → LAN** or
   **DHCP clients**). Find the device named **Virox** and write down its address (it looks like
   `192.168.1.x`).
2. Find **DMZ** (often under **Security**, **NAT** or **Forward Rules**).
3. Switch DMZ on, type the Virox address you wrote down, and click **Apply**.

## A second internet line

Connect the second modem to the router's **LAN 4** port. Then in Virox open **Settings → Package**
and click **Turn on the second line**. Do step 7 on the second modem too.

## GAPD-7200

Still in testing (BUILD-PLAN 16). Make the full backup first. Then either:

- **from its rescue page** (PandoraBox, shows "RT-AC58U"): give the computer the fixed address
  192.168.1.2 / 255.255.255.0 with no gateway, hold Reset while switching the router on, open
  http://192.168.1.1 and upload the `davolink_gapd7200` sysupgrade file; wait about 4 minutes; or
- **from OpenWrt already on it**: copy the file to `/tmp` and run `sysupgrade -n -v /tmp/<file>`.

Both write only the system; the maker's data (ART, Factory, Factory2, nvram) and the rescue
program are never touched.

## If something goes wrong

- The page at `192.168.72.1` does not open after 10 minutes, or the router's lights stay strange:
  see [RECOVERY.md](RECOVERY.md).
- You forgot the router password: see "Forgot the password" in [RECOVERY.md](RECOVERY.md).
