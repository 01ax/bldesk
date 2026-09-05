---
title: Firewall
summary: Audit the fleet's external firewall and preview ruleset copies.
keywords: [rules, first-match, matrix, copy ruleset, tag, port 22 unreachable]
---

# Firewall
Use Server mode to edit one server's external rules, or Fleet matrix to compare the fleet, audit rules and copy a known ruleset across selected targets.

## Rules and access
BinaryLane's external firewall uses ordered first-match rules, with no implicit deny at the end. Rules apply to IPv4 and are separate from guest filtering. See [BinaryLane's firewall guide](https://support.binarylane.com.au/support/solutions/articles/11000033088-external-firewall).

Before applying an import or clone, inspect the complete diff. Allowing SSH in this list cannot start sshd or override a guest firewall.

## Copy a ruleset
### Worked example
Suppose source web-base has three rules and you select two different servers in a tag or local group. In Fleet matrix, filter to that set, choose the source, select the intended targets and start the copy.

The dialog title is “Copy firewall rules”. With both targets needing changes, it says:

“Replaces the rule list on each selected server with the 3 rules from web-base.”

The note says:

“Each server is written separately and recorded separately in History, so a failure on one does not affect the others.”

Review each target's diff, not just the count. Choose “Write to 2 servers”. Targets already matching the source are reported and skipped; the button count excludes them.

Check individual History outcomes and test connectivity. A partial failure leaves successful targets changed. Do not assume an all-or-nothing transaction.

## Port 22 unreachable
Use the badge and [troubleshooting steps](help:troubleshooting#port-22-unreachable) to separate local routing, external rules, guest rules and the SSH service.

## Disable firewall
### Worked example
For an example target web-base, Disable firewall says:

“Removes every rule. With no rules, BinaryLane's external firewall allows all inbound traffic to web-base.”

The note says:

“Export the rules first if you may want them back — there is no undo on the BinaryLane side.”

Review the full deletion diff and type the actual target name. Disabling the external rules is not the same as disabling the guest firewall.
