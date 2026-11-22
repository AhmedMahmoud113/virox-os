# When something goes wrong

Find your situation below and follow its steps in order. Start with the first one that fits.

## 1. I cannot join the Wi-Fi (forgot the name or the password)

1. Find the **WPS** button on the router.
2. Press it and keep it pressed for **3 seconds**, then let go.
3. For 10 minutes the router opens an open Wi-Fi network called **Virox-Setup** (no password).
4. On your phone, open Wi-Fi and join **Virox-Setup**. The setup page opens by itself (if not, open
   `192.168.72.1` in the phone's browser).
5. Sign in with the router password. Open **Settings → Wi-Fi** to see or change the name and password.

## 2. Forgot the password / the settings are wrong: back to a new router

This erases everything you set up on Virox (settings, people, usage history, passwords). Virox stays
installed.

- **If you can still open the router's page:** **Settings → Router and sign-out → Back to a new
  router**, then confirm.
- **If you cannot:**
  1. Leave the router switched on.
  2. Press the **Reset** button (a pen tip or paper clip) and keep it pressed for **10 seconds**,
     then let go.
  3. Wait 3 minutes. The router starts like a new one and opens the **Virox-Setup** network for 60
     minutes. Do the setup again as in [INSTALL.md](INSTALL.md), step 5.

## 3. The router does not start (no Wi-Fi, no page, after 10 minutes)

The router has a small rescue program, **Breed**, that starts before everything else. With it you
can put Virox on the router again.

**You need:** a Windows computer with a network port, one network cable, and the file ending with
**`-squashfs-factory.bin`** from the same release page as in [INSTALL.md](INSTALL.md), step 1
(check it the same way as in step 2 there, with the line of `sha256sums` that ends with
`factory.bin`).

1. Unplug the cable from the internet modem to the router.
2. Connect the computer to one of the router's LAN ports with the network cable. Switch the
   computer's Wi-Fi off.
3. Unplug the router's power cable.
4. Press the **Reset** button and keep it pressed.
5. While you keep pressing, plug the power cable back in. Keep pressing for about **5 seconds**,
   then let go.
6. Wait one minute, then open a web browser and go to `192.168.1.1`. The Breed page opens. It is in
   Chinese; the steps below give the Chinese words to look for.
7. In the menu on the left, click **固件更新** ("Firmware update").
8. Next to **固件** ("Firmware"), click the file button and choose the `-squashfs-factory.bin` file.
9. Make sure **自动重启** ("Restart automatically") is ticked.
10. Click **上传** ("Upload"). On the next page, click **更新** ("Update").
11. **Wait 5 minutes and do not unplug the router.** It restarts with Virox, like a new router.
12. Open `http://192.168.72.1` and do the setup as in [INSTALL.md](INSTALL.md), step 5.

## 4. Put the router back as it was before Virox

You need the backup you made before installing ([BACKUP.md](BACKUP.md)), the file **编程器固件**
("full flash", about 128 MB) from the Breed backup.

1. Enter Breed as in section 3, steps 1 to 6.
2. Click **固件更新** ("Firmware update").
3. Tick **编程器固件** ("full flash") and choose your full-flash backup file.
4. Click **上传** ("Upload"), then **更新** ("Update").
5. **Wait 10 minutes and do not unplug the router.** It restarts with its old software and its old
   settings.

## 5. Nothing of the above works

The router can still be repaired through its serial port (a small connector inside the router). This
needs opening the router and a USB-to-serial (3.3 V) cable: ask a technician who repairs routers.

> Sections 3 and 4 use Breed's standard pages. They are confirmed on the GAPM-7200 in the hardware
> tests before the final version; pictures are added then.
