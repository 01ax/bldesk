---
title: Load balancers
summary: Manage traffic distribution, forwarding and backend membership.
keywords: [load balancer, pool, forwarding, health check, backend]
---

# Load balancers
Use Load Balancers to inspect the active account's balancers, deploy one and attach or detach backend servers. The create form offers a hostname, Global Anycast or a region, HTTP (Port 80) or HTTPS (Port 443), and initial pool servers. Existing forwarding rules are displayed, not edited here. There is no VPC selector.

## Before changing a pool
Verify that each backend serves the selected protocol and passes the configured health check. BinaryLane supports a configurable health-check path and protocol in mPanel and the API. BLDesk does not currently expose those settings; creating here leaves the health check to the API defaults, including path /. Use mPanel to inspect or change the health-check endpoint. Adding a server to a pool does not configure the application inside it. Review membership changes and follow their History outcome.

## Worked example
Deleting a balancer warns:

“Traffic distribution stops immediately and the load balancer's address is released. There is no undo.”

Move traffic and update DNS before confirming. Type the load balancer's name when asked. Deleting a balancer is not the same as removing one backend.

## Check the result
Test the public service and backend health separately. [Map](help:map) shows the balancer relationship; it does not prove that requests are succeeding.
