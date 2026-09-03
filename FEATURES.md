# BLDesk — Feature Expansion Ideas

Ideas for taking BLDesk from "mPanel in a window" to a fleet tool. Ordered roughly by how much each one changes what the app *is*. Each entry notes what already exists in the codebase that it builds on.

**Scorecard (v1.0.59, 4 Sep 2026):** #2, #3, #4, #5, #8, #9, #10 and #11 are built and released. #7 and #12 are part-built. #1 and #6 are untouched. Everything shipped in the same week that was *not* on this list is under [Built outside this list](#built-outside-this-list).

---

## 1. Real embedded terminal (pty)

**Today:** `EmbeddedTerminal.tsx` renders an xterm.js box with a banner; the only action is "Launch Native SSH", which hands off to Windows Terminal / Terminal.app / etc. The box itself never receives a session. The hand-off itself got better this week (v1.0.26: macOS `Terminal.app` by default with an env override; Linux resolves a real terminal instead of crashing) and the reachability chip from #11 now sits beside the button, but nothing runs in-app.

**Proposed:**
- Add `node-pty` to the main process. Spawn `ssh` with the argv already produced by `shared/ssh.ts` (`sshArgv`), pipe stdin/stdout over IPC to the xterm instance.
- Tabs per server, optional split view.
- Command palette action "SSH to <server>" opens a tab in-app instead of context-switching.
- **Broadcast mode:** pick a tag or glob (`wp-*`), type one command, see output fan out per host in a grid. Serial or parallel execution with a per-host status pill.
- Session persistence across app restarts (reconnect on launch), and a scrollback search.

**Why it matters:** this is the feature mPanel structurally cannot offer. It is the strongest reason to keep BLDesk open all day.

---

## 2. Fleet-wide firewall matrix

**Status: built (v1.0.42; v1.0.43 pinned the audit column beside the server name and added matrix navigation).** `lib/firewallMatrix.ts` (pure: signatures, matrix, audit), `components/firewall/FirewallMatrix.tsx` (view, copy-ruleset, groups/tags), `lib/serverGroups.ts` (local groups + tags; `@name` targets). `lib/firewallMatch.ts` (v1.0.52) holds the first-match semantics, shared with #11 so the matrix and the reachability verdict never disagree. Not yet: named rule *sets* stored independently of a server (today you copy from a live server, or apply a template's rule set via #8), and per-server quick edits from the grid.

**Before:** `FirewallManager.tsx` edited advanced firewall rules for one server at a time via `change_advanced_firewall_rules`.

**Proposed:**
- A matrix view: servers down the side, common rules across the top, cell = allow/deny/absent.
- Automatic audit highlights: `22/tcp` open to `0.0.0.0/0`, servers with no rules at all, rules referencing IPs that no longer belong to the account.
- "Copy this ruleset to N servers" with a diff preview per target before commit.
- Named rule sets stored locally (e.g. "web-standard", "db-private") that can be applied and re-applied.

**Why it matters:** answers "which of my 33 boxes still has SSH open to the world?" in one screen.

---

## 3. A tray / menu bar that earns its spot

**Status: built (v1.0.39).** `src/main/tray.ts` owns the tray, its settings (`<userData>/tray.json`, edited from the menu itself) and the notification gate; `src/renderer/src/lib/fleetWatch.ts` pushes the fleet summary and diffs server state. Because `Server.status` never reports `off` (see the API note at the end), `lib/powerState.ts` infers power from sample staleness plus an `is_running` check after each power action, so the tray's counts and notifications are truthful. Not yet: a tray badge for stopped servers (deliberately — a box you keep off would badge forever), and per-server quick actions beyond SSH.

**Before:** `createTray()` in `main/index.ts` offered "Open Dashboard" and "Quit". `Notification` was wired but only used on request. Servers were already polled every 15 s.

