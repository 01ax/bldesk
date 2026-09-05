# Help & Ask BinaryLane — build spec

Status: **implemented, desktop- and Android-emulator-verified**. See [verification notes](HELP_VERIFICATION.md) for the passing checks, screenshots and platform limits. This remains the acceptance brief. Read `AGENTS.md` first, especially the scope section and "Mutations, confirmation and History". Implementation uses the Vite `@help` alias to bundle `docs/help/*.md`; no runtime filesystem reads or new dependencies.

## What we are building

One search box, two sources, one tab.

1. **Help for BLDesk** — documentation of the client itself: what every tab does, every palette verb with examples, every keyboard shortcut, and worked examples of the fussy actions (releasing an address on Change Plan, copying a firewall ruleset across a tag, restoring a backup, applying a template). Written as Markdown in the repo, rendered in-app, reachable from a Help tab, a `?` in each view, and the palette.
2. **Ask BinaryLane** — the same search box also queries BinaryLane's published-article Q&A service and shows the plain-language answer with the articles it used. This is the website's help search, done natively. It knows nothing about the user's account and must never be sent account data.

Local results come first, the BinaryLane answer underneath. Typing `port 22 unreachable` should show the BLDesk reachability explanation and the BinaryLane firewall article in one view.

## Out of scope

- Anything that sends server names, addresses, ids, tokens or ticket text to the help service.
- A webview or iframe of the website. Render natively.
- Chat history, accounts, or anything persisted beyond the last few searches (localStorage is fine for those).
- New runtime dependencies. A Markdown subset renderer is ~150 lines; write it.

---

## Part 1 — Help for BLDesk

### Content

`docs/help/` holds one Markdown file per topic. Required set, enforced by a guard (below):

