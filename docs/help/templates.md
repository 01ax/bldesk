---
title: Templates
summary: Capture and reuse whole-server definitions with per-build variables.
keywords: [template, yaml, starters, variables, capture, import, export, cloud-init]
---

# Templates
Use Templates for repeatable whole-server builds: plan, image, networking, keys, firewall, tags and cloud-init together. A template is a local definition, not a managed relationship with existing servers.

## Create and share
Start with a built-in starter, capture an existing server, or create a new template. Import a file or paste YAML; export one or all when sharing. Review captured cloud-init and defaults for secrets first.

Definitions use kind bldesk/server-template@1. Desktop files live under the app's userData/templates directory; the folder button reveals saved files. Mobile stores templates locally. VPC and SSH key references use names for portability but must resolve in the target account.

## Worked example
Apply a starter, give the new server a hostname and fill its variables. The hostname variable is built in; secret values are supplied for this apply and are not saved as defaults. Review the rendered data, then proceed to Create Server.

There is no extra confirm dialog to quote for deployment: the Create Server form is the review. Check region, image, resources, networking, backups, licence costs and terms before submitting. Creating starts billing.

After creation, a background job waits for the server and applies the template's firewall and tags. Watch the job result and History. A failed follow-up does not roll back or cancel the newly created server; inspect the actual state before trying again.

## Deleting a template
The local delete confirmation says:

“Removes the template from this device. Servers built from it are not affected.”

Deleting a definition is not cloud cancellation. To destroy a server use its [Cancel tab](help:server-cancel).
