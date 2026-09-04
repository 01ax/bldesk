---
title: Confirm and History
summary: Understand review severity, typed confirmation and outcome tracking.
keywords: [confirm, destructive, irreversible, type to confirm, audit]
---

# Confirm and History
Cloud changes use a shared review dialog with the target, a plain-language summary, and a change table or diff where appropriate. Read the target even when you reached it from a search.

## Three severities
- Normal: a routine change with a blue confirmation button.
- Destructive: a disruptive change with a red button, such as hard power off or replacing firewall rules.
- Irreversible: a red action requiring you to type the target name, such as restore, rebuild or cancellation.

Escape, the close button or Cancel dismisses a review before submission. The question mark opens the worked example and cancels the current review; return to the action to review it again.

## Worked example
For a restore, the dialog title is “Restore from backup”. Its note says:

“Take a backup first if the current state might be needed again.”

Typing the correct name enables confirmation; it does not make restoration reversible. See the [complete restore example](help:backups#worked-example).

## What gets recorded
Cloud changes record their submitted and final outcomes per profile in [History](help:history). Diagnostics do not require confirmation because they change nothing. Local tags, groups and profile changes do not become cloud History entries.

Create Server uses its form as the review and records the result without adding a redundant second dialog. A History entry is evidence of an attempt and its reported outcome, not an automatic rollback.
