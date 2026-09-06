---
title: Remote access
summary: Launch SSH or the out-of-band console without uploading private keys.
keywords: [ssh, console, keys, root, connection, remote access, tailscale, magicdns, wireguard, vpn, bastion, private network, hostname]
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

## Connect to
On desktop, Connect to in Remote Access chooses the address used by SSH buttons, the palette, the tray, deep links and broadcast:

- Public address uses the server's primary public IPv4.
- Server name uses the BinaryLane server name as the SSH hostname. It must already resolve or match a Host alias in your SSH configuration. If the name is not a valid SSH address, BLDesk falls back to the public address and shows why.
- Custom… reveals Custom SSH host for a hostname, IP address or SSH-config alias. Enter only the host, not user@host, an ssh:// URL, command-line options or a port suffix. Invalid custom addresses are reported, not silently replaced with a public address.
- Use profile default removes the server override. Default SSH address in the Terminal header selects Public address or Server name for this profile. An explicit server choice takes precedence.

These preferences are local to this device and profile. They store address strings alongside key-path metadata, not credentials, and do not change the server's networking, firewall or DNS. Changing a preference does not move an already open SSH session.

## Company networks, VPNs and private SSH
If your company deliberately blocks public port 22 and permits administration only over a private network, leave that firewall policy in place. Connect the required VPN or overlay network on this device, then set Connect to → Custom… to the server's private address or alias. For example, use an existing Tailscale MagicDNS name, a tailnet IP, or a hostname reachable over WireGuard. If every BinaryLane server name matches your company's SSH names, Default SSH address → Server name avoids setting each one individually. Server name uses the full name verbatim; to use only a short name, enter it under Custom….

BLDesk runs system OpenSSH on desktop. Your operating system resolves DNS names (including MagicDNS when configured), and OpenSSH applies matching Host entries from your SSH configuration, including configured HostName and ProxyJump routes through a bastion. BLDesk does not discover Tailscale, configure your VPN, read or edit ~/.ssh/config, or make an unreachable private network reachable. Check the equivalent ssh root@host command in your terminal first. Server buttons still request root; they do not inherit a different User from an alias. The connect bar lets you select another User and Port, which override those SSH-config values.

The reachability badge still checks port 22 at the public address; it does not test the custom SSH route. With an override, its tooltip says “Checks the public address; SSH connects to <host>”. A red public-address badge can therefore be expected even while private SSH works. Review the actual Host column before confirming a broadcast.

## Worked example
An SSH launch is not a cloud mutation and has no cloud-change confirmation. If you instead choose Shutdown from the shared controls, its dialog says:

“Sends an ACPI shutdown signal. The OS decides whether to honour it — BinaryLane reports the signal delivered, not the server off.”

Do not shut down merely because SSH failed. Start with [reachability troubleshooting](help:troubleshooting#port-22-unreachable) and [Keys](help:keys).
