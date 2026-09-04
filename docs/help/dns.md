---
title: DNS
summary: Manage hosted zones and records, with export before zone removal.
keywords: [dns, zone, record, ttl, a, aaaa, cname, mx, export]
---

# DNS
Use DNS to browse hosted zones and edit their records. The zone list pages through the account rather than stopping at the first batch; unused zones are labelled for review.

## Edit records
Choose a zone, then add or edit the record type, name, value and TTL. MX and SRV entries need the relevant priority fields. Deleting a record does not flush resolver caches: previous answers may remain until their TTL expires.

The [palette](help:palette#dns) can prepare a DNS record, but still requires review before writing.

## Worked example
For an example zone example.com with three loaded records, the irreversible dialog is titled “Remove DNS hosting” and says:

“Deletes the DNS zone for example.com and all 3 records in it.”

Your dialog uses the actual domain and record count. If the zone file is available, use “Copy the zone file first” and save that copy before proceeding. Type the domain only if you intend to remove all hosted records. Without a zone file available, export your records independently before removing hosting.

For deleting one record, use its record action instead. Check History and authoritative DNS afterwards. Changing records in BLDesk does not update your registrar's nameserver delegation automatically.
