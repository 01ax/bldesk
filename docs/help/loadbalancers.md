---
title: Load balancers
summary: Manage traffic distribution, forwarding and backend membership.
keywords: [load balancer, pool, forwarding, health check, backend]
---

# Load balancers
Use Load Balancers to inspect the active account's balancers, deploy one and manage backend servers and forwarding configuration. Check the chosen region, VPC and listener settings.

## Before changing a pool
Verify that each backend serves the expected port and health-check endpoint. Adding a server to a pool does not configure the application inside it. Review the proposed changes and follow their History outcome.

## Worked example
Deleting a balancer warns:

“Traffic distribution stops immediately and the load balancer's address is released. There is no undo.”

Move traffic and update DNS before confirming. Type the load balancer's name when asked. Deleting a balancer is not the same as removing one backend.

## Check the result
Test the public service and backend health separately. [Map](help:map) shows the balancer relationship; it does not prove that requests are succeeding.
