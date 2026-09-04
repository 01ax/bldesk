---
title: Cloud-init
summary: Inspect provisioning data and reuse it in a server template.
keywords: [cloud-init, user data, provisioning, yaml, bootstrap]
---

# Cloud-init
Use Cloud-init to read stored user data and see whether the image supports it. Copy copies the displayed data. Save server as template captures the server's configuration and opens Templates for you to review and name it. The data area is read-only; this tab does not apply cloud-init to an existing guest.

## Read before reusing
Cloud-init can contain passwords, keys, package sources and scripts. Treat it as sensitive. Do not paste it into Ask BinaryLane or share an unreviewed capture.

Changing a template does not rerun cloud-init on an existing server. To reproduce a build, capture or edit a [whole-server template](help:templates), review its variables, and create a new server.

## Worked example
Applying a template leads to the Create Server review form, not a second confirmation dialog. Inspect the resolved cloud-init and the final plan before submitting. Secret variables are filled per apply and are not saved as template defaults. [Template worked example](help:templates#worked-example) walks through that flow.
