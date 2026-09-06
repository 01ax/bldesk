# SSH connect-address verification

Implementation of [SSH_HOST_SPEC.md](SSH_HOST_SPEC.md), addressing [issue #56](https://github.com/termau/bldesk/issues/56). Unreleased follow-up to 1.0.61-beta.4. No version bump, commit, push or release in this work.

## Scope and source audit

The existing `bldesk_ssh_keys_<profileId>` record now also holds the profile address default and per-server connect preferences. Existing key records remain readable; key learning preserves address preferences, and address writes preserve keys. No private key material, VPN integration, SSH-config editing, new credentials or network probe was added.

`resolveConnection` in `lib/sshKeyAssociations.ts` resolves public/name/custom host and the unchanged key order. Invalid names fall back to public with a warning; invalid custom destinations remain invalid and cannot spawn through the existing SSH validator. Public mode requires an actual public IPv4 rather than substituting a private address.

`lib/openServerSsh.ts` loads local key metadata, resolves the server for the originating profile and hands final options to `openSsh`; `openSsh` no longer resolves preferences. Audited callers: ServerList row/grid/context menu, ServerDetails header/Remote Access, NetworkMap, CommandPalette, and `lib/deeplinks.ts`. Tray SSH uses that deep-link route; its former public-IP enable condition is removed. TerminalView picker and reopen, and BroadcastPanel, use the same resolver. Broadcast retains its confirmation and History flow and validates the resolved host rather than requiring public IPv4.

The existing reachability implementation is unchanged apart from tooltip text. The address origin and key source are displayed as separate labels in the connect bar. Remote Access also offers Use profile default so users can remove a server override without forcing public mode.

## Automated verification (macOS, 6 September 2026)

- `npm run typecheck`: main/renderer checks and mutation, UI, help, PTY and updater guards.
- `npm run test:terminal`: host precedence, profile isolation, invalid-name fallback/warning, invalid custom-host validation, combined host/key resolution, key/address write preservation, private-only broadcast eligibility and invalid-address skips; existing key and PTY tests remain included.
- `npm run build`: production bundle build.
- `scripts/terminal-smoke.mjs`: actual Electron/OpenSSH/node-pty, isolated user data and disposable loopback SSH fixtures. The existing two-key positive and negative tests pass. The address test persists Custom SSH host through an Electron restart and verifies the profile default and picker. With a test SSH-config alias mapped to the reachable loopback interface, two-host broadcast returns **0/0**. Clearing only the address override, with identities unchanged, returns **0/255** because the dummy public destination maps to an unavailable loopback interface. No real VPN, cloud server or user SSH configuration is involved.
- Native Electron layout matrix: 1024×680 and 1280×840 at 80%, 125%, 150%; address selector/custom input, key selector and existing broadcast confirmation controls remain reachable. Renderer errors: none on the completed loopback run.

The SSH protocol fixture returns deterministic command output rather than running a VPS shell. The negative control proves address selection, not Tailscale integration. Listeners, Electron and SSH children are cleaned up by the harness; temporary fixture artifacts are retained under the system temporary directory named in its report.

## Remaining manual acceptance

Final rebuilt-app regression passed, including inspection of the persisted alias in native handoffs from the server row and the deep-link path used by the tray. Native handoff was stubbed to avoid opening the user's terminal; actual OpenSSH connectivity was exercised by the broadcasts. Final fixture report: `bldesk-terminal-smoke-VyK1zt` under the system temporary directory, 12 connections, 11 authenticated, no renderer errors. An intermediate added row test timed out because it remained on server detail; correcting the harness to choose All Servers resolved it without an application change.

Not performed: a real server with public port 22 firewalled and a working tailnet name, exercised through the row button, palette and broadcast. No production server or VPN was changed or accessed. Use the installed VPN on the test device, set Remote Access → Connect to → Custom…, and verify all three paths before release. Packaged Windows/Linux and Android have not been retested for this change.

When opening the implementation PR, include `Fixes #56` so the issue closes on merge, not before review. User-facing source verification is recorded in [HELP_VERIFICATION.md](HELP_VERIFICATION.md).
