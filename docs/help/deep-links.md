---
title: Deep links
summary: Open BLDesk pages from bldesk URLs and share contextual help.
keywords: [deep link, url, bldesk, account, copy link]
---

# Deep links
Use bldesk URLs in runbooks and messages to open the matching BLDesk page. The desktop app must be installed and registered as the scheme handler.

## Examples
```
bldesk://server/12345/network
bldesk://console/12345
bldesk://ssh/12345
bldesk://tab/dns
bldesk://home
bldesk://help/firewall#copy-a-ruleset
```

Server links accept a sub-tab; a missing or unknown sub-tab falls back to the overview. Help links open bundled documentation and can jump to a heading without looking up an account.

## Accounts and sharing
Resource links can include ?account=<profile name or email> to select a saved profile. If it does not match, routing uses the active profile. Always verify the resulting account and target. Help links do not switch profiles.

Copy link on a server includes its current sub-tab. Such links can expose server IDs or account labels; treat them as account context, not public help questions. SSH and console links launch access tools rather than merely showing text.

## Platform notes
OS registration is a desktop feature. Android external-scheme delivery is not implemented; in-app links still use the shared parser. See the repository's [deep-link implementation notes](https://github.com/termau/bldesk/blob/main/docs/DEEP_LINKS.md).
