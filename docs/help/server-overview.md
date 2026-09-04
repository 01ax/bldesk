---
title: Server overview
summary: Inspect a server's identity, capacity, status and quick actions.
keywords: [overview, specifications, address, status, reachability]
---

# Server overview
Use Overview to check that you have the right server before acting. The header shows its name, ID, primary IPv4, region, plan resources and image. Copy link includes the currently selected sub-tab.

## Quick actions
Select a local SSH key and launch native SSH, or open the rescue console. A failed reachability probe is a reason to investigate, not proof that the VM is off. Power actions and diagnostics have different effects; [Servers](help:servers) explains the distinction.

## Worked example
If you choose a hard Power off, the confirmation says:

“Cuts power at the hypervisor. Equivalent to pulling the plug: anything unsaved in the guest is lost.”

Cancel if you intended a clean shutdown. Submitted actions continue in the background; [History](help:history) records their outcome.

## Next steps
Use Usage for historical graphs, Network for interface settings, Settings for disks and hypervisor options, and Change Plan for billing-affecting resource changes. Opening these tabs changes nothing.