**Proposed:**
- Tray tooltip / badge with running / stopped / action-in-progress counts.
- Native notifications on server state change, action completion or failure (pairs with polling `/v2/actions/{id}`), and low prepaid balance from `useBalance`.
- "Quick SSH" submenu listing servers (feeds into #1).
- Optional launch-at-login, minimise-to-tray on close.

**Why it matters:** the app becomes something that runs in the background and tells you things, not something you remember to open.

---

## 4. Verb-first command palette

**Status: built (v1.0.38).** Grammar lives in `src/renderer/src/lib/commands.ts` (pure, no React); the palette in `CommandPalette.tsx` resolves targets against the loaded server list, previews eligible / skipped / unmatched, and requires a second Enter before submitting. `@group` targets arrived with #2 (v1.0.42), `create <host> from <template>` with #8 (v1.0.57), and power verbs stopped being gated on the unreliable `status` field in v1.0.39. Not yet: `firewall allow …` (needs #2's fetch-merge-write per server), `tag …` beyond local groups (the API has no server tags), and argument completion beyond Tab-to-fill.

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

**Status: built (v1.0.41; every mutation routed through it in v1.0.46).** `context/ConfirmContext.tsx` is the one dialog (`useConfirm()` → summary / change table / line diff / type-to-confirm), `lib/diff.ts` the LCS diff and describers, `lib/changelog.ts` + `main/changelog.ts` the per-profile JSONL log, `components/history/HistoryView.tsx` the History tab. The action tracker takes a change id and writes the outcome back, including for create-server records (v1.0.50). `scripts/check-mutation-guards.mjs` runs in CI and fails any mutation that bypasses the dialog, and since v1.0.55 every dialog in the app shares one `Modal` shell, with a guard that fails any portal outside it. Not yet: a diff for load-balancer forwarding-rule edits (that form writes fields, not a list) and export of the log.

**Before:** sixteen `window.confirm()` prompts guarded destructive actions; there was no record of what was changed.

**Proposed:**
- Before any mutation (firewall, DNS, LB config, server settings, rebuild/restore) show a unified diff of current → proposed and confirm *the diff*, with type-the-name confirmation for irreversible actions.
- Append every committed change to a local per-profile changelog (JSON or SQLite in `userData`): timestamp, target, diff, resulting action id and outcome.
- A "History" tab: "what did I change on this account last Tuesday?"

**Why it matters:** safer than mPanel, and gives customers the audit trail their support desks keep asking for.

---

## 6. Cross-account views

**Today:** multi-profile vault exists (`safeStorage.ts`, `AuthModal.tsx`; since v1.0.35 re-entering a key updates the profile instead of duplicating it) but the UI only ever shows one profile at a time. The action tracker and change log are already scoped per profile, which is the groundwork a merged view would need.

**Proposed:**
- An "All accounts" pseudo-profile that merges server lists, each row badged with its account.
- Consolidated billing and balance across profiles.
- Cross-account search in the palette.
- Optional per-profile colour so you always know which account a destructive action targets.

**Why it matters:** MSPs and agencies managing client accounts are exactly the users who will install a desktop client.

---

## 7. Snapshot and backup timeline

**Status: part-built.** The third bullet is done for resize; the timeline and fleet view are not.

**Today:** `BackupManager.tsx` lists backups and snapshots per server, supports restore and nightly backup toggling. This week added a slot selector that only offers the retention the server actually has (v1.0.27; PR #35 moves that rule into `lib/backupSlots.ts` so Change Plan's pre-action backup shares it), direct download of snapshot and backup disk images (v1.0.27), automatic rotation of the oldest temporary snapshot, and tracking of every backup action with BinaryLane's own progress detail ("38.5GB of 40.0 GB (310MB/s)") rather than a bare "initiated" toast (v1.0.32). Restore goes through the #5 dialog as irreversible.

**Proposed:**
- Horizontal timeline per server: nightly backups as ticks, snapshots as pins, hover for size / age, click-to-restore with the #5 confirm flow.
- Fleet view: "servers with no backup in the last 7 days" in amber, "backups disabled" in red.
- ~~One-click "snapshot before I do this" offered from rebuild / resize / restore dialogs.~~ Change Plan's `pre_action_backup` (PR #35) takes a backup into a chosen slot before the resize runs. Rebuild and restore still do not offer it.

**Why it matters:** cheap to build from data already fetched, and it nudges users toward better backup hygiene.

---

## 8. Cloud-init and server templates

**Status: built (v1.0.57)** — reworked from the first cut, which stored bare cloud-init snippets. A template is now a *whole server*: region, plan and its options (memory, disk, IPv4 count, backup retention, offsite), image, VPC and SSH keys (by **name**, so a template moves between accounts), a firewall rule set, local tags, and cloud-init with `{{variables}}`.

- `lib/serverTemplates.ts` — versioned document (`kind: bldesk/server-template@1`), variable extraction/rendering (`{{hostname}}` built in; secrets are prompted for and never written to disk), single-file and bundle import/export, capture from a live server, migration of the first-cut `name` + `user_data` documents. Store is unchanged: one YAML per template under `<userData>/templates` on desktop (the `templates:*` bridge), one localStorage key on Android.
- `lib/starterTemplates.ts` — seven read-only starters with real cloud-init: **Ubuntu baseline**, **CIS-hardened Ubuntu 24.04** (Level 1 Server controls: admin user from the injected key, root locked out of SSH, hardened sshd, module/sysctl lockdown, auditd, AIDE, PAM policy, banners, ufw), **Docker host**, **WordPress**, **WireGuard bastion**, **k3s node**, **PostgreSQL 16**. Every starter's firewall ends in an explicit drop (BinaryLane's firewall is first-match with no implicit deny). "Make mine" duplicates one into an editable template.
- `components/templates/TemplatesView.tsx` — its own **Templates** tab: library (mine + starters, search), spec cards, rules table, variables, cloud-init; editor with rule and variable rows and a one-click "declare the variables this cloud-init uses"; import from file or paste; export one or all.
- **New server from this** → variables prompt (secrets get a generate button) → `CreateServerModal` opens prefilled via its `initial` prop (names resolved on the account as the lists load) → the form is still the review → after BinaryLane accepts, `lib/templateJobs.ts` waits for the build and applies the firewall rules (History entry) and local tags. The job lives outside React so leaving the tab does not abandon it.
- **Save server as template** on a server's Cloud-init tab captures plan/region/image/VPC/firewall rules/user data; **Save this form as a template instead** on the create form captures a form you have filled in.
- Palette: `create web-01 from CIS-hardened Ubuntu` (or `from @starter-docker-host`).

**Not yet:** secrets in a vault (they are typed per apply on purpose), template versioning/diff, sharing over anything but a file.

**Why it matters:** users accumulate their own templates and stop wanting to leave. Anything Ansible would do on a fresh box is a first-boot cloud-init here, with the fill-in-the-blanks handled by the client.

---

## 9. Metrics with memory

**Status: done.** All three parts are covered, two of them by BinaryLane itself:

- **Fleet heatmap** — `lib/heatmap.ts` turns live sample sets into capacity ratios (CPU against 100 × vCPUs: `cpu_usage_percent` is the sum across cores, measured at 399% on a pinned 4-vCPU server), fleet-relative rate intensity with an absolute floor (about 40 Mbit/s network, 10 MB/s disk) so a quiet fleet stays neutral, and explicit stale, unavailable and inactive states; `api/queries.ts` fetches once per 5-minute sample period, timed to land just after BinaryLane publishes (about 90 s after the period ends), four requests at a time; `components/heatmap/FleetHeatmap.tsx` renders the sortable grid and opens a row's Usage tab.
- **History** — the API already retains sample sets at day resolution for at least a year, and the Usage tab reads day, week, month and year windows from it. A local ring buffer was proposed on the assumption the API discarded history; it does not, so none is kept client-side.
- **Alerts** — BinaryLane's own threshold alerts are exposed per server. They are evaluated server-side and fire whether or not BLDesk is running, which local tray rules could not match.

**Not yet:** per-cell sparklines in the heatmap.

**Why it matters:** spot a runaway box across the fleet at a glance.

---

## 10. Network map

**Status: built (v1.0.47; VPC-centric layout spanning regions in v1.0.48).** `lib/networkMap.ts` is the pure, deterministic lane layout (internet rail → load balancers → region bands → VPC boxes → servers), with VPC membership taken from the authoritative members query rather than inferred from addresses; `components/map/NetworkMap.tsx` renders it as SVG with pan/zoom, selection, a detail panel and SVG/PNG export. Exposure per server comes from the firewall audit, so the map and the matrix never disagree. Not yet: private server↔server links beyond VPC membership (BinaryLane has no such data), and route entries.

**Before:** VPCs, private IPs, load balancers and firewall rules were all fetched into separate tabs.

**Proposed:**
- Render the topology: servers grouped by VPC, load balancers fronting their members, public IPs on the edge, firewall rules as annotated edges.
- Click a node to jump to the server; hover an edge to see the rule allowing it.
- Export as PNG/SVG for docs and tickets.

**Why it matters:** the "wow" screenshot for the README and marketing page, and useful for anyone with more than a handful of servers.

---

## 11. Reachability checks from the client

**Status: built (v1.0.52; UI polish in v1.0.54).** `main/reachability.ts` is the probe worker: TCP to port 22 from the user's own machine, restricted to addresses the account owns, throttled to 30 probes a minute. `components/servers/ReachabilityBadge.tsx` leads the action cluster on Server Details with three honest states: connected (with round-trip latency), refused (port closed or sshd not running on the guest) and timeout (silently dropped). On a timeout the **firewall verdict** runs the server's rules through `lib/firewallMatch.ts`, the same first-match semantics #2 uses, and names the exact rule that blocked the packet, or says there was no matching rule (so the drop is on the guest or the route), or that the server has no rules at all. The explanation lives in the chip's bubble; the route to the rule opens in a dialog. The card opens on keyboard focus, not hover alone.

**Before:** DNS manager had a propagation check; nothing probed servers from the user's machine.

**Proposed:**
- ~~TCP probe each server's public IP from where the user is, show latency next to the SSH button.~~ Done.
- ~~"Port 22 unreachable — check your firewall rules" with a deep link to the offending rule.~~ Done.
- ICMP probes (needs raw sockets or a helper; TCP is enough for "can I SSH").
- Traceroute-lite on demand for support tickets.

**Why it matters:** the desktop app runs where the customer is, which mPanel never can.

---

## 12. Usability polish that compounds

**Status: part-built.** Three of six done.

- Keyboard navigation of the server list: `j`/`k` move, `Enter` open, `s` SSH, `r` restart (with confirm), `/` focus filter.
- Pinned / favourite servers at the top of the list. (Groups in `lib/serverGroups.ts` can pin ids, but the list does not order by them.)
- ~~Right-click context menus on rows (native `Menu` via IPC).~~ Done, v1.0.30: `ServerContextMenu.tsx`.
- ~~Deep links: `bldesk://server/12345`, `bldesk://console/12345` — support staff can paste them into tickets.~~ Done, v1.0.30: `main/deeplink.ts` registers the protocol, `shared/deeplink.ts` parses it, and every server row and details header has a copy-link button.
- ~~Auto-update via `electron-updater` so any of the above actually reaches existing installs.~~ Done, v1.0.28: `main/updater.ts` against GitHub Releases, with release notes rendered from `CHANGELOG.md` (v1.0.53 sanitises them). Android checks the same releases and downloads the APK in-app (v1.0.33), signed with a permanent keystore so it upgrades in place (v1.0.34).
- Column chooser and saved filters on the server list.

---

## Built outside this list

Shipped between v1.0.24 (1 Sep 2026) and v1.0.59 (3 Sep 2026) without being an entry above. Listed so the list above stays honest about what the app already is.

- **Server Details parity with mPanel** (v1.0.27): a **Network** tab (interfaces, IPv6, port blocking, VPC membership, Edge DDoS status), a **Settings** tab covering the full mPanel settings suite, and a **Usage** tab with the PanelSite-style metrics graphs (paged sample sets, independent per-metric scaling, live-telemetry fallback cards, day/week/month/year windows).
- **Change Plan and Cancel Server** (v1.0.45; full size options in v1.0.56): `ChangePlanPanel.tsx` sends the whole `resize` — plan, memory, storage, IPv4 count with named releases, backup retention, offsite — with a before → after table, the primary address never offered for release, and an address release confirmed as irreversible. PR #35 adds the rest of the action: licensed software (cPanel tiers, CloudLinux, KernelCare, retained Remote Desktop SAL), reinstall onto another image as part of the move, a pre-action backup, and a real monthly cost comparison from `lib/serverPricing.ts`, which the create form shares.
- **Create form rebuilt to match the web panel** (v1.0.40), with `lib/serverPricing.ts` for availability reasons and pricing, and one-line plan rows with every region in the filter (v1.0.44).
- **Truthful action tracking** (v1.0.32): `ActionTrackerContext.tsx` follows long-running actions to completion instead of timing them out, reports failed and stalled actions as such, answers actions BinaryLane pauses for operator interaction (`user_interaction_required`) or an unpaid invoice, and posts native notifications on completion. Scoped per profile.
- **Account and billing** (v1.0.31): an Account Details view, tabbed billing with paginated invoices and unpaid-invoice surfacing, and links straight to the mPanel payment pages.
- **DNS** (v1.0.35): the domain list pages through every zone, labels unused zones, and has row actions.
- **Android** (v1.0.33–v1.0.44): API requests routed through the native Capacitor HTTP bridge (mutations included, v1.0.44), the API token in the hardware-backed Keystore instead of cleartext, safe-area insets on every modal and drawer, a touch-friendly section picker, and the create form and plan table fitting a phone.
- **Desktop chrome** (v1.0.29–v1.0.58): version badge in the title bar and sidebar, one set of window chrome per platform (native traffic lights overlaid on macOS, app-drawn elsewhere), a one-pixel inset border on Linux's frameless window, and an AppImage that starts on Ubuntu 24.04's user-namespace sandbox.
- **Contributor guard rails** (v1.0.46): `AGENTS.md`, the mutation-guard CI check, and release notes extracted from `CHANGELOG.md` at publish time.

---

## Suggested first three

The original three were #1, #4 and #3. Two of them shipped in the same week (#4 in v1.0.38, #3 in v1.0.39). Of what remains, these change the app most:

1. **Real pty terminal with broadcast** (#1) — still the feature mPanel structurally cannot offer.
2. **Cross-account views** (#6) — the multi-profile vault, per-profile change log and per-profile action tracker are all in place; only the merged UI is missing.
3. **Backup timeline and fleet backup view** (#7) — cheap, from data already fetched, and the pre-action backup in Change Plan is a first taste of it.

---

## API-side help worth considering

Because BLDesk is a first-party client to an API BinaryLane owns, a few small server-side additions unlock disproportionate client features:

- CORS headers (or a proper OAuth PKCE flow) so the renderer can run with `webSecurity` on.
- A websocket / SSE stream for server status and action changes, so the client stops polling.
- A lighter server list (`?fields=` or a summary endpoint) so the 15 s refresh isn't the full object × 200.
- ~~Server-side retention of samplesets beyond "latest".~~ Already the case: the API keeps day-resolution sample sets for at least a year (see #9).
- A per-OS software endpoint that includes disabled-but-retainable products, or a `supported_operating_systems` on `LicensedSoftware`. Today the client has to union the catalogue with what the server holds to avoid `change_licenses` silently dropping Remote Desktop SAL (see PR #35).
- **Make `Server.status` track power state** (vps/vps #161). Today it never turns `off`; the client infers power from sample staleness plus an `is_running` after each power action (`lib/powerState.ts`). The real fix is xm → HostDaemon → WebAPI event plumbing, after which the client can drop the inference.
