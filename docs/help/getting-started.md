---
title: Getting started
summary: Connect an account and switch between local profiles.
keywords: [profiles, token, vault, login, account]
---

# Getting started
BLDesk gives you BinaryLane account controls with desktop conveniences. Add a profile with your BinaryLane API token, then select it in the title bar. Check the active profile before making changes.

## Add an account
1. Create an API token in mPanel with the access you need.
2. Open the profile picker and add an account. Give the saved profile a recognisable name.
3. Paste the token and save. Your server list belongs to the selected account, not a combined fleet.

Token permissions are enforced by BinaryLane. See [BinaryLane's API guide](https://api.binarylane.com.au/reference/#section/Introduction).

## The local vault
Desktop profiles use Electron's operating-system-backed safeStorage when available. The implementation has an encoded fallback when secure storage is unavailable: encoding is not encryption. Protect your OS account and device. Android uses secure storage with a preferences fallback on unsupported environments.

Removing a saved profile does not cancel cloud resources or revoke its API token. Revoke a compromised token in mPanel.

## Find your way
Use the sidebar, a page's circled question mark, or [the command palette](help:palette). [History](help:history) and running actions are scoped to profiles. Local help works offline; cloud controls and Ask BinaryLane need a connection.
