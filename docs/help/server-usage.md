---
title: Server usage
summary: Read CPU, memory, disk and network graphs over time.
keywords: [metrics, graphs, samples, cpu, memory, network, disk]
---

# Server usage
Use Usage for the selected server's performance history. Choose a day, week, month or year window and compare CPU, memory, disk and network activity.

## Reading the graphs
Graphs use BinaryLane sample sets, with independent scales per metric. Read each axis: equal-looking lines do not imply equal values. Live telemetry cards may be shown when graph samples are unavailable.

A gap means missing observations, not necessarily zero utilisation. Stale samples also feed BLDesk's [power-state inference](help:servers#power-is-not-reachability). A recent point does not prove your application is responding.

## Compare the fleet
Open [Heatmap](help:heatmap) to spot busy or quiet servers, then select one to return here. Refreshing or changing the time window is read-only. Performance history is supplied by BinaryLane, not recorded by leaving BLDesk open; see the [sample-set API](https://api.binarylane.com.au/reference/#tag/Servers).
