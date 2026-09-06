---
title: Remote access
summary: Launch SSH or the out-of-band console without uploading private keys.
keywords: [ssh, console, keys, root, connection, remote access]
---

# Remote access
Use Remote Access to connect to the selected server. SSH opens an embedded desktop tab using the chosen local key unless Prefer native terminal is enabled. Android hands off to an SSH app. See [Terminal](help:terminal); no file upload is involved.

## SSH and console
Check the target address and key before connecting. Public keys saved in BinaryLane are separate from the private key files on your device. Adding an account key does not install it into every existing guest.

Use the rescue console when ordinary network access is broken. It follows BinaryLane's console path rather than the guest's SSH port.

## Key for this server
On desktop, choose Key for this server to associate a discovered local private-key path with this server in the current profile. The header selector changes the same association. Set by hand identifies your selection; Learned from an SSH session identifies an automatically remembered path.

Use default clears the server association. Selection then falls back to this profile's last working key, if still available, and finally OpenSSH's default identities/configuration. BLDesk never picks the first local key just because it exists. An unavailable path is ignored for an individual connection and pruned on the next key-association write; broadcast instead skips that server with key missing so a changed identity is visible before a fleet command.

Embedded sessions with an explicit key learn its association after the SSH process remains live for ten seconds, or exits normally with a code other than 255. An early exit 255 does not learn; manually closing a session does not count as a successful exit. This is a heuristic, not an authentication guarantee: a process can remain live while waiting for a prompt. Native-terminal launches cannot be observed and do not learn associations.

Only the file path is retained locally, separately for each profile. BLDesk does not read or store private-key contents; OpenSSH reads the existing file. There is no retained private-key secret to encrypt. The association is not uploaded or synced to another device.

## Worked example
An SSH launch is not a cloud mutation and has no cloud-change confirmation. If you instead choose Shutdown from the shared controls, its dialog says:

“Sends an ACPI shutdown signal. The OS decides whether to honour it — BinaryLane reports the signal delivered, not the server off.”

Do not shut down merely because SSH failed. Start with [reachability troubleshooting](help:troubleshooting#port-22-unreachable) and [Keys](help:keys).
