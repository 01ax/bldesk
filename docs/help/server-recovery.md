---
title: Server recovery
summary: Check guest diagnostics and boot rescue mode when normal access fails.
keywords: [recovery, diagnostics, uptime, ping, rescue, host]
---

# Server recovery
Use Recovery to run VPS diagnostics or boot into rescue mode when normal guest access fails. This is separate from password reset and OS rebuild in Settings.

## Guest versus host
VPS Ping Check and VPS Uptime query the guest. They are read-only diagnostics and do not ask for confirmation. The host node and host uptime shown above them describe the hypervisor, not how long your guest has been running.

## Worked example
Choose “Boot into Rescue Mode” only if you intend to change the server's boot environment. The dialog title is “Enable Rescue Mode” and its summary says:

“Submits "Enable Rescue Mode" to BinaryLane.”

Check the target before confirming, follow the action to completion and use the rescue console to inspect the resulting environment. Opening the console alone does not enable rescue mode.

For password reset or destructive OS rebuild, use [Settings](help:server-settings#rebuild-and-password-reset). To replace the live disk with an older image use [backup restore](help:backups#worked-example). Follow actions through [History](help:history); submission is not completion.
