---
title: Firewall
summary: Edit a server's external firewall rules, audit the fleet's and preview ruleset copies.
keywords: [rules, edit, reorder, drag, save changes, add rule, source, destination, magnifier, 100 rules, first-match, matrix, copy ruleset, tag, port 22 unreachable]
---

# Firewall
Use Server mode to edit one server's external rules, or Fleet matrix to compare the fleet, audit rules and copy a known ruleset across selected targets.

## Rules and access
BinaryLane's external firewall uses ordered first-match rules, with no implicit deny at the end. Rules apply to IPv4 and are separate from guest filtering. See [BinaryLane's firewall guide](https://support.binarylane.com.au/support/solutions/articles/11000033088-external-firewall).

Before applying an import or clone, inspect the complete diff. Allowing SSH in this list cannot start sshd or override a guest firewall.

The Fleet matrix and the [network map](help:map) read these rules the same way when they say a port is open to the world. For each of the server's public IPv4 addresses they follow the rules from first to last for traffic coming from anywhere, and the first rule that matches decides. A port range is read as BinaryLane writes it, `start:end`, with both ends included. A rule that lists named sources, such as an office address, is not traffic from anywhere, so it neither opens nor closes a port to the world. They read a rule that names only a private address or a VPC range, or another server's address, as not applying to that traffic, because a rule's destination is the address a packet is sent to. A server with no public IPv4 address, such as one that is only in a VPC, has nothing open to the world.

A port that no rule decides counts as open, because BinaryLane lets through traffic that matches no rule. A list with no final drop leaves everything it does not mention open, so the audit flags SSH, RDP, VNC, Docker and databases on it unless a rule for that address drops them first. That includes a list that only allows SSH from an office address: nothing there matches anyone else, so SSH is still open to them. The audit's flags and the SSH count look at TCP; the map's port label counts a port as open if either TCP or UDP gets through. IPv6 is not read, because the external firewall does not cover it.

## Edit, reorder and remove rules
In Server mode every rule is a row you can change in place: its source addresses, destination addresses, destination ports, protocol, action and description. Put one address or port on each line; commas and spaces work too. Nothing is sent to BinaryLane while you edit. A row you have changed is marked “Edited”, and a bar headed “Unsaved changes” says how many rules were edited, how many were removed and whether the order changed, with the buttons “Discard” and “Save changes”.

Under each source, destination and destination ports cell is a magnifier with a caret. It opens a list of ready-made values, and the one you choose replaces what the cell holds, as an edit like any other. The source and destination lists offer, in this order: “My Other Addresses”, “My Other Public Addresses” and “My Other Private Addresses” (every other server on the account), one entry for each other server that shows the address it puts in, then this server's own “Server Public Addresses”, “Server Private Addresses”, “Server All Addresses” and each of its addresses on its own, and “Any address”, which is 0.0.0.0/0. An entry that has no address behind it is left out, such as a server's public addresses when it is only in a VPC, and a server's failover addresses count as public. A server's own entry shows its private address, or its public one when it has no private address. The ports list offers “80,443 (HTTP+HTTPS)”, “80 (HTTP)”, “443 (HTTPS)”, “22 (SSH)”, “25 (SMTP)”, “3389 (Remote Desktop)”, and three ranges: “System ports” (0:1023), “User ports” (1024:49151) and “Dynamic ports” (49152:65535). Escape or a click elsewhere closes a list, and the arrow keys, Home, End and Enter work in it. The list of servers is the one BLDesk already holds. Opening a magnifier does not ask BinaryLane for it again, so a server created after BLDesk last read its server list is not in the menu until it has (BLDesk reads the list about every 15 seconds while it is on screen), and a list that is open does not change while you choose from it. mPanel's menu works the same way: with a rule list open in one tab, a server created in another tab is not in it until the page is loaded again. A magnifier is off when its cell is, and for the ports of an ICMP rule.

To move a rule, drag it by any part that is not one of its fields, dropdowns or buttons, or use the arrows beside its number. While you drag, a bar marks the space between rules that it will go into, and that space opens a little wider; above the first rule and below the last are spaces too. No rule is highlighted. On a touch screen, touch and hold such a part of the rule (its number, a label, or the space around its fields) until the rule lifts (a phone that can vibrate does), then drag it where it should go and let go. A finger that moves before the rule lifts is scrolling the page, and moves nothing. While you carry a rule, holding it near the top or bottom of the part of the page you can see scrolls the list, slowly at first and faster the longer you hold it there, so a rule can be taken the length of a long list. The part you can see leaves out a bar over the page, such as a phone's bottom navigation, and the rule goes where you let go, including over the space above the first rule or below the last. The remove button marks a rule “Removed”: it stays where it is, dimmed, with an “Undo” button until you save.

Save changes reads the server's rules again, asks for one confirmation that shows the whole list as it will be written, reads them once more when you confirm, and then writes the list and records one History entry. If the rules cannot be read, or are no longer the ones you started editing, nothing is sent: “Couldn't save the firewall changes” says why, and your changes stay on screen (a change found only after you confirmed is recorded in History as failed, and not sent). If the write fails, or BinaryLane accepts it and then reports that it failed, your changes are back on screen as unsaved changes so you can correct them or try again. Saving changes that remove every rule is confirmed like Disable firewall: you type the server's name.

A row that cannot be saved is marked, and Save changes stays off until it is fixed. A source or destination cannot be left empty, because BLDesk does not read an empty cell as any address; write 0.0.0.0/0 for that. Every address must be an IPv4 address or range. A TCP or UDP rule that had ports cannot be left with none, and a rule switched to TCP or UDP needs some. An ICMP rule has no ports, and a description is at most 250 characters.

Your changes are kept while BLDesk is open, one set for each server, if you choose another server or leave the screen, and the server picker marks a server that has some. They are never applied by themselves, and closing BLDesk drops them. While changes are waiting, Add Rule, Import, Clone, Export and Disable Firewall are off, because each would write or read a list that leaves them out. If the server's rules change after you started editing, the bar is replaced by:

“This server's rules changed after you started editing. Discard your changes to load the current rules, then make them again.”

Save changes is not offered then, and the cells are off until you discard.

## Add, import and clone
Rules are evaluated first to last, so the order in the confirmation's diff is the order that is written. A new rule goes immediately ahead of the first drop rule that would swallow it, so that it can match: one that drops its protocol (or every protocol), its ports (or all ports), its sources and its destinations, or more. If no rule would swallow it, it goes last. A drop that covers only some sources, such as a block on one address, stays in front of a new accept rule, so the block still applies. Addresses and ports are compared as written, so a range that contains another is not recognised. Adding Drop All and then an SSH rule leaves the SSH rule in front of it.

Add Rule opens a form with the same fields as a row, in the same order: Source, Destination, Destination ports, Protocol, Action and Description, with a magnifier under each address and ports field. Source and Destination start as 0.0.0.0/0, which is any address; one address or port to a line, commas and spaces work too. BinaryLane requires every rule to name a destination, and source and destination addresses must be IPv4 addresses or ranges, so a source or destination left blank is written as 0.0.0.0/0, and the diff shows it. A TCP or UDP rule needs ports; the ports are off for ICMP and ALL. The presets (SSH (22), HTTP/HTTPS, WireGuard and Drop All) fill the form in, ports and description included, and put 0.0.0.0/0 back in Source and Destination. Save Rule asks for one confirmation and writes the whole list with the new rule in its place.

BinaryLane keeps at most 100 rules for a server. mPanel says so beside its New Rule button, and the API refuses a longer list; its reference does not state the limit. At 100 rules Add Rule is off and the note “Firewall rules are limited to 100 per server.” is shown beside it, and an import of more than 100 rules is refused before it asks you to confirm. Removing a rule and saving brings Add Rule back.

Import checks the JSON before it asks you to confirm. Each rule needs an action of accept or drop, a protocol of all, icmp, tcp or udp, and at least one source address; addresses must be IPv4 addresses or ranges and a description at most 250 characters, and the first rule that does not meet this is named. A rule with no destination addresses is written with 0.0.0.0/0 as well, and fields the API does not define are not sent. An import of an empty list removes every rule, and so does saving changes that remove every rule, so both are confirmed like Disable firewall: you type the server's name.

## While a change is being applied
BinaryLane applies a firewall change as an action that finishes a few seconds after it is accepted. Until then the list on screen is the one from before the change, and the card says:

“A change to this server's firewall rules is still being applied. Editing is switched off until it lands, because every save writes the whole list back.”

Add Rule, Import, Clone, Disable Firewall and each rule's cells, move controls and remove button are off meanwhile. Add Rule, Import, Clone and Disable Firewall are also off while the list is being read again; the cells are not, so a refresh does not interrupt typing. When the change lands the list is read again and they come back. After Save changes the list shows the rules you saved straight away, and the read made when BinaryLane has finished replaces it with what the server holds. Closing the progress toast does not bring them back early: BLDesk keeps following the action, out of sight, until it finishes.

## When the rules cannot be read
Every save in Server mode writes the server's whole rule list back, so BLDesk offers a change only after it has read that list. “Firewall Inactive / Open” means the list was read and is empty. If BinaryLane does not return it, the card says:

“Couldn't read this server's firewall rules.”

It shows what went wrong and the note:

“Editing is switched off until they load, because every save writes the whole list back.”

Add Rule, Import, Clone and Export stay off. Retry asks again, and so does leaving the tab and coming back.

Clone replaces the destination's list, so it needs the destination's current rules too. It reads them when you press Apply Rules. If BinaryLane does not return them, the dialog stays open and says, for an example destination web-base:

“Couldn't read the firewall rules on web-base. Nothing was changed: a clone replaces the target's whole list, so it needs the current one first.”

No confirmation opens and nothing is sent. Press Apply Rules again to try again.

If the rules loaded and a later refresh fails, the card is headed “Couldn't refresh this server's firewall rules.” and the last list stays on screen under the note “The list below is from the last successful load.” Add Rule, Import, Disable Firewall and each rule's cells, move controls and remove button are off until Retry succeeds. Export and Clone still use the list on screen.

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
