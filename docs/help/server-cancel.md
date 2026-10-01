---
title: Cancel server
summary: Cancel a service with a reason and an explicit irreversible confirmation.
keywords: [cancel, delete, destroy, invoice, reason]
---

# Cancel server
Use Cancel only when you want to destroy the service. Shutting down a VM does not cancel it or stop the service's billing.

## Worked example
Open Cancel, read the target and choose the appropriate reason. Supply details when choosing Other. The confirmation says:

“Destroys the server and everything on it. The service is cancelled within five minutes and an invoice is generated for usage to date. Backups attached to it go with it.”

It also warns:

“There is no undo - BinaryLane keeps no copy of a cancelled server.”

When the server has a monthly price, a third line gives what it currently bills: the plan, extra memory and storage, the image surcharge, extra addresses, backups and licences, with the account's tax added and named when it has one. Until the server's licences have been read it says the server bills at least that amount. It is the figure Change Plan compares against, not a quote of the final invoice, which is for usage to date.

Copy any files and backups you need elsewhere first. Type the server name, then choose “Cancel server”. Cancel the dialog if you only wanted to power the VM off.

## Afterwards
History records the request and its outcome. Check Billing for outstanding usage. Cancellation timing and invoicing are BinaryLane service behaviour, not a local deletion; see the [server cancellation API](https://api.binarylane.com.au/reference/#tag/Servers).
