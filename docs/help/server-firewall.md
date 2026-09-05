---
title: Server firewall
summary: Review this server's ordered external firewall rules.
keywords: [firewall, rules, allow, block, ports, lockout]
---

# Server firewall
Use Firewall to inspect and edit the selected server's external rule list. This is cloud-edge filtering, separate from the guest firewall.

## Rule order
BinaryLane evaluates rules in order, with the first match deciding the result and no implicit final deny. The external firewall covers IPv4, not IPv6. Check the [BinaryLane firewall guide](https://support.binarylane.com.au/support/solutions/articles/11000033088-external-firewall).

Review the before-and-after diff when replacing a ruleset. Imported or copied rules can remove your current access rules.

## Worked example
To copy a known ruleset to several servers, use the top-level Firewall page's Fleet matrix. Its confirmation is titled “Copy firewall rules”; it includes a separate diff for every target.

See [copy a ruleset](help:firewall#copy-a-ruleset) for the exact example and partial-failure behaviour. A successful write does not prove SSH is reachable: check the guest firewall and service as well.
