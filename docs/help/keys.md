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

Key for this server in [Remote access](help:server-remote-access) stores only that existing file path, per profile and server. Embedded SSH can also learn the path from a session; native launches cannot. No private-key material is retained, so there is no private-key secret for BLDesk to encrypt. These local associations are separate from the public keys registered with BinaryLane and are not synced between devices.

Adding an account key does not automatically update every existing guest's authorized_keys.

## Worked example
Deleting an account key shows:

“Removes the public key from your BinaryLane account. Servers that already have it installed keep it.”

If a key is compromised, deleting it here alone is insufficient: remove it from each affected guest and rotate credentials. If a connection fails, compare the intended public key with the local private key and see [Remote access](help:server-remote-access).
