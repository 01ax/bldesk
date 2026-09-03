# BLDesk — Feature Expansion Ideas

Ideas for taking BLDesk from "mPanel in a window" to a fleet tool. Ordered roughly by how much each one changes what the app *is*. Each entry notes what already exists in the codebase that it builds on.

---

## 1. Real embedded terminal (pty)

**Today:** `EmbeddedTerminal.tsx` renders an xterm.js box with a banner; the only action is "Launch Native SSH", which hands off to Windows Terminal / Terminal.app / etc. The box itself never receives a session.

**Proposed:**
- Add `node-pty` to the main process. Spawn `ssh` with the argv already produced by `shared/ssh.ts` (`sshArgv`), pipe stdin/stdout over IPC to the xterm instance.
- Tabs per server, optional split view.
- Command palette action "SSH to <server>" opens a tab in-app instead of context-switching.
- **Broadcast mode:** pick a tag or glob (`wp-*`), type one command, see output fan out per host in a grid. Serial or parallel execution with a per-host status pill.
- Session persistence across app restarts (reconnect on launch), and a scrollback search.

**Why it matters:** this is the feature mPanel structurally cannot offer. It is the strongest reason to keep BLDesk open all day.

---

## 2. Fleet-wide firewall matrix

**Status: built** (unreleased at time of writing). `lib/firewallMatrix.ts` (pure: signatures, matrix, audit), `components/firewall/FirewallMatrix.tsx` (view, copy-ruleset, groups/tags), `lib/serverGroups.ts` (local groups + tags; `@name` targets). Not yet: named rule *sets* stored independently of a server (today you copy from a live server), and per-server quick edits from the grid.

**Before:** `FirewallManager.tsx` edited advanced firewall rules for one server at a time via `change_advanced_firewall_rules`.

**Proposed:**
- A matrix view: servers down the side, common rules across the top, cell = allow/deny/absent.
- Automatic audit highlights: `22/tcp` open to `0.0.0.0/0`, servers with no rules at all, rules referencing IPs that no longer belong to the account.
- "Copy this ruleset to N servers" with a diff preview per target before commit.
- Named rule sets stored locally (e.g. "web-standard", "db-private") that can be applied and re-applied.

**Why it matters:** answers "which of my 33 boxes still has SSH open to the world?" in one screen.

---

## 3. A tray / menu bar that earns its spot

**Status: built** (unreleased at time of writing). `src/main/tray.ts` owns the tray, its settings (`<userData>/tray.json`, edited from the menu itself) and the notification gate; `src/renderer/src/lib/fleetWatch.ts` pushes the fleet summary and diffs server state. Not yet: a tray badge for stopped servers (deliberately — a box you keep off would badge forever), and per-server quick actions beyond SSH.

**Before:** `createTray()` in `main/index.ts` offered "Open Dashboard" and "Quit". `Notification` was wired but only used on request. Servers were already polled every 15 s.

