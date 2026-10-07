# SSH key association verification

Follow-up to [SSH_KEYS_SPEC.md](SSH_KEYS_SPEC.md), tested on macOS on 6 September 2026. Package version: 1.0.61-beta.3.

## Automated checks

- `npm run typecheck`: Node/renderer TypeScript and mutation, UI, help and PTY guards passed.
- `npm run test:terminal`: passed association → last working → default resolution, no first-key fallback, profile isolation, manual/learned source, missing-path fallback/pruning, corrupt storage, and explicit-key-only `IdentitiesOnly=yes` argv assertions.
- Fake-clock session tests: not learned at 9,999 ms, learned at 10,000 ms; exit 255 at three seconds does not learn; normal nonzero exit learns; deliberate close does not learn; exits arriving before the open reply are handled. Learning remains pinned to the originating profile.
- `npm run build`: passed.
- `scripts/terminal-smoke.mjs`: actual Electron, OpenSSH and node-pty against disposable SSH protocol fixtures; no production account or live server used. Existing terminal, native handoff, password prompt, broadcast and restart regressions passed.

## Two-key proof

The smoke test generates two key pairs. Two local SSH listeners each accept a different key. A test-only SSH wrapper routes the second dummy address to the second loopback port (macOS does not expose 127.0.0.2 by default); it does not change identity arguments. The isolated SSH configuration supplies key 1 as the default, disables the real agent and uses temporary known_hosts. Neither the user's SSH configuration nor private files are touched.

The test sets each association through Remote Access, quits Electron and relaunches with the same isolated profile. The connect picker resolves key 2 with the associated label. Broadcasting `hostname` to both hosts produces exit **0 / 0**, and each association becomes learned. Clearing both associations and the last-working fallback, while keeping both key files discoverable, produces **0 / 255**. That negative control proves per-host key selection is doing work; key discovery alone is insufficient.

The fixture implements a deterministic SSH command response, not a full VPS shell. `IdentitiesOnly=yes` presence/absence is proved separately by argv assertions; this smoke does not simulate an agent containing many unrelated identities.

Native Electron layout checks cover 1024×680 and 1280×840 at 80%, 125% and 150%, including the per-server key selector and existing terminal/broadcast review controls. Renderer errors: none. Test processes and listeners close in the harness's cleanup block; temporary fixture data remains in the reported system temporary directory for inspection.

## Packaged app real-server verification

Completed on macOS on 6 September 2026 using the packaged native binary (`release/mac-arm64/BLDesk.app`) against two live BinaryLane cloud servers accepting different SSH keys:

- **Server 1**: a test server (Ubuntu 24.04 LTS), configured with SSH key A. Negative control: rejects key B with exit 255.
- **Server 2**: a second test server (Ubuntu 24.04 LTS), configured with SSH key B. Negative control: rejects key A with exit 255.

### Verification flow and findings

1. **Clean baseline**: The test profile had its local storage associations cleared.
2. **Individual connection & learning**:
   - In Embedded SSH connect bar, selected Server 1 with key A. Connected successfully to live PTY session. Kept session live >= 10s; learning timer triggered and persisted `{ <Server 1 id>: <path of key A> }` with source `learned` and updated `lastWorking`.
   - In connect bar, selected Server 2 with key B. Connected successfully to live PTY session. Kept session live >= 10s; learning timer triggered and persisted `{ <Server 2 id>: <path of key B> }` with source `learned` alongside the existing association.
3. **Persistence across restart**: Quit the packaged Electron app completely and relaunched. Checked local storage: both associations remained intact.
4. **Broadcast execution**:
   - Opened Embedded SSH → Broadcast panel.
   - Entered a target expression naming both servers, separated by a comma.
   - Broadcast target preview table automatically resolved distinct keys per host:
     - Server 1: key A
     - Server 2: key B
   - Broadcast command `hostname` was confirmed and executed in parallel across both live servers.
   - Both panes completed with exit **0 / 0**, each outputting its own server's hostname.
5. **Remote Access UI**:
   - Navigated to Server 1's details → Remote Access: "Key for this server" displayed key A with note *"Learned from an SSH session"*.
   - Navigated to Server 2's details → Remote Access: "Key for this server" displayed key B with note *"Learned from an SSH session"*.
6. **Teardown**: Original `authorized_keys` restored on Server 1, re-verifying key B connectivity.

Packaged Windows/Linux and Android were not retested for this desktop key-selection change. No release, version bump, commit or push is part of this verification.

## Semantics and boundaries

The ten-second live rule is intentionally a heuristic: OpenSSH may still be waiting at an authentication prompt. A later exit 255 does not undo a previously learned association. A deliberate close or signal is not treated as a successful short-session exit. Native launches cannot report success and never learn.

Only paths and source metadata are stored in `bldesk_ssh_keys_<profileId>`. All production association writes supply the discovered key list to prune unavailable paths. Discovery reads public `.pub` files and checks corresponding private-path existence; BLDesk does not read private-key contents. OpenSSH performs private-key access. No SSH configuration editing, key import, secret storage or cross-device sync was added.

Help source checks are recorded in [HELP_VERIFICATION.md](HELP_VERIFICATION.md).
