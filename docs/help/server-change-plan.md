---
title: Change Plan
summary: Review resources, licences, backups, costs and irreversible address releases.
keywords: [resize, plan, ip release, address, cost, licence, reinstall, transfer]
---

# Change Plan
Use Change Plan to review the current server beside its proposed plan, memory, storage, IPv4 count, backup retention, offsite settings and licences. The final review includes the resulting monthly cost.

## Before applying
Choosing another base size changes the included transfer allowance shown in the Data row. Check it alongside the resource and licence rows. Required licence groups must have a valid selection. Optional pre-action backups need an available slot or an explicitly selected backup to replace.

Keeping the image preserves it; choosing to reinstall destroys the disks. Do not confuse reinstall with an in-place upgrade. BinaryLane controls plan eligibility and address allocation; see [changing a plan](https://support.binarylane.com.au/support/solutions/articles/1000015174-can-i-change-my-plan-).

## Worked example
Suppose a server has a primary address and an extra address 192.0.2.25. Reduce its IPv4 count by one, then select that extra address for release. The primary address is not offered: it is tied to the server's lease, as described in the [resize API](https://api.binarylane.com.au/reference/#tag/ServerActions).

The confirmation includes this exact note with the example address:

“Releasing 192.0.2.25. Released addresses go back to the pool and may be assigned to someone else; update DNS and any allow-lists first.”

Move DNS, allow-lists and services before releasing it. Review the before-and-after table, type the server name and confirm. The server restarts to apply the change. Check History and the resulting interfaces afterwards.

## Replacing and reinstalling
Replacing an extra address also returns the old address to the pool and requires typing the name. Reinstalling adds a disk-destruction warning. Cancel if either effect is unexpected. [Additional addresses](https://support.binarylane.com.au/support/solutions/articles/11000047363-can-i-purchase-additional-ip-addresses-) are purchased through Change Plan; use the current form for available quantities and pricing.
