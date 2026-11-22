# Breed: the router's rescue program

**Breed** is a small program that lives in the first part of the router's memory and starts before
anything else, before the router's normal software. Even when the normal software is broken, Breed
still starts. With it you can:

- save a **full copy** of the router's whole memory (a backup);
- put new software on the router (Virox or the old software);
- put the full copy back, so the router is exactly as it was.

Breed is never changed by Virox, by updates or by a factory reset. **Never use Breed's options to
change Breed itself** (its "bootloader" upload): if that goes wrong, the router cannot start at all.

Breed's page is in **Chinese**. This guide gives the Chinese words to look for, with their meaning.

## 1. Open Breed

**You need:** a Windows computer with a network port and one network cable.

1. Unplug the cable from your internet modem to the router (if there is one). Breed and most modems
   use the same address, so they must not be connected together.
2. Plug the network cable into the computer and into one of the router's **LAN** ports (any port
   except WAN / Internet).
3. Switch the computer's Wi-Fi off (click the Wi-Fi icon at the bottom right, then the Wi-Fi tile so
   it turns grey).
4. Make sure the computer gets its address automatically: press the **Windows key**, type
   `ethernet settings`, press **Enter**, click your Ethernet connection, and check that **IP
   assignment** says **Automatic (DHCP)** (if not: **Edit → Automatic (DHCP) → Save**).
5. **Unplug the router's power cable.**
6. Find the small **Reset** hole/button on the router. Press it with a pen tip or a paper clip and
   **keep it pressed**.
7. While still pressing, **plug the power cable back in**.
8. Keep pressing for about **5 seconds**, then let go.
9. Wait about one minute.
10. Open a web browser (Chrome, Edge or Firefox), type `192.168.1.1` in the address bar and press
    **Enter**. The Breed page opens.

If the normal router page opens instead, Breed was not started: go back to step 5 and keep the
button pressed a little longer (up to 10 seconds).

## 2. The menu (left side)

| Chinese | Meaning | Use it for |
|---|---|---|
| 系统信息 | System information | shows the model and memory; nothing to change |
| 固件备份 | Firmware backup | **saving the full copy** (section 3) |
| 固件更新 | Firmware update | **putting software on the router** (sections 4 and 5) |
| 恢复出厂设置 | Restore factory settings | not needed; do not use |
| 环境变量编辑 | Environment variables | do not touch |
| 重启 | Restart | restarts the router |

## 3. Save a full copy of the router (backup)

Do this before installing Virox. It saves **everything** on the router: Breed itself, the radio
calibration and device number (MAC) of this exact unit, the software and its settings.

1. Click **固件备份** ("Firmware backup").
2. Click the button **EEPROM**. Save the file (it is small: the radio calibration and the device
   number of this unit).
3. Click the button **编程器固件** ("full flash"). Save the file. It is about **128 MB** and takes a
   few minutes. This one file is the whole memory of the router.
4. Copy both files to a USB stick as well, and keep it safe. **This full copy belongs to this one
   router**: never put it on another router (each router has its own calibration and number).

## 4. Put Virox on the router (when the router does not start)

**You need** the file ending with **`-squashfs-factory.bin`** from the release page (see
[INSTALL.md](INSTALL.md), steps 1 and 2: download it the same way and check its numbers against the
line of `sha256sums` that ends with `factory.bin`).

1. Open Breed (section 1).
2. Click **固件更新** ("Firmware update").
3. Next to **固件** ("Firmware"), click the file button and choose the `-squashfs-factory.bin` file.
   Leave every other box (编程器固件, Bootloader, EEPROM) **unticked**.
4. Make sure **自动重启** ("Restart automatically") is ticked.
5. Click **上传** ("Upload"). The next page shows the file's details; click **更新** ("Update").
6. **Wait 5 minutes. Do not unplug the router.** It restarts with Virox, like a new router.
7. Open `http://192.168.72.1` and do the setup as in [INSTALL.md](INSTALL.md), step 5.

## 5. Put the full copy back (the router exactly as before Virox)

**You need** the **编程器固件** ("full flash") file you saved in section 3 **from this same router**.

1. Open Breed (section 1).
2. Click **固件更新** ("Firmware update").
3. Tick **编程器固件** ("full flash") and choose your full-flash file. Leave the other boxes
   unticked.
4. Click **上传** ("Upload"), then **更新** ("Update").
5. **Wait 10 minutes. Do not unplug the router.** It restarts with its old software and its old
   settings.

> These are Breed's standard pages. They are confirmed on the GAPM-7200 in the hardware tests before
> the final version, and pictures are added then.