**Proposed:**
- Tray tooltip / badge with running / stopped / action-in-progress counts.
- Native notifications on server state change, action completion or failure (pairs with polling `/v2/actions/{id}`), and low prepaid balance from `useBalance`.
- "Quick SSH" submenu listing servers (feeds into #1).
- Optional launch-at-login, minimise-to-tray on close.

**Why it matters:** the app becomes something that runs in the background and tells you things, not something you remember to open.

---

## 4. Verb-first command palette

**Status: built** (unreleased at time of writing). Grammar lives in `src/renderer/src/lib/commands.ts` (pure, no React); the palette in `CommandPalette.tsx` resolves targets against the loaded server list, previews eligible / skipped / unmatched, and requires a second Enter before submitting. Not yet: `firewall allow …` (needs #2's fetch-merge-write per server), `tag …` (the API has no server tags), and argument completion beyond Tab-to-fill.

**Before:** `CommandPalette.tsx` fuzzy-matched server names / IPs / VPCs and navigation tabs.

**Proposed:** make the palette accept commands, not just nouns:

```
restart jumpbox
snapshot wp-web-3-bne
open console adamhomenet
ssh 43.224
dns add A foo.example.com 203.0.113.9
firewall allow 443/tcp wp-*
tag add prod wp-*
```

- Glob and tag matching on server names.
- Every existing mutation becomes a one-liner; the confirm modal (#5) is the last step.
- Recent commands, argument completion, and a `?` help overlay.

**Why it matters:** the Raycast / Linear pattern. This is what makes a desktop client feel like a power tool rather than a website in a frame.

---

## 5. Diff-based change review and local changelog

**Status: built** (unreleased at time of writing). `context/ConfirmContext.tsx` is the one dialog (`useConfirm()` → summary / change table / line diff / type-to-confirm), `lib/diff.ts` the LCS diff and describers, `lib/changelog.ts` + `main/changelog.ts` the per-profile JSONL log, `components/history/HistoryView.tsx` the History tab. The action tracker takes a change id and writes the outcome back. Not yet: a diff for load-balancer forwarding-rule edits (that form writes fields, not a list) and export of the log.

**Before:** sixteen `window.confirm()` prompts guarded destructive actions; there was no record of what was changed.

**Proposed:**
- Before any mutation (firewall, DNS, LB config, server settings, rebuild/restore) show a unified diff of current → proposed and confirm *the diff*, with type-the-name confirmation for irreversible actions.
- Append every committed change to a local per-profile changelog (JSON or SQLite in `userData`): timestamp, target, diff, resulting action id and outcome.
- A "History" tab: "what did I change on this account last Tuesday?"

**Why it matters:** safer than mPanel, and gives customers the audit trail their support desks keep asking for.

---

## 6. Cross-account views

**Today:** multi-profile vault exists (`safeStorage.ts`, `AuthModal.tsx`) but the UI only ever shows one profile at a time.

**Proposed:**
- An "All accounts" pseudo-profile that merges server lists, each row badged with its account.
- Consolidated billing and balance across profiles.
- Cross-account search in the palette.
- Optional per-profile colour so you always know which account a destructive action targets.

**Why it matters:** MSPs and agencies managing client accounts are exactly the users who will install a desktop client.

---

## 7. Snapshot and backup timeline

**Today:** `BackupManager.tsx` lists backups and snapshots per server, supports restore and nightly backup toggling.

**Proposed:**
- Horizontal timeline per server: nightly backups as ticks, snapshots as pins, hover for size / age, click-to-restore with the #5 confirm flow.
- Fleet view: "servers with no backup in the last 7 days" in amber, "backups disabled" in red.
- One-click "snapshot before I do this" offered from rebuild / resize / restore dialogs.

**Why it matters:** cheap to build from data already fetched, and it nudges users toward better backup hygiene.

---

## 8. Cloud-init and server templates

**Status: built** (unreleased at time of writing). `main/templates.ts` stores one device-wide YAML document per template under `<userData>/templates`; the `templates:*` preload bridge and `lib/templates.ts` provide the same library through one localStorage key on Android. `CreateServerModal.tsx` gates user data by image support and can load or save templates. `ServerDetails.tsx` shows the user data last used to initialise a server and can save it as a template. `CloudInitTemplates.tsx` provides create, view, rename, delete, copy/paste import/export, desktop file reveal, and an on-demand four-at-a-time fleet coverage table. Templates are plain text on the device and capped at 256 KiB per YAML document.

Desktop YAML files placed into the templates directory by hand must use canonical lowercase slug filenames containing only letters, numbers, and hyphens (for example, `wordpress-host.yaml`). Non-canonical filenames are ignored.

**Not yet:** variables, secrets handling, whole-server capture (size, network, keys, firewall and backups), or Android file import/export.

**Proposed:**
- A local template library in `userData` (YAML): Docker host, WordPress, WireGuard bastion, k3s node, etc., with variables the modal prompts for.
- "Save this server as a template" — captures size, region, image, VPC, SSH keys, firewall rules, backup schedule, user-data.
- Import/export templates so teams can share them.

**Why it matters:** users accumulate their own templates and stop wanting to leave.

---

## 9. Metrics with memory

**Today:** `useServerMetrics` polls `/v2/samplesets/{id}/latest` every 5 s; gauges show the current sample only.

**Proposed:**
- Keep a local ring buffer (SQLite via `better-sqlite3`, or a compact JSON log) so the client shows 24 h / 7 d history the API doesn't retain.
- Fleet heatmap tab: CPU / RAM / disk / network across all servers as a grid, hot cells glowing.
- Simple local alert thresholds ("notify me if CPU > 90 % for 10 min") delivered via the tray (#3).

**Why it matters:** spot a runaway box across the fleet at a glance.

---

## 10. Network map

**Status: built** (unreleased at time of writing). `lib/networkMap.ts` is the pure, deterministic lane layout (internet rail → load balancers → region bands → VPC boxes → servers); `components/map/NetworkMap.tsx` renders it as SVG with pan/zoom, selection, a detail panel and SVG/PNG export. Exposure per server comes from the firewall audit, so the map and the matrix never disagree. Not yet: private server↔server links beyond VPC membership (BinaryLane has no such data), and route entries.

**Before:** VPCs, private IPs, load balancers and firewall rules were all fetched into separate tabs.

**Proposed:**
- Render the topology: servers grouped by VPC, load balancers fronting their members, public IPs on the edge, firewall rules as annotated edges.
- Click a node to jump to the server; hover an edge to see the rule allowing it.
- Export as PNG/SVG for docs and tickets.

**Why it matters:** the "wow" screenshot for the README and marketing page, and useful for anyone with more than a handful of servers.

---

## 11. Reachability checks from the client

**Today:** DNS manager has a propagation check; nothing probes servers from the user's machine.

**Proposed:**
- ICMP / TCP probe each server's public IP from where the user is, show latency next to the SSH button.
- "Port 22 unreachable — check your firewall rules" with a deep link to the offending rule.
- Traceroute-lite on demand for support tickets.

**Why it matters:** the desktop app runs where the customer is, which mPanel never can.

---

## 12. Usability polish that compounds

- Keyboard navigation of the server list: `j`/`k` move, `Enter` open, `s` SSH, `r` restart (with confirm), `/` focus filter.
- Pinned / favourite servers at the top of the list.
- Right-click context menus on rows (native `Menu` via IPC).
- Deep links: `bldesk://server/12345`, `bldesk://console/12345` — support staff can paste them into tickets.
- Auto-update via `electron-updater` so any of the above actually reaches existing installs.
- Column chooser and saved filters on the server list.

---

## Suggested first three

If only three are built, these together change what the app is:

1. **Real pty terminal with broadcast** (#1)
2. **Verb-first command palette** (#4)
3. **Tray and notification layer** (#3)

They turn "mPanel offline" into a fleet tool, and each makes the others more valuable.

---

## API-side help worth considering

Because BLDesk is a first-party client to an API BinaryLane owns, a few small server-side additions unlock disproportionate client features:

- CORS headers (or a proper OAuth PKCE flow) so the renderer can run with `webSecurity` on.
- A websocket / SSE stream for server status and action changes, so the client stops polling.
- A lighter server list (`?fields=` or a summary endpoint) so the 15 s refresh isn't the full object × 200.
- Server-side retention of samplesets beyond "latest", so #9 doesn't have to reinvent it locally.
- **Make `Server.status` track power state** (vps/vps #161). Today it never turns `off`; the client infers power from sample staleness plus an `is_running` after each power action (`lib/powerState.ts`). The real fix is xm → HostDaemon → WebAPI event plumbing, after which the client can drop the inference.
