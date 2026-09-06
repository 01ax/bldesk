# Per-server SSH key association — build spec

Status: **implemented locally; automated verification passed; packaged real-server acceptance passed**. See [SSH_KEYS_VERIFICATION.md](SSH_KEYS_VERIFICATION.md). Follow-up to the embedded terminal (`docs/TERMINAL_SPEC.md`). Read `AGENTS.md` first.

## The problem

A user with several private keys in `~/.ssh` and a fleet where different servers accept different keys cannot use BLDesk for anything multi-server:

1. The connect bar, every SSH button and broadcast all default to the **first local key with a private file**. Nothing remembers which key worked for which server, and a session that succeeded with a chosen key teaches BLDesk nothing.
2. Even when the right key is passed with `-i`, OpenSSH still offers agent and default identities first, so a server that wants the fourth key returns `Too many authentication failures` before it is tried.

## What to build

### 1. Association store (per profile, local, not secret)

`lib/sshKeyAssociations.ts`, pure, alongside `serverGroups.ts`:

```ts
loadKeyAssociations(profileId): Record<number /*serverId*/, string /*privateKeyPath*/>
setKeyAssociation(profileId, serverId, privateKeyPath | null)
lastWorkingKey(profileId): string | undefined      // most recent successful explicit key on this profile
resolveKeyFor(profileId, serverId | undefined, localKeys): string | undefined
```

localStorage key `bldesk_ssh_keys_<profileId>`. It stores **paths only**; BLDesk never reads, copies or persists key material. Say that in the help page. Paths that no longer exist in the local key list are ignored at resolve time and pruned on the next write.

`resolveKeyFor` order: the server's association → `lastWorkingKey` → `undefined` (no `-i`; ssh's own config and agent decide). Never "first key in the list".

### 2. Learn on success

In `lib/terminalSessions.ts`, when a session was opened with an explicit `privateKeyPath` and a `serverId`: if it is still `live` ten seconds after open, or has exited with any code other than 255, call `setKeyAssociation` and update `lastWorkingKey`. If it exits with 255 within that window, do nothing. Broadcast panes follow the same rule per host. Native launches cannot report, so they do not learn.

### 3. `IdentitiesOnly=yes` when BLDesk chooses the key

`sshArgv` gains `-o IdentitiesOnly=yes` **only when `privateKeyPath` is set**. When BLDesk passes no `-i`, ssh behaves exactly as it does in a terminal. Update the `check-pty-guards.mjs` expected spawn expression if the argv builder's shape changes, and the terminal unit test's argv assertions.

### 4. UI

- **Remote Access tab**: a "Key for this server" select (local keys, plus "Use default") showing the current association and whether it was learned or set by hand. Changing it is local; no confirm (rule 7: local-only, non-destructive).
- **Connect bar** (`TerminalView`): when a server is chosen from the picker, the key select pre-fills from `resolveKeyFor`, and the label says "(associated)" / "(last used)" / "(ssh default)".
- **Broadcast preview**: the eligible list shows the key that will be used per host, or "ssh default". A host whose association points at a missing key file shows "key missing" and is skipped like a host with no address.
- **Server list / context menu / palette `ssh`**: no UI; they resolve silently.

### 5. Help and docs

`docs/help/server-remote-access.md` (the select, what is stored, that key files are never read), `docs/help/terminal.md` (broadcast per-host key column, IdentitiesOnly behaviour and why), `docs/help/keys.md` one paragraph linking to it. Quote control names from the components. CHANGELOG under Unreleased. FEATURES #1 gains a line.

## Verification

- `npm run typecheck`, `npm run test:terminal` with new cases: resolve order, learn-on-success timing (live at 10 s → saved; exit 255 at 3 s → not saved), pruning of missing paths, argv contains `IdentitiesOnly=yes` only with a key.
- Electron smoke (`scripts/terminal-smoke.mjs`): extend the loopback fixture with two host identities accepting different keys; a broadcast to both with associations set succeeds with exit 0 on each; the same broadcast with associations cleared and both keys present fails on one host with 255, proving the fix is doing work.
- Manual, on the packaged app: two real servers with different keys, connect to each once by hand choosing the key, quit, relaunch, broadcast `hostname` to both without touching the key select.

## Out of scope

Editing `~/.ssh/config`, importing keys, passphrase handling (ssh prompts in-session as today), and syncing associations between machines.
