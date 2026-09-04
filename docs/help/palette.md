---
title: Command palette
summary: Navigate or prepare actions using verbs and explicit target patterns.
keywords: [commands, verbs, targets, glob, tags, groups, two Enter]
---

# Command palette
Open the palette with Cmd/Ctrl+K. Search by name, IP or tab, or start with a verb. Inspect the selected result before pressing Enter.

## Targets
Targets: a name (or prefix), a glob like wp-*, #id, an IPv4 or its prefix, @group or @tag, or several separated by commas.

The active profile defines the fleet being searched. A prefix or glob may match several servers. @name can refer to a local group or tag; it is not a BinaryLane permission boundary. Quote values containing spaces. The names and addresses below are examples, not your resources.

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
Take a temporary backup, optionally supplying a quoted label. This does not restore an image or change purchased retention.

```
backup db "before upgrade"
```

Aliases: backups, bak. Older snapshot/snap spellings remain accepted, but the product calls them backups.

## DNS
Prepare a record in a hosted zone. MX and SRV need priority; inspect the matched zone and record fields before writing.

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

Aliases: tags, group; rm also means remove.

## Create
Apply a saved or built-in whole-server template. This opens the prefilled Create Server form for review, not an immediate deployment.

```
create web-new from "Web starter"
```

Use a template name that exists in your installation. Aliases: new, deploy. See [the template worked example](help:templates#worked-example).

## Access and links
SSH opens your native terminal as root. Console opens the rescue console. Open navigates to the matching server and optional sub-tab; link copies its bldesk URL.

```
ssh jumpbox
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
For a mutating command, the first Enter opens the review; the second runs it when required fields are complete. Check the expanded targets, severity and any diff before that second Enter. Navigation commands run directly; Create uses the create form as its review.

For Shutdown, the confirmation says:

“Sends an ACPI shutdown signal. The OS decides whether to honour it — BinaryLane reports the signal delivered, not the server off.”

After confirming, inspect History and the actual power state. Two Enter presses are a review workflow, not evidence that the guest obeyed the action.
