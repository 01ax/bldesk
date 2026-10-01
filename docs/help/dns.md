---
title: DNS
summary: Manage hosted zones and records, with export before zone removal.
keywords: [dns, zone, record, ttl, a, aaaa, cname, mx, export]
---

# DNS
Use DNS to browse hosted zones, add records and delete records. The zone list pages through the account rather than stopping at the first batch; unused zones are labelled for review.

## Add and delete records
Choose a zone and Add Record, then enter its type, name and value. The form sends no TTL, so BinaryLane's default applies: its API reference gives 3600 seconds as the default and only supported value. There is no TTL input or existing-record editor. MX records ask for a priority, SRV records for a priority, weight and port, and CAA records for flags and a tag, because BinaryLane needs them; the palette adds A, AAAA, CNAME, MX (with a priority), NS and TXT records, but not SRV or CAA. These are limits of BLDesk's current controls, not a claim that the DNS API cannot edit records.

Deleting a record does not flush resolver caches: previous answers may remain until their TTL expires.

The [palette](help:palette#dns) can prepare a DNS record, but still requires review before writing.

## Worked example
For an example zone example.com with three loaded records, the irreversible dialog is titled “Remove DNS hosting” and says:

“Deletes the DNS zone for example.com and all 3 records in it.”

Your dialog uses the actual domain and record count. If the zone file is available, use “Copy the zone file first” and save that copy before proceeding. Type the domain only if you intend to remove all hosted records. Without a zone file available, export your records independently before removing hosting.

For deleting one record, use its record action instead. Check History and authoritative DNS afterwards. Changing records in BLDesk does not update your registrar's nameserver delegation automatically.
