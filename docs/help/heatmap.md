---
title: Fleet heatmap
summary: Compare utilisation across the fleet and drill into server graphs.
keywords: [heatmap, cpu, memory, utilisation, fleet, metrics]
---

# Fleet heatmap
Use Fleet Heatmap to compare utilisation across the active account without opening every server. Sort by a column heading and inspect CPU, RAM, disk, network and IO cells. Refresh fetches current fleet metrics; historical time windows belong to each server's Usage page.

CPU, RAM and disk colours compare usage with that server's capacity. Network and IO colours compare rates with the fleet's current maximum above the displayed minimum threshold. Read the values and legend rather than comparing unlike colours.

## Missing data
A missing sample is not zero usage. Compare timestamps and the metric's units before treating a quiet cell as spare capacity or a powered-off server.

## Drill down
Select a server to open its Usage tab and inspect the detailed graphs. The heatmap reads BinaryLane performance data; it does not run a workload or change the server.

For connection failures use [troubleshooting](help:troubleshooting), not colour alone. For inferred power state see [Servers](help:servers#power-is-not-reachability).
