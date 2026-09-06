# Per-server SSH connect address — build spec

Status: **implemented locally; automated verification passed; real-tailnet acceptance pending**. See [SSH_HOST_VERIFICATION.md](SSH_HOST_VERIFICATION.md). Answers issue #56. Follow-up to `docs/SSH_KEYS_SPEC.md`; read that and `AGENTS.md` first.

## The problem

Every SSH entry point builds `root@<primary public IPv4>`. Users who firewall port 22 on the public address and reach servers over a private network (Tailscale MagicDNS names, `100.x` tailnet addresses, WireGuard, VPC-only bastions, `~/.ssh/config` Host aliases) cannot use any SSH button, the palette, the tray, deep links or broadcast. The connect bar already accepts any host, so the capability exists; the resolution does not.

BLDesk spawns the system `ssh`. Any name that resolves in the user's terminal resolves here, including MagicDNS and `~/.ssh/config` entries. Nothing Tailscale-specific belongs in the app.

## What to build

### 1. Store: extend `lib/sshKeyAssociations.ts`

Rename nothing; add to the same per-profile record:

```ts
type ConnectMode = 'public' | 'name' | 'custom'
profileDefault: { connect: 'public' | 'name' }           // default 'public'
servers[serverId].connect?: { mode: ConnectMode; host?: string }   // custom requires host

resolveConnection(profileId, server, localKeys): { host: string; username: 'root'; privateKeyPath?: string; origin: { host: 'public'|'name'|'custom'|'default-name'; key: 'associated'|'last used'|'ssh default' } }
```

Resolution for host: the server's own `connect` if set → the profile default → the primary public IPv4. `'name'` uses `server.name` verbatim as the hostname (validated by `validateSshTarget`; a name that is not a valid hostname, e.g. contains spaces, falls back to public and the UI says why). `'custom'` uses the stored host after `validateSshTarget`. Key resolution is unchanged from the keys spec; this function simply returns both.

Storage stays path/host strings only; nothing secret.

### 2. Every entry point uses `resolveConnection`

Replace the `primaryIpv4(server)` → `openSsh({ host })` pattern in: ServerList row button and context menu, ServerDetails header and Remote Access, NetworkMap panel, palette `ssh <server>`, `bldesk://ssh/<id>`, tray "SSH as root" (already routes through the deep link), reopen-after-restart, and BroadcastPanel per host. `openSsh` takes the resolved options; it does not resolve itself.

Broadcast preview gains a host column beside the key column, and a server whose resolved host fails validation is skipped with "invalid connect address".

### 3. UI

- **Remote Access tab**, beside "Key for this server": **Connect to** select with *Public address (x.x.x.x)*, *Server name (`<name>`)*, *Custom…* which reveals a host input. Below it one line: "SSH buttons, the palette, the tray and broadcast use this address. The reachability badge still checks the public address." No confirm; local only (rule 7).
- **Settings for the profile**: a **Default SSH address** toggle, public or server name. Put it where "Prefer native terminal" lives in the terminal header, since that is the only terminal preference surface today; do not add a settings page for one toggle.
- **Connect bar**: when a server is picked, host pre-fills from `resolveConnection` and the existing origin label gains the host origin, e.g. "server name · associated key".
- **Reachability badge**: unchanged behaviour; when an override is active, its tooltip says "Checks the public address; SSH connects to `<host>`".

### 4. Help and docs

`docs/help/server-remote-access.md` (the select, the three modes, the badge caveat, the fact that MagicDNS / ssh config names work because the system ssh resolves them), `docs/help/terminal.md` (broadcast host column, default-address toggle), `docs/help/troubleshooting.md` under "Port 22 unreachable": a paragraph for firewalled-public-port setups pointing at Connect to. Quote control names from the components. CHANGELOG under Unreleased; FEATURES #1 one line; close #56 from the PR.

## Verification

- `npm run test:terminal`: resolution order for host (server override → profile default → public), name mode with an invalid server name falls back, custom mode validation, `resolveConnection` returns both host and key.
- Electron smoke: extend the loopback fixture so one host is reachable only under an alias name mapped in a test `~/.ssh/config`-style override (or a hosts entry the fixture controls); broadcast to two servers where one uses a custom host succeeds 0/0; with the override cleared that host fails 255.
- Manual: a server with port 22 firewalled publicly and a tailnet name, set Connect to → Custom, then the row SSH button, `ssh <name>` in the palette and a broadcast all connect.

## Out of scope

Detecting or reading Tailscale, resolving names inside BLDesk, probing private addresses from the reachability badge, per-server usernames or ports beyond what the connect bar already offers (a follow-up if asked).
