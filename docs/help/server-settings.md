---
title: Server settings
summary: Change labels, disks, hypervisor features, alerts, region and HA partner.
keywords: [rename, disk, resize, migrate, partner, alerts, features]
---

# Server settings
Use Settings for the server's display name, extra disks, advanced features, monitoring thresholds, location and high-availability partner. Review each change separately.

## Labels and guest configuration
Renaming changes the name in mPanel and the API, not the hostname inside the guest. Growing a block device does not grow its filesystem automatically. Hypervisor feature changes take effect on the next reboot.

## Worked example
For an example 20 GB secondary disk labelled data, deleting it warns:

“Permanently deletes the 20 GB secondary disk "data". Everything on it is gone.”

The actual size and label come from the selected disk. Check your backup and type the disk label (data in this example), not the server name. For an unlabelled disk, type its numeric ID. Confirm only if you intend to destroy it. A normal disk-growth confirmation instead says:

“Grows the disk. The filesystem inside the OS still has to be extended to use the space.”

## Migration and HA
Read the region-change review carefully; address retention and migration eligibility are BinaryLane decisions. Check the [migration guide](https://support.binarylane.com.au/support/solutions/articles/11000130817-how-to-migrate-your-server-change-location-) before scheduling it. Selecting an HA partner requests placement separation; it does not configure application failover.

## Rebuild and password reset
Settings also contains password reset, hard power cycle and OS rebuild. For an example image slug ubuntu-example, the rebuild confirmation says:

“Erases the disk and reinstalls from image "ubuntu-example". Every file on the server is destroyed; the IP addresses are kept.”

The actual image appears in your dialog. Take a backup, verify the target and type its name before choosing Rebuild. Rebuild is not an in-place OS upgrade. Password reset instead generates new credentials and emails the account address; anything using the old password stops authenticating.

For guest diagnostics and booting rescue mode see [Recovery](help:server-recovery).
