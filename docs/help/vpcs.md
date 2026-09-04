---
title: VPCs
summary: Create private networks, inspect members and detach servers.
keywords: [vpc, private network, subnet, attach, detach]
---

# VPCs
Use VPCs to create private networks with a name and an IP range, inspect member servers, detach a member or delete a network. The create form has no region selector, route editor or MTU control. To move a server into a VPC, use its [Network tab](help:server-network).

## Guest networking
Before detaching a member, identify anything using its private address. BLDesk's membership controls do not edit application configuration inside the guest. For the service's networking behaviour, see [what is a VPC](https://support.binarylane.com.au/support/solutions/articles/11000050498-what-is-a-vpc-do-i-need-one-).

## Worked example
Before detaching a server, the confirmation warns:

“The server leaves its private network and reverts to the default public network. Anything reaching it over its VPC address will stop working.”

Move private dependencies before proceeding. Deleting a VPC instead warns:

“The private network and its address range are removed. There is no undo.”

Check remaining members, type the target's name and confirm only when the network is no longer needed. Inspect History afterwards. The [Map](help:map) helps you inspect relationships but is not a traffic capture.
