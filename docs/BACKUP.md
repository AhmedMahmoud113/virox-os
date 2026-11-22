# Step 0: make a full backup of your router (before anything else)

Do this **once, before you install Virox**. The backup is a copy of everything on the router's
memory. With it, the router can always be put back exactly as it was, even if something goes wrong.
**Do not install Virox without it.**

It takes about 20 minutes. You do not need any special knowledge: follow the steps in order.

## What you need

- The router: a **Mercury GAPM-7200** (sold as "LG-7200"). Look at the sticker under the router:
  it must say **GAPM-7200**. If it says GAPD-7200 or anything else, **stop**: Virox is not for it.
- A Windows computer (a laptop is fine) with a network (Ethernet) port, or a USB-to-Ethernet
  adapter.
- One network cable.
- A USB flash stick (any size from 1 GB) to keep a second copy of the backup.

## 1. Connect the computer to the router only

1. Unplug the cable that goes from your internet modem to the router (if there is one). The router
   must not be connected to the modem during this whole guide.
2. Plug one end of the network cable into the computer and the other end into one of the router's
   yellow/LAN ports (any port except the one marked WAN or Internet).
3. If the computer is on Wi-Fi, switch its Wi-Fi off for now (click the Wi-Fi icon at the bottom
   right of the screen, then click the Wi-Fi tile so it turns grey).
4. Make sure the computer gets its address automatically (on almost every computer this is already
   the case):
   - Press the **Windows key**, type `ethernet settings` and press **Enter**.
   - Click your Ethernet connection. Next to **IP assignment** it must say **Automatic (DHCP)**.
     If it does not: click **Edit**, choose **Automatic (DHCP)**, click **Save**.

## 2. Make a folder for the backup

1. Open **File Explorer** (the yellow folder icon on the taskbar).
2. Open **Documents**, right-click on an empty area, choose **New → Folder**, and name it
   `router-backup`.

## 3. Download the backup from the router's own page

The router's current software (the one it came with) has a page that can save each part of its
memory as a file.

1. Open a web browser (Chrome, Edge or Firefox) and type `192.168.1.1` in the address bar, then
   press **Enter**.
2. Sign in with the router's password. If you never changed it, try leaving it empty, or the
   password written on the router's sticker.
3. In the menu at the top, click **System**, then **Backup / Flash Firmware**.
4. Find the part called **Save mtdblock contents**. It has a list of names and a **Save mtdblock**
   button.
5. Save every item of that list, one after the other:
   - choose the first name in the list (for example `Bootloader`), click **Save mtdblock**, and
     save the file into the `router-backup` folder;
   - choose the next name and do the same, until you have saved all of them. There are five:
     `Bootloader`, `Config`, `Factory`, `firmware` / `kernel`, and `ubi` (the names may differ
     a little). The last one is big (about 122 MB) and takes a few minutes.
6. When you are done, the folder contains five files. Check the sizes (right-click a file →
   **Properties**): none of them may be 0 bytes.

If your router's page has no **Save mtdblock contents** part, use the next step (Breed) instead;
it saves the same thing in one file.

## 4. A second backup from Breed (recommended)

Your router also has a small rescue program called **Breed**, which starts before the router's
software. Breed can save the whole memory as one file. Having this second copy is a good idea.

1. Unplug the router's power cable.
2. Find the small **Reset** hole/button on the router. Press it and keep it pressed (with a pen tip
   or a paper clip).
3. While you keep pressing **Reset**, plug the power cable back in.
4. Keep pressing for about **5 seconds**, then let go.
5. Wait one minute. In the browser, open `192.168.1.1` again. Instead of the normal page you now see
   the Breed page. It is in Chinese; the steps below give the Chinese words to look for.
6. In the menu on the left, click **固件备份** ("Firmware backup").
7. Click the button **EEPROM** and save the file into `router-backup`.
8. Click the button **编程器固件** ("full flash") and save that file into `router-backup` too. It is
   about 128 MB and takes a few minutes.
9. Unplug the router's power, wait 5 seconds, plug it in again (without pressing anything). It starts
   normally.

## 5. Keep the backup safe

1. Put the USB stick into the computer.
2. Copy the whole `router-backup` folder onto the USB stick (right-click the folder → **Copy**,
   open the USB stick → right-click → **Paste**).
3. Keep the stick somewhere safe. You may need it one day to put the router back as it was
   (see [RECOVERY.md](RECOVERY.md)).

Now you can install Virox: [INSTALL.md](INSTALL.md).

> The screens of the router's own software and of Breed are the standard OpenWrt and Breed pages.
> Pictures of the GAPM-7200's screens are added after the hardware tests.
