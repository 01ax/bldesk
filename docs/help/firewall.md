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

## Add, import and clone
Rules are evaluated first to last, so the order in the confirmation's diff is the order that is written. A new rule goes immediately ahead of the first drop rule that would swallow it, so that it can match: one that drops its protocol (or every protocol), its ports (or all ports), its sources and its destinations, or more. If no rule would swallow it, it goes last. A drop that covers only some sources, such as a block on one address, stays in front of a new accept rule, so the block still applies. Addresses and ports are compared as written, so a range that contains another is not recognised. Adding Drop All and then an SSH rule leaves the SSH rule in front of it.

BinaryLane requires every rule to name a destination, and source and destination addresses must be IPv4 addresses or ranges. A rule you add is written with 0.0.0.0/0, which is any destination, and the diff shows it.

Import checks the JSON before it asks you to confirm. Each rule needs an action of accept or drop, a protocol of all, icmp, tcp or udp, and at least one source address; addresses must be IPv4 addresses or ranges and a description at most 250 characters, and the first rule that does not meet this is named. A rule with no destination addresses is written with 0.0.0.0/0 as well, and fields the API does not define are not sent. An import of an empty list removes every rule, and so does deleting a server's last rule, so both are confirmed like Disable firewall: you type the server's name.

## While a change is being applied
BinaryLane applies a firewall change as an action that finishes a few seconds after it is accepted. Until then the list on screen is the one from before the change, and the card says:

“A change to this server's firewall rules is still being applied. Editing is switched off until it lands, because every save writes the whole list back.”

Add Rule, Import, Clone, Disable Firewall and each rule's move and delete buttons are off meanwhile, and while the list is being read again. When the change lands the list is read again and they come back. Closing the progress toast does not bring them back early: BLDesk keeps following the action, out of sight, until it finishes.

## When the rules cannot be read
Every save in Server mode writes the server's whole rule list back, so BLDesk offers a change only after it has read that list. “Firewall Inactive / Open” means the list was read and is empty. If BinaryLane does not return it, the card says:

“Couldn't read this server's firewall rules.”

It shows what went wrong and the note:

“Editing is switched off until they load, because every save writes the whole list back.”

Add Rule, Import, Clone and Export stay off. Retry asks again, and so does leaving the tab and coming back.

Clone replaces the destination's list, so it needs the destination's current rules too. It reads them when you press Apply Rules. If BinaryLane does not return them, the dialog stays open and says, for an example destination web-base:

“Couldn't read the firewall rules on web-base. Nothing was changed: a clone replaces the target's whole list, so it needs the current one first.”

No confirmation opens and nothing is sent. Press Apply Rules again to try again.

If the rules loaded and a later refresh fails, the card is headed “Couldn't refresh this server's firewall rules.” and the last list stays on screen under the note “The list below is from the last successful load.” Add Rule, Import, Disable Firewall and each rule's move and delete buttons are off until Retry succeeds. Export and Clone still use the list on screen.

## Copy a ruleset
### Worked example
Suppose source web-base has three rules and you select two different servers in a tag or local group. In Fleet matrix, filter to that set, choose the source, select the intended targets and start the copy.

The dialog title is “Copy firewall rules”. With both targets needing changes, it says:

“Replaces the rule list on each selected server with the 3 rules from web-base.”

The note says:

“Each server is written separately and recorded separately in History, so a failure on one does not affect the others.”

Review each target's diff, not just the count. Choose “Write to 2 servers”. Targets already matching the source are reported and skipped; the button count excludes them.

Check individual History outcomes and test connectivity. A partial failure leaves successful targets changed. Do not assume an all-or-nothing transaction.

### Servers that cannot be read
A copy replaces a server's whole list, so Fleet matrix needs each server's current rules first. A server whose rules could not be read is marked “unreadable”. It cannot be chosen as the source, its checkbox in the target list stays off, and the everyone link leaves it out, so a copy never writes to it. Refresh reads the fleet again.

The fleet read can be a minute old, so the Review diff button reads the source and every selected target again before it shows the diff, and what is written comes from those reads. A rule added to a target in the meantime appears in the diff as removed. A target that cannot be read at that point is left out and named in the confirmation; if the source cannot be read, nothing is changed. A server with no rules cannot be the source, because the copy would clear every rule on the targets: BLDesk says so and changes nothing.

## Port 22 unreachable
Use the badge and [troubleshooting steps](help:troubleshooting#port-22-unreachable) to separate local routing, external rules, guest rules and the SSH service.

## Disable firewall
### Worked example
For an example target web-base, Disable firewall says:

“Removes every rule. With no rules, BinaryLane's external firewall allows all inbound traffic to web-base.”

The note says:

“Export the rules first if you may want them back — there is no undo on the BinaryLane side.”

Review the full deletion diff and type the actual target name. Disabling the external rules is not the same as disabling the guest firewall.
