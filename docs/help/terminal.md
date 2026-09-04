---
title: Terminal
summary: Understand the terminal view and native SSH handoff.
keywords: [terminal, ssh, xterm, shell, native, private key]
---

# Terminal
The Terminal view currently provides a terminal-style display and native SSH handoff. It is not a persistent embedded SSH session, a broadcast console or a remote file manager.

## Connect to a server
Choose the server and a local key, then launch SSH. The actual session runs in your platform's terminal. Authentication prompts and session history belong there.

Your private key stays on your device; the account's public-key list is separate. See [SSH keys](help:keys).

## Limits
Do not expect commands typed in the display to execute on a server unless you have opened the native session. Closing BLDesk does not make its terminal display a saved transcript of that session. Use the rescue console from [Remote access](help:server-remote-access) if the guest's network path is broken.
