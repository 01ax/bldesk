---
title: Change Plan
summary: Review resources, licences, backups, costs and irreversible address releases.
keywords: [resize, plan, ip release, address, cost, licence, reinstall, transfer, ip address, add ip, ipv4, extra address]
---

# Change Plan
Use Change Plan to review the current server beside its proposed plan, memory, storage, IPv4 count, backup retention, offsite settings and licences. The final review includes the resulting monthly cost.

## Before applying
Choosing another base size changes the included transfer allowance shown in the Data row. Check it alongside the resource and licence rows. Required licence groups must have a valid selection. Optional pre-action backups need an available slot or an explicitly selected backup to replace.

When the temporary slot is the one used, the same note as in Take Backup appears under the slot picker: “A temporary backup is kept for up to 48 hours, and at most two can be taken of a server in any seven day period.”

Allow for the pre-action temporary backup when planning your takes. In the 23 October 2026 live API check, one ordinary temporary backup followed by a temporary pre-action replacement during a RAM resize used both allowed takes; the next Take Backup request was refused and the pre-action image remained available. See [Backups](help:backups) for the lifetime and allowance.

Use a free slot lists only empty slots in the server's current backup setup, not retention you are about to buy. A server without scheduled backups can use its empty temporary slot. If it already holds a temporary backup and has no other free slots, choose Replace an existing backup and select the backup to replace; the chosen backup is deleted to make room. Locked and attached images are not offered for replacement. If a selected image becomes unavailable, choose again before applying. While the backup list is loading or its first read has failed, BLDesk cannot offer a free slot. Retry a failed read before continuing with that choice.

Scheduled pre-action backup types must have capacity before the resize and remain enabled afterwards. A type being disabled is excluded from both the free-slot picker and named replacements. If a selected replacement becomes unavailable, choose again before applying. Use a type that remains enabled so the pre-action backup can be kept, or download a backup and retain a separate copy before changing plans.

The summary rows, including Monthly (before tax), are before tax. Billing then shows Monthly Change and Monthly Total on the account's tax: with the tax added they say so (for example incl. GST), and while the tax cannot be worked out they say before tax.

Reducing scheduled retention deletes the oldest backups above the new limit, including locked or attached images. Setting a count to 0 removes all existing backups of that type. Slot replacement is different: it skips locked or attached images. The confirmation for any retention reduction is at least destructive (a reinstall or released address makes it irreversible and asks for the server's name):

“Reducing scheduled backup retention deletes the oldest backups above the new limits. Setting a count to 0 removes all backups of that type. Locked or attached backups can be deleted too.”

Keeping the image preserves it; choosing to reinstall destroys the disks. Do not confuse reinstall with an in-place upgrade. BinaryLane controls plan eligibility and address allocation; see [changing a plan](https://support.binarylane.com.au/support/solutions/articles/1000015174-can-i-change-my-plan-).

## Worked example
Suppose a server has a primary address and an extra address 192.0.2.25. Reduce its IPv4 count by one, then select that extra address for release. The primary address is not offered: it is tied to the server's lease, as described in the [resize API](https://api.binarylane.com.au/reference/#tag/ServerActions).

The confirmation includes this exact note with the example address:

“Releasing 192.0.2.25. Released addresses go back to the pool and may be assigned to someone else; update DNS and any allow-lists first.”

Move DNS, allow-lists and services before releasing it. Review the before-and-after table, type the server name and confirm. The server restarts to apply the change. Check History and the resulting interfaces afterwards.

## Replacing and reinstalling
Replacing an extra address also returns the old address to the pool and requires typing the name. Reinstalling adds a disk-destruction warning. Cancel if either effect is unexpected. [Additional addresses](https://support.binarylane.com.au/support/solutions/articles/11000047363-can-i-purchase-additional-ip-addresses-) are purchased through Change Plan; use the current form for available quantities and pricing.
