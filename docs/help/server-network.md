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
Choose the public network in the VPC selector and choose Move. For a server named web-01, the confirmation says:

“Move web-01 to the public network? Its private IP will change and existing private connections will drop.”

Your server's name replaces web-01. This is a normal-severity review; the separate VPCs page's Detach action uses different wording. Review dependencies first. Changing membership does not update application configuration for you. See [VPCs](help:vpcs).
