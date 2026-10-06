---
title: Servers
summary: Browse your fleet and understand power actions and inferred state.
keywords: [list, grid, filter, power, signal sent, running, off, samples]
---

# Servers
Browse the active account's servers, filter the list, and switch between grid and list layouts. Servers that are still building are listed first, then the rest by name. Select a server for its detailed controls. The context menu gives you Open, SSH, copy actions and power controls.

Archived is BinaryLane's status for a server that is powered off due to non-payment. The Archive filter shows only those servers.

## Power is not reachability
BinaryLane's server status does not reliably report a powered-off VM. BLDesk infers power from performance sample freshness and follows power actions with a hypervisor check. Old samples are evidence, not proof: collection or connectivity problems can also make them stale. See the [API's server diagnostics](https://api.binarylane.com.au/reference/#tag/ServerActions).

The fleet sample sweep runs every two minutes. A newest sample older than 15 minutes is inferred as off; a missing timestamp is unknown. After a tracked power action settles, BLDesk waits eight seconds before one is_running diagnostic. Its verdict takes precedence over samples for 20 minutes. These are client inference rules, not a guarantee of guest health.

The reachability badge checks a port from your device. It does not prove that the application is healthy. See [port 22 unreachable](help:troubleshooting#port-22-unreachable).

## Tags
Each server's local tags show as small chips after its name, in the table and in the grid: the first three, then a +N chip whose tooltip lists the rest. Double-click a chip to rename the tag, choose its colour or remove it from that server; with the keyboard, focus the chip and press Enter or F2. Tags are kept on this device for the active account profile and BinaryLane does not store them. The Tags section of a server's [Settings](help:server-settings#tags) adds and edits its tags too. On a phone, that is a window narrower than 768 px or the Android app, the chips in the list and in the Fleet matrix are only labels, because a double-click is not something a finger does: add, edit and remove tags in the server's Settings, in the Tags section. The Android back button closes an open tag list or tag editor (an open colour picker goes with its editor) before it goes back a screen. The tag editor panel on a phone starts below the status bar.

Servers and tags are searched separately. Plain text in the search box finds servers by name, address or #id, and never by tag. A word that starts with @ finds tags: @word matches every tag that starts with word, live as you type, and several @ words must all match. An @ word is never compared with a server name, so a server called web and a tag called web do not mix: web finds the server, @web the servers with the tag. Combine them to narrow further: wp @wordpress finds servers with wp in the name that also carry a tag starting with wordpress. Typing @ lists the tags in use; choose one with the arrow keys and Enter, or click it. A server whose name itself starts with @ cannot be found by that name in the search: use its address or #id.

The tag filter next to the region and status filters, “All Tags” by default, opens a list with a tick box for each tag in use, its colour and its server count. With several ticked, Any (the default) shows servers with at least one of them and All shows servers with every one; Clear unticks them. It combines with the search and the other filters. A ticked tag that is renamed, or removed from its last server, drops out of the selection.

## Worked example
Choose Shutdown when you want the guest to shut down cleanly. The confirmation says:

“Sends an ACPI shutdown signal. The OS decides whether to honour it — BinaryLane reports the signal delivered, not the server off.”

A successful signal is not proof of shutdown. Check the resulting power state. Reboot requests a clean OS restart; Power off cuts power; Power cycle cuts power and starts again. Unsaved guest data can be lost with either hard power action.

## Create and organise
Create Server opens the review form for hostname, image, region, plan, networking, keys and backups. Check the price and terms before submitting. The plan table's Price column is before tax. The plus amounts beside the backup and IP address options are what choosing the option adds to the Monthly Total, so they are on the total's basis: with the account's tax added they say so (for example incl. GST), and while the tax cannot be worked out they say before tax. Offsite backups need on-site ones: with none selected, the offsite choice is cleared and not sent. In View All, the SSH keys ticked are the ones deployed, and with none ticked no key is deployed. The account's default keys are ticked when the form opens, and a reload of the key list does not tick them again once you have changed the selection. Choosing an image and then going back to the previous one returns the storage to what the plan includes, unless you picked a storage size yourself. If BinaryLane does not return the locations, the form says “Couldn't load the locations.” with a Retry link instead of showing none, so a missing list is not mistaken for no locations. For repeatable builds use [Templates](help:templates). Palette targets can use [local tags and groups](help:palette#targets).
