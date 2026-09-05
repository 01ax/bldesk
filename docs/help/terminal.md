---
title: Terminal
summary: Understand the terminal view and native SSH handoff.
keywords: [terminal, ssh, xterm, shell, native, private key]
---

# Terminal
The Terminal view currently provides a terminal-style display and native SSH handoff. It is not a persistent embedded SSH session, a broadcast console or a remote file manager.

## Connect to a server
Enter User (root by default) and Host, choose a local key or the default SSH identity, then choose Launch Native SSH. There is no server chooser in this view. The actual session runs in your platform's terminal; authentication prompts and commands belong there.

Your private key stays on your device; the account's public-key list is separate. See [SSH keys](help:keys).

## Limits
The display is a static connection-information banner, not a shell or a transcript of the native session. Clear Terminal Screen clears that display only. Use the rescue console from [Remote access](help:server-remote-access) if the guest's network path is broken.
