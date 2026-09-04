---
title: History
summary: Inspect local, per-profile change records and their real outcomes.
keywords: [history, audit, submitted, completed, failed, pending, jsonl]
---

# History
Use History to see cloud changes recorded by this BLDesk installation for the selected profile. Entries include the target, review details and outcome. It is not a complete account-wide audit log of work done in mPanel or other tools.

## Submitted is not completed
Long-running actions are followed in the background. An action may succeed, fail, need user interaction, wait for an invoice or become unavailable to the tracker. Read its final status and detail before deciding whether to repeat it.

Firewalls copied across several targets produce separate results. One target's success does not imply that every target succeeded.

## Local storage
Desktop logs live under userData/changelog/<profileId>.jsonl. The store retains up to 5,000 entries per profile; the normal view loads a recent subset. Protect these files: they contain resource names and change details.

Clearing History removes local records, not cloud resources, and offers no cloud undo. [Confirm and History](help:confirm-and-history) explains which actions are recorded and why local-only edits are excluded.
