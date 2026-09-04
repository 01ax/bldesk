---
title: VPCs
summary: Manage private networks, membership and routing with explicit reviews.
keywords: [vpc, private network, subnet, routes, attach, detach, mtu]
---

# VPCs
Use VPCs to create private networks, inspect member servers and manage network membership and routes. Check the region and address range before creating or attaching resources.

## Guest networking
A cloud membership change does not update all guest routes or application dependencies for you. BinaryLane determines VPC behaviour; start with [what is a VPC](https://support.binarylane.com.au/support/solutions/articles/11000050498-what-is-a-vpc-do-i-need-one-). Verify guest addressing and MTU where required.

## Worked example
Before detaching a server, the confirmation warns:

“The server leaves its private network and reverts to the default public network. Anything reaching it over its VPC address will stop working.”

Move private dependencies before proceeding. Deleting a VPC instead warns:

“The private network and its address range are removed. There is no undo.”

Check remaining members, type the target's name and confirm only when the network is no longer needed. Inspect History afterwards. The [Map](help:map) helps you inspect relationships but is not a traffic capture.
