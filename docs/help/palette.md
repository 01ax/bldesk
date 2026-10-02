---
title: Command palette
summary: Navigate or prepare actions using verbs and explicit target patterns.
keywords: [commands, verbs, targets, glob, tags, groups, two Enter]
---

# Command palette
Open the palette with Cmd/Ctrl+K. Search by name, IP or tab, or start with a verb. Inspect the selected result before pressing Enter.

## Targets
Targets: a name (or prefix), a glob like wp-*, #id, an IPv4 or its prefix, @group or @tag, or several separated by commas.

The active profile defines the fleet being searched. A prefix or glob may match several servers. @name can refer to a local group or tag; it is not a BinaryLane permission boundary. Plain text in a target is always a server (name, glob, #id or address) and @name is always a tag or group, never the other way round: with a server called web and a tag called web, restart web acts on the server and restart @web on the tagged servers. A server whose name starts with @ is addressed by its #id or address. Quote values containing spaces. The names and addresses below are examples, not your resources.

## Power
Reboot requests a clean restart; shutdown delivers an ACPI signal, which the guest may ignore. Poweroff cuts power and cycle cuts power before restarting: unsaved data can be lost. Start powers on a stopped VM.

```
reboot wp-*
shutdown #12345
poweroff broken-vm
start @staging
cycle jumpbox
```

Aliases include restart; stop/halt; power-off/kill; boot/poweron/power-on; and powercycle/power-cycle, respectively. See [power-state caveats](help:servers).

## Backups
Take a temporary backup, optionally supplying a quoted label. The command uses replacement_strategy: oldest. It uses a free temporary slot first; if none is free, BinaryLane replaces the oldest unlocked, unattached temporary backup, which will no longer be available. Use the Backups form if you need to choose a specific slot or replacement. The command does not restore an image or change purchased retention.

Before you confirm, the review reads the backups of each target that has any, four at a time, while it says “Checking which backups would be replaced…” and Run waits. BinaryLane's API reference does not say how many temporary backups a server can hold, so the palette cannot tell whether a slot is free. Instead, for every target that holds a temporary backup that is not locked or attached, an amber note says:

“If a server has no free temporary slot, BinaryLane replaces its oldest temporary backup that is not locked or attached, and the replaced backup will no longer be available. The backup that would be replaced on each server is listed below.”

Each line under it gives the server, then the backup's name, ID, slot and date. A target with no such backup gets no line, and the note does not appear when no target has a line. A target whose backups could not be read is listed as “example-server: could not list its backups, so BLDesk cannot say which would be replaced”. History records a take that may replace a backup as destructive and lists the backup in its “Replaced if no slot is free” row. Escape or Back takes no backup.

```
backup db "before upgrade"
```

Aliases: backups, bak. Older snapshot/snap spellings remain accepted, but the product calls them backups.

## DNS
Prepare a record in a hosted zone. MX needs a priority, and no other type takes one. SRV and CAA records need more fields (a priority, weight and port; flags and a tag), so the palette refuses them and points to Add Record on the DNS tab. Inspect the matched zone and record fields before writing.

```
dns add A www.example.com 192.0.2.25
dns add MX example.com mail.example.com 10
```

## Tags
Add or remove local tags; later use @name as a target. These edits stay on this device and do not change cloud permissions or write cloud History.

```
tag add staging wp-*
tag remove staging #12345
```

A tag name is lower-cased and keeps letters, numbers, dots, dashes and underscores; anything else, such as a space or a slash, is dropped, and the preview shows the name that will be stored. A name with nothing left is refused. A tag that no server had is given a colour of its own (see [tag colours](help:server-settings#tag-colours)).

To list the servers that carry a tag, type @ and part of its name, such as @word, without a verb. The tags in use that start with word come first, as rows with the tag's colour and how many servers have it: choose one with Up, Down and Enter or a click and the box reads @name, which lists that tag's servers, and nothing is run. A tag typed in full has no row of its own, because there is nothing left to complete. Below those, the results are the servers with a tag that starts with word, several @ words must all match, and each result opens like any other server. Plain text lists servers by name or address only, never by tag; when plain text is also exactly a tag's name, one extra Tags row offers to list that tag's servers.

Aliases: tags, group; rm also means remove.

## Create
Apply a saved or built-in whole-server template. This opens the prefilled Create Server form for review, not an immediate deployment.

```
create web-new from "Web starter"
```

Use a template name that exists in your installation. Aliases: new, deploy. See [the template worked example](help:templates#worked-example).

## Access and links
SSH opens an embedded desktop tab as root unless Prefer native terminal is enabled. Add --native to force the OS terminal. Android retains its SSH-app handoff. See [Terminal](help:terminal). Console opens the rescue console. Open navigates to the matching server and optional sub-tab; link copies its bldesk URL.

```
ssh jumpbox
ssh jumpbox --native
console #12345
open web-01 firewall
link web-01 network
```

Aliases: rescue for console, show for open, copy for link. Check ambiguous matches before launching access tools.

## Navigation and help
Go opens a top-level tab. Help without words, or ?, shows the verb list. Help with words searches bundled client documentation. Ask, or ??, opens Help and submits only the supplied question to the published-article service.

```
go help
help firewall
ask how do I enable ipv6
```

Go aliases: goto, tab. Help search does not submit a cloud mutation. Keep account details out of an Ask question.

## Worked example
For a mutating command, the first Enter opens the palette's own review panel; the second runs it. Check the command and every expanded target. This panel does not show the shared dialog's severity, change table or diff. Navigation commands run directly; Create uses the create form as its review.

For Shutdown matching one server, the panel heading is:

“Confirm: Shutdown (graceful) on 1 target”

The target list appears below it. Run submits the action; Esc · Back returns to input. The shared dialog's ACPI warning is not displayed here. After confirming, inspect History and the actual power state: submission is not evidence that the guest obeyed the signal.
