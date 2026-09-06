---
title: SSH keys
summary: Manage account public keys and distinguish them from local private keys.
keywords: [ssh, public key, private key, fingerprint, authentication]
---

# SSH keys
Use SSH Keys to register public keys in BinaryLane and inspect their fingerprints. These are the public keys you can select when building a server.

## Keep private keys local
Only paste a public key into the account form. Your SSH private key belongs on your device. The server header's local-key selector chooses a file for SSH, embedded or native; it does not upload that private key.

Desktop connection selectors offer keys discovered from .pub files in ~/.ssh with a corresponding private-key file. BLDesk reads the public file and checks whether the private path exists; it never reads the private file's contents. OpenSSH reads the private key when connecting.

For a key stored elsewhere or under a nonstandard filename, open the server's Remote Access tab and choose Browse… beside Key for this server. Select the existing OpenSSH private-key file, not its public .pub file. No matching .pub file is required when browsing. BLDesk remembers the exact full path including the filename for this profile/server; it does not copy, import or read the selected file's contents. The filename appears in the selector and the full path under Key file. Cancelling the browser leaves the selection unchanged.

BLDesk never stores key passphrases. OpenSSH prompts when necessary, or your existing SSH agent handles unlocking. A file browser cannot verify the key's format without reading it: choose a format supported by your system OpenSSH, not a PuTTY .ppk file unless you have separately converted it. If you move or rename the file, browse to it again; broadcast skips a missing associated file.

Key for this server in [Remote access](help:server-remote-access) stores only that existing file path, per profile and server. Embedded SSH can also learn the path from a session; native launches cannot. No private-key material is retained, so there is no private-key secret for BLDesk to encrypt. These local associations are separate from the public keys registered with BinaryLane and are not synced between devices.

Adding an account key does not automatically update every existing guest's authorized_keys.

## Worked example
Deleting an account key shows:

“Removes the public key from your BinaryLane account. Servers that already have it installed keep it.”

If a key is compromised, deleting it here alone is insufficient: remove it from each affected guest and rotate credentials. If a connection fails, compare the intended public key with the local private key and see [Remote access](help:server-remote-access).