| File | Covers |
| --- | --- |
| `getting-started.md` | Add an account, the vault, profiles, switching accounts |
| `servers.md` | Server list, filters, grid/list, context menu, power actions and what "signal sent" means, power state inference (BinaryLane's API does not report `off`; BLDesk infers it from sample sets) |
| `server-<subtab>.md` for each of `overview`, `remote-access`, `usage`, `cloud-init`, `network`, `backups`, `firewall`, `settings`, `recovery`, `change-plan`, `cancel` | One per server sub-tab |
| `templates.md` | Whole-server templates, starters, variables, capture, import/export, the post-create firewall/tag job |
| `vpcs.md`, `firewall.md`, `loadbalancers.md`, `dns.md`, `backups.md`, `keys.md`, `billing.md`, `account.md`, `history.md`, `map.md`, `heatmap.md`, `terminal.md` | One per top-level tab, same slug as `TOP_TABS` |
| `palette.md` | Every verb in `VERB_SPECS` with at least one example, the target grammar (`TARGET_HELP`), `@group`/`@tag`, the two-Enter rule |
| `shortcuts.md` | Every keyboard shortcut in the app, including zoom (80–150%) |
| `confirm-and-history.md` | The confirm dialog severities (normal / destructive / irreversible, type-to-confirm), what History records, where the log lives |
| `tray.md` | Tray menu, notifications, settings file |
| `deep-links.md` | `bldesk://` links (summarise `docs/DEEP_LINKS.md`, link to it) |
| `troubleshooting.md` | "Port 22 unreachable", "server shows running but is down", Linux AppArmor install error, macOS unsigned build, update channel |

Front matter, required:

```yaml
---
title: Firewall
summary: One sentence shown in search results and the index.
keywords: [rules, first-match, matrix, copy ruleset]
---
```

Style: sentence case, second person, short. Every fussy action gets a **Worked example** section that quotes the exact confirm dialog text the user will see. Where a behaviour is BinaryLane's rather than BLDesk's (first-match firewall with no implicit deny, primary IP tied to the server for the lease, sample sets stop advancing when a VM stops), say so in one line and link the BinaryLane article.

### Loading and rendering

- `src/renderer/src/lib/help.ts`: load with `import.meta.glob('/docs/help/*.md', { query: '?raw', eager: true })` (Vite; configure `server.fs.allow`/alias so `docs/help` is reachable from the renderer, or copy it under `src/renderer/src/help/` at build time — pick one and document it). Parse front matter. Export `HELP_PAGES: HelpPage[]` (`slug`, `title`, `summary`, `keywords`, `body`, `headings[]`) and `searchHelp(query): HelpHit[]` (title/keyword/heading/body match with a simple score; no dependency).
- `src/renderer/src/lib/helpMarkdown.ts`: subset renderer to React nodes: `#`–`###` headings with ids, paragraphs, ordered/unordered lists, fenced code, inline code, bold, links (external links open via `window.bldeskApi.openExternal`; `help:` links navigate in-app; `bldesk://` links route through the existing deep-link parser). Nothing else. Escape everything; no `dangerouslySetInnerHTML`.
- `components/help/HelpView.tsx`: the **Help** tab. Left: search box at the top (shared with Part 2), then the index grouped as *Getting started / Servers / Fleet / Account / Reference*. Right: the page, with a heading outline. Same card and colour tokens as Templates and Heatmap.
- Add `'help'` to `ActiveTab`, `TOP_TABS`, the Sidebar (after History) and the palette's `go` aliases. Deep link `bldesk://help/<slug>[#heading]`.

### Contextual entry points

- A circled `?` (lucide `CircleHelp`, muted, turns brand blue on hover, `title="What this page does"`) sits at the right of the header of every top-level view and every server sub-tab. Clicking it opens the Help tab at that view's page, scrolled to the top, so a user who has never seen the page gets its purpose in the first paragraph. Implement once as `components/ui/HelpLink.tsx` taking a `slug` and optional `heading`; place it on the same line as the page title, after any header buttons, in every view.
- Palette: `help` with no argument shows the verb list (existing). `help <words>` runs `searchHelp` and lists hits as rows; Enter opens the page. Keep `?` as the alias.
- The confirm dialog gets an optional `helpSlug` so an irreversible action can link to its worked example.

### Guard

Extend `scripts/check-ui-guards.mjs` (or add `check-help-guards.mjs`, wired into `lint:guards`):

- Every entry in `TOP_TABS` and every `verb` in `VERB_SPECS` must be covered: a `docs/help/<tab>.md` exists, and `palette.md` contains a fenced example starting with that verb.
- Every `SERVER_SUB_TABS` entry has `docs/help/server-<subtab>.md`.
- Every help file has valid front matter with the three fields.
- `HelpLink` appears at least once per top-level view component (grep for `<HelpLink slug="<tab>"`).

Fail with the file name and the missing item. This is what keeps the docs current when an agent adds a tab.

---

## Part 2 — Ask BinaryLane

### Service contract

The Q&A service is BinaryLane's published-article search. It requires no login and is rate-limited and prompt-injection-hardened on the server side. For the first pass the test bed is `https://uai.adamhomenet.com`, by decision; when it is ready to launch a real `binarylane.com.au` hostname will be pointed at the same service and the constant changes once. Keep the origin in one constant, `HELP_API_ORIGIN` in `src/shared/help-api.ts`, and pin requests to it the same way the API client pins `api.binarylane.com.au`.

```
GET /api/help?q=<question>
→ { "answer": string, "results": [{ "title": string, "url": string }], "id": string }

GET /api/help/suggest?q=<prefix>
→ { "suggestions": string[] }

POST /api/help/feedback   Content-Type: application/json
   body: { "id": <number, the "id" from the answer, as a number not a string>, "helpful": boolean }
→ 2xx; ignore the body. Taken from the website's own script.
```

`answer` is plain text with `\n` line breaks and numbered steps. `results` titles are lowercase; title-case them for display. `url` is either a support article or the API reference.

Desktop: call through `net.fetch` in main via a new `help:ask` / `help:suggest` / `help:feedback` IPC, so the renderer CSP and origin pinning stay simple. Android: `CapacitorHttp` in `mobile-bridge.ts`, same three functions. 20 s timeout. No retries on the ask endpoint.

### What may be sent

Only the text in the search box. Two exceptions, both visible to the user before they press Enter:

- If the user is on a server page, the box offers a chip **"add: Ubuntu 24.04, Sydney"** built from the image distribution name and region name. Clicking it appends that text to the query. Never the hostname, id, addresses, VPC or account.
- Suggestions from `/suggest` are shown as a dropdown after a 200 ms debounce; picking one replaces the query.

No token, no profile id, no server ids, no History, no ticket text. Put that sentence in a comment above the IPC handler and in `help/troubleshooting.md` under a heading **What Ask BinaryLane can see**.

### Rendering

Beneath the local hits, one card:

- Header: **Ask BinaryLane** · beta, with the disclaimer from the website in small text: answers are generated from published articles and may be incomplete or out of date; check the linked article.
- Body: the answer, rendered by the same Markdown subset renderer (it handles the numbered steps).
- Articles: one row per `results` entry, title-cased, external-link icon, opens via `openExternal`.
- Footer: thumbs up / down → `feedback`; after a click, show "Thanks" and disable.
- States: idle (nothing shown until a query has ≥ 3 words or the user presses Enter), loading (skeleton, not a spinner), error ("Couldn't reach BinaryLane help. Your local help results are above."), offline (same message, no request made if `navigator.onLine` is false).

Palette: `ask <question>` verb (alias `?? <question>`), `mutates: false`, opens the Help tab with the query run.

### Not for this PR

Streaming answers, chat follow-ups, per-account quota via token, caching answers. Note them in FEATURES under the new entry.

---

## Verification (per AGENTS.md)

- `npm run typecheck` passes: TypeScript, mutation guards, UI guards, and the new help guard.
- Playwright against the real Electron app with isolated user data: open Help from the sidebar, from a `?` in the Firewall tab, from `help firewall` in the palette, and from `bldesk://help/firewall#copy-a-ruleset`; confirm each lands on the right heading. Check at 1024×680 at 100% and 150% zoom that the index and the page both scroll and the search box stays visible.
- Ask BinaryLane: with the dev origin, run `how do I enable ipv6` and confirm the answer, four article rows, and feedback round-trip. Unplug the network (or point `HELP_API_ORIGIN` at an unroutable host) and confirm the error state appears under intact local results.
- Read every help page once in the app, in both themes, before opening the PR. Screenshots of the Help tab and the Ask card in `docs/screenshots/`, redacted.

## Deliverables

- `docs/help/*.md` (all pages in the table), `lib/help.ts`, `lib/helpMarkdown.ts`, `components/help/HelpView.tsx`, `components/ui/HelpLink.tsx`, `shared/help-api.ts`, main IPC + preload + mobile bridge for the three calls, Sidebar/TOP_TABS/deep-link/palette wiring, the guard.
- `FEATURES.md`: new entry **13. Help & Ask BinaryLane** with status.
- `CHANGELOG.md` under Unreleased. No version bump; the maintainer does that.
- `README.md`: one paragraph under the shortcuts table pointing at Help and `?`.
- `AGENTS.md`: one line under the guards section: *every new tab, sub-tab or verb ships with its help page; the help guard enforces it.*
