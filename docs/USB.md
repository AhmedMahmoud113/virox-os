# A USB disk and a USB printer on Virox

Page: **Settings → USB disk and printer**. Both are off until you switch them on.

## USB disk (flash stick or USB hard disk)

1. Plug the disk into the router's USB port. It is ready within seconds. FAT, exFAT, NTFS and ext4
   disks work.
2. On the page, switch on **Share on the home network**. Give the share a name in English letters
   (for example `Virox`).
3. A password is optional. Without one, every device at home can open the disk. With one, the user
   name is `virox` and the password is the one you typed.
4. The guest network and the internet can never reach the disk. The folder of the nightly backups
   (`virox-backups`) is not shown in the share, because it holds Wi-Fi passwords.

### Open the disk

- **Windows:** open **File Explorer**, click in the address bar at the top, type
  `\\192.168.72.1\Virox` (the router's address, then the share name) and press **Enter**.
- **Android:** use a file manager app that supports **SMB** or **Network** (the maker's Files app or a
  known file manager) and add a server with the router's address.
- **iPhone:** **Files** app → the three dots at the top → **Connect to Server** → type
  `smb://192.168.72.1` → **Connect**.

### Before you unplug the disk

Click **Safe remove** next to the disk on the page, wait for the message **You can unplug the disk
now**, then unplug it.

## USB printer

1. Plug the printer into the router's USB port and switch on **Share the printer** on the page.
2. **Windows:** **Settings → Bluetooth & devices → Printers & scanners → Add device** → click **Add
   manually** ("The printer that I want isn't listed") → choose **Add a printer using an IP address
   or hostname** → type the router's address (`192.168.72.1`), port `9100`, device type **TCP/IP
   Device** → choose the printer's driver from its maker.
3. **Android:** the printer maker's app, or a print service that can print to port 9100 (raw) at the
   router's address.

The printer is not visible from the guest network or the internet.
