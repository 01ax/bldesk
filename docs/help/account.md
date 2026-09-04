---
title: Account
summary: Inspect account details and distinguish them from local profile settings.
keywords: [account, profile, email, status, tax, payment method]
---

# Account
Account is a read-only view of email and verification, status, tax code, additional IPv4 limit, two-factor authentication status, configured payment-method types, available credit and unbilled charges.

Update contact information, Configure authenticator app, Change password, Manage API access tokens, Newsletter options and Change billing details open mPanel. They are not inline editors. A saved profile name is a BLDesk label; it does not rename the remote account.

## Status and access
The component recognises Active, Incomplete, Warning and Locked, and displays other API status strings as returned. Read the displayed status; changing a local profile label does not resolve a remote restriction.

Token permissions are enforced by BinaryLane. An authentication failure may mean the token was revoked or lacks the required scope; do not put it in a help search.

## Related pages
Use [Getting started](help:getting-started) to add or switch saved profiles, [Billing](help:billing) for balances and invoices, and [History](help:history) for changes recorded on this device. Ask BinaryLane cannot inspect any of these account details.
