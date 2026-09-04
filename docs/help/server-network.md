---
title: Server network
summary: Inspect interfaces and change IPv6, port blocking or VPC membership.
keywords: [ipv6, interfaces, port blocking, vpc, ddos, reverse dns]
---

# Server network
Use Network to inspect public and private interfaces, IPv6, port-blocking controls, VPC membership and Edge DDoS information for this server.

## IPv6 and guest configuration
Enabling an address through the API does not guarantee that a customised guest is configured to use it. Check both the cloud interface and the OS. BinaryLane's external firewall is IPv4-only; configure IPv6 filtering in the guest. See [configuring IPv6 on Linux](https://support.binarylane.com.au/support/solutions/articles/11000137324-configuring-ipv6-on-linux-vpss).

Adding or releasing paid IPv4 addresses belongs in [Change Plan](help:server-change-plan), not the interface list.

## Worked example
When detaching a server from its VPC, the confirmation warns:

“The server leaves its private network and reverts to the default public network. Anything reaching it over its VPC address will stop working.”

Review dependencies first. Changing membership does not update guest routes or application configuration for you. See [VPCs](help:vpcs).
