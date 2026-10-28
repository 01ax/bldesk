# GUI test harness

Runs the real app against a fake BinaryLane API, signed in with a fictitious token, so every screen can be driven and inspected without a BinaryLane account. It is a manual tool, not part of CI: it needs Electron and a display.

Nothing here can reach the real API. The app's hostnames resolve to a local mock and every other host fails to resolve. The token is random, made per run, and only the mock accepts it. Your own BLDesk settings and vault are never touched: each run uses its own data directory under your temp folder.

## Requirements

- Node 22 and a build (`npm run build`), or an installed BLDesk (`--bin`).
- OpenSSL, once per run, to make a throwaway certificate for the mock (Git for Windows includes one; set `OPENSSL` if it isn't on your PATH).
- Playwright is not an application dependency. Point `BLDESK_PLAYWRIGHT_MODULE` at the absolute path of its entry module, for example `/path/to/node_modules/playwright-core/index.mjs`, or install `playwright-core` where Node can resolve it. Not needed if you only start the app and look at it.

## Quick start

```sh
npm run build
node scripts/gui-test/launch.mjs                       # mock API + the app from this checkout
node scripts/gui-test/signin.mjs                       # signs in through the real token dialog
node scripts/gui-test/launch.mjs --stop                # when finished
```

After driving the app, check what it sent: `node scripts/gui-test/check-requests.mjs <tmp>/bldesk-gui-test/NAME/mock.log` validates every distinct request body in the mock log against the request schema in `openapi.json` (action requests against the schema their `type` names) and lists the ones that are invalid: a field left out, a wrong type or enum value, an action the reference does not have. It needs `ajv`, which the build tools install. It does not flag a field the reference does not define, so read the bodies for those.

Backup-model regressions can also run without Electron or Playwright:

```sh
node --test scripts/gui-test/mock.test.mjs
```

This starts a local HTTP mock on a free port with a fictitious token, then stops it. It checks plan backup options, per-server ownership, free and full slots, replacement strategies, locked/attached images, failed actions and reset. The default download response is also checked against the public response schemas, including its requested image identity and disk URLs.

`launch.mjs` options: `--name NAME` (run several at once; default `default`), `--mock-port` (8443), `--cdp-port` (9333), `--bin PATH` (an installed BLDesk instead of this checkout, to test the packaged app with its production CSP), `--mock-only`, `--http`, `--stop`. Everything for a run, including the mock log (`mock.log`, every request with its body), the app log and screenshots, is in `<tmp>/bldesk-gui-test/NAME/`.

On Linux the app is started with `--password-store=basic`, so it never touches your keyring; the sign-in dialog then shows the "no keyring" warning and the script ticks "save without encryption". That warning screen is itself worth a look.

## Driving it

`lib.mjs` exports what the scripts use, so your own Playwright scripts can too: `loadState(name)`, `connect(state)` (returns `{browser, ctx, page, problems, state}`; `problems` collects console errors and page exceptions), `shot(page, state, name)`, `layoutReport(page)` and `setViewport(page, w, h)`. Electron has no window-resize command over CDP, so sizes are emulated; at a 1280px window, 80% zoom is about 1600 css px, 125% about 1024 and 150% about 853. `layoutReport` flags horizontal page scroll, text such as "undefined" or "NaN", elements past the right edge, and overflowing text; it can't tell a clipped element from one inside a scrollable container, so confirm with a screenshot. `sheet.mjs OUT.png a.png b.png ...` builds a contact sheet so one look covers several screenshots.

## The mock

Responses are generated from `openapi.json`, then overridden with fleet data, so field names and shapes follow the public reference. Most request bodies are not validated; backup requests check slot availability, the replacement strategy, ownership and locked/attached images. Read the bodies in `mock.log` and compare them with the spec, which is how wrong field names show up.

Plan backup pricing follows the public sizes snapshot reported in [#198](https://github.com/termau/bldesk/issues/198) on 2026-09-29: no included daily, weekly or monthly backups; $0.05 per backup per GB and $0.05 per offsite copy per GB; `daily_per_gigabyte`, `weekly_per_gigabyte` and `monthly_per_gigabyte` frequency costs all zero. The fleet and other plan figures remain fictitious.

Fixture fleet (28 servers, more than 20 so paging is exercised):

- 8100-8117: the "Atlas" fleet across syd/bne/mel, VPCs 901-903, load balancers 950-952.
- 9001 `win-app-01`: Windows Server 2022 with a data disk and licences. 9002 `legacy-gs1`: on a retired plan. 9003 `stopped-batch-01`: off, no backups. 9004 `vpc-only-01`: no public IPv4. 9005 `building-01`: status new. 9006/9007: an HA pair. 9008: a very long name. 9009: three public IPv4s, IPv6 and a failover IP. 9010 `cpanel-host-01`.
- Regions syd, bne, mel, per, sin and an unavailable adl. Sizes `std-min` to `std-8vcpu` (`std-8vcpu` includes 340 GB, which is off the valid storage steps), a CPU Optimised size with restricted disk values, and the retired `a-3040` (returned only in the resize list of a server on it). Stock is per operating system: a Windows image makes `std-6vcpu` and `std-8vcpu` out of stock in bne, an Ubuntu image makes 4 vCPU and up out of stock in mel.
- Eight images (Linux, one Linux image that needs 30 GB of storage, Windows, Windows with SQL, cPanel), 4 SSH keys, 3 domains with every record type, 27 invoices (the newest unpaid), and backups with distinct IDs and state per server. Each server with a schedule starts with a temporary, daily, weekly and monthly image; `backup_info` identifies its actual slot type, originating server and disks.

Actions normally complete after about 2.5 seconds. Terminal status and the completion timestamp are published only after the action callback settles, including failure handling. Waiting actions stay in progress; answering replaces their pending timer. Power actions, resize, taking/attaching/detaching backups and firewall writes change the mock's state; other server settings (rename, add disk, and so on) complete without changing anything.

`take_backup` uses the server's selected retention counts for scheduled slots. `none` needs a free slot; `oldest` and `newest` use a free slot first, then replace the selected unlocked, unattached image of that type; `specified` replaces a named image belonging to that server and requires its matching `backup_type`. Taking a temporary backup requires no scheduled retention. The mock models one temporary slot per server, matching the live API check recorded for #312 in `docs/HELP_VERIFICATION.md`, not a count stated by the public reference. It also refuses a third temporary backup taken of a server in seven days, as the reference describes the Take Backup action. The 23 October 2026 live checks recorded in `docs/HELP_VERIFICATION.md` cover ordinary replacement and a successful resize `pre_action_backup` counting toward the allowance; the existing mock counting matches those sequences. Quota refusals use an HTTP 400 validation body with the reason in `errors` and `message`: the field is `backup_type` for an ordinary take, and `pre_action_backup.backup_type` for resize. The nested field and message follow the live observation in the [review of #331](https://github.com/termau/bldesk/pull/331#pullrequestreview-5623460097); see the 26 October verification entry for its scope and the Change Plan fixture check. `temporaryLimit` in `/__mock/config` changes the count. Elapsed reset timing and failed-take counting were not checked live. A resize's `pre_action_backup` uses the same slot checks and is taken before memory or disk changes; a refused backup prevents those changes. Temporary images are not automatically expired by the mock. Image GET/PUT supports inspecting backup metadata, renaming images and locking/unlocking scheduled images; attaching an image protects it from replacement until it is detached.

To check Change Plan's quota refusal, reset the mock, then complete a temporary/none take and a temporary/oldest replacement on server 9003. In Change Plan, change memory, choose Replace an existing backup, select the held temporary image and accept the terms. Confirm Resize: expect one HTTP 400 and one Action failed card with `pre_action_backup.backup_type: Temporary backup limit of 2 per 7 day period has been reached.` The server, held backup and action list must remain unchanged. Dismiss the card before resubmitting if it covers the Change Plan button. This exercises the app's specified-replacement request, not an additional live API observation.

URL imports at `POST /v2/servers/{server_id}/backups` use the same slot and replacement model, validate HTTP/HTTPS sources and label length, and return a tracked `upload_image` action. Completion adds an image with a neutral fixture name, not the request label; a failed action leaves existing images alone. ISO metadata follows the source pathname for fixtures only. Specified imports require the replaced image's matching `backup_type`, which the app sends. The action type and upload-specific matching-type check follow the separate dated live observations in the [27 October review of #341](https://github.com/termau/bldesk/pull/341#issuecomment-6433373885), not an inference from Take Backup. Upload refusals carry a ProblemDetails-style `errors` and `message` envelope; their fixture reasons are synthetic, not byte-for-byte provider errors. The label's intended presentation is not established by these observations, so the app makes no claim that it names the returned image. The mock never downloads from the URL and does not apply Take Backup's frequency quota to imports; neither fixture behaviour establishes an undocumented service rule. Request-time upload refusals are one synthetic scenario, not evidence of when the real service reports a refusal.

Control endpoints (POST JSON to the mock, for example `curl -sk -X POST -d '{"empty":true}' https://127.0.0.1:8443/__mock/config`):

- `/__mock/config`: `{"empty":true}` an account with nothing in it; `{"rejectAuth":true}` every call returns 401; `{"extraToken":"second-token"}` also accepts that token, so a second profile with a different token can be added (a profile with the same token is the same client to the app); that account sees only its own server, #9101 `second-account-01`; `{"unpaid":true}` the unpaid-invoice banner; `{"actionMs":8000}` slower actions; `{"actionOutcome":"errored"}` actions fail with an error message; `{"latencyMs":1500}` slow responses. `{"interaction":"continue-after-ping-failure"}` (or `allow-unclean-power-off`) makes reboots, shutdowns and power cycles stop and ask that question, which the app's "needs an answer" dialog shows; answering at `POST /v2/actions/{id}/proceed` lets them settle.
- `/__mock/config` `{"consoleUrl":"https://console.invalid/x"}` makes the rescue console URL one that cannot be loaded; `{"feedStatus":404}` makes the mock GitHub feed answer every request with that status and no body (`null` to stop), to see what an update check that fails does; `{"updateVersion":"1.0.62-beta.9"}` also offers a newer version through the mock GitHub feed, so a packaged app (`--bin`) finds, downloads and shows "Restart to update". The download is a stand-in file, not a real package: do not click Restart against a real `pkexec`, which would ask for your password and try to install it. To test the install path, put a stand-in `pkexec` that just sleeps and exits 0 first on the app's `PATH`. To serve a real package instead (for installing one on purpose), start the mock with `MOCK_DEB=/path/to/BLDesk.deb`: its real size and SHA-512 go in the feed. On Linux the packaged app keeps its downloaded update in `~/.cache/bldesk-updater`, which is not under the test's data folder, so a test that offers an update would overwrite what your own BLDesk has downloaded there: start the test with `XDG_CACHE_HOME` pointing at a scratch folder. A build made with `electron-builder --dir` also needs a `resources/package-type` file containing `deb`, or electron-updater treats it as an inactive AppImage and the check never finishes.
- `/__mock/fail`: `{"match":"advanced_firewall","status":500,"count":3}` injects HTTP errors (500, 429...) on paths matching a regex. `"method":"DELETE"` limits it to one method, and `"empty":true` answers with no body at all, which the typed client reports as no `error` and only a non-ok `response`.
- `/__mock/firewall`: `{"server_id":8100,"firewall_rules":[...]}` sets a server's rules without the write checks, so a test can start from a server that already has more than 100 rules (a write cannot make one). The mock then lets that server's rules be kept, edited or reduced but not grown beyond what it has, as the reference describes (0.46.0, `ChangeAdvancedFirewallRules`); its refusal text for that case is the mock's own.
- `/__mock/reset`: restore the fixtures.

Not app bugs: usage graphs are synthetic (CPU can exceed 100% on multi-vCPU servers), billing's Pending Charges are empty, console links open a stub page, help answers are canned, and the embedded SSH terminal has nowhere to connect.

## Android

### Native HTTP Replay

`http-retry-fixture.mjs` counts handler executions and can lose the answer
before JavaScript receives it. Use only an isolated Android fixture build and
fictitious data, never a live account. Start the loopback fixture:

```sh
node scripts/gui-test/http-retry-fixture.mjs --port 8446
curl -X POST http://127.0.0.1:8446/__fault/config -d '{"id":"warm-loss","drop":"first","when":"after","close":"fin"}'
```

Make the fixture reachable using the Android setup below (`adb reverse
tcp:8446 tcp:8446` for a physical connection). In that debug WebView, warm the
connection and then call the native plugin once:

```js
const base = 'http://127.0.0.1:8446'
await Capacitor.Plugins.CapacitorHttp.request({ url: `${base}/warm`, method: 'GET' })
await Capacitor.Plugins.CapacitorHttp.request({
  url: `${base}/probe?id=warm-loss`, method: 'POST',
  headers: { 'Content-Type': 'application/json' }, data: { fixture: true }
})
```

Read `GET /__fault/state` from the host: a patched write has one request and
one execution, while the lost response rejects the native call. The unpatched
warm path can make two executions and resolve successfully. `when: before`
drops the request before the fixture executes it; `drop: always` loses every
answer; `close: rst` resets plain HTTP (and abruptly closes HTTPS).
`/warm?expire=1` closes the idle connection after its answer. Each configuration
resets its named counter. Events record connection IDs and negotiated HTTP
versions; do not infer HTTP/2 coverage from a successful HTTPS call.

Optional `--api-port PORT` forwards `/v2/` requests only to a loopback fake API.
A configuration with `path: /v2/servers` and `method: POST` applies the same
fault to that route, so the real form can be checked. `when: after` waits for
the fake API response before losing it. `--cert PATH --key PATH` additionally
starts HTTPS/HTTP/1.1 on port+2 and an HTTP/2-only TLS listener on port+3.
HTTPS reproduction requires your own certificate/key setup: the fixture does
not generate them or configure Android trust. Supply a loopback certificate
valid for 127.0.0.1 and trust it only in the throwaway test build. For the
example ports also run `adb reverse tcp:8448 tcp:8448` and, when checking
protocol negotiation, `adb reverse tcp:8449 tcp:8449`. Production TLS settings
must stay unchanged. `--log PATH` records fixture events and only the
`content-length`, `transfer-encoding` and `content-type` request headers;
authorization, cookies and other headers are excluded. See `patches/README.md`
for the versioned fix and its limits.

`status` and `responseHeaders` configure probe responses, for example a 307
with `responseHeaders: { location: '/probe?id=target' }` (configure the target
case too), or a 401 with a `www-authenticate` header.

The fixture's six Node regressions run in `npm run test:api-errors`, without
Android or account access.

### Test Build

The Android app is the same UI over Capacitor's HTTP layer, and its API address is fixed in the code, so testing it needs a throwaway build:

1. `node scripts/gui-test/launch.mjs --name android --mock-port 8445 --mock-only --http`. The mock listens on the host's loopback, which the emulator reaches as `10.0.2.2`.
2. In a throwaway copy (`git worktree add --detach ../bldesk-android-gui main`, then link or install `node_modules`), make three test-only edits: in `src/renderer/src/api/client.ts` set `baseUrl` to `http://10.0.2.2:8445`; in `electron.vite.config.ts` add `http://10.0.2.2:8445` to the CSP `connect-src`; in `android/app/src/main/res/xml/network_security_config.xml` add `<domain-config cleartextTrafficPermitted="true"><domain includeSubdomains="false">10.0.2.2</domain></domain-config>`. Do not commit these; they exist only so the unmodified app code talks to the mock.
3. Build: `npm run build && npx cap sync android && touch android/capacitor-cordova-android-plugins/cordova.variables.gradle && (cd android && ./gradlew assembleDebug)`, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` on an emulator, or on a phone as described below.
4. Sign in by tapping the fields and typing the token from `<tmp>/bldesk-gui-test/android/token.txt` with `adb shell input text`. The debug WebView can be inspected (`adb forward tcp:9335 localabstract:webview_devtools_remote_<pid>`); Playwright can't attach to an Android WebView, so use `adb exec-out screencap -p` and a small raw CDP client (Node 22 has a global `WebSocket`).
5. Remove the worktree afterwards (`git worktree remove --force ../bldesk-android-gui`).

`mock.log` shows every request, which is the quickest way to check what a tap actually sent (for example, how many DELETEs one tap produced).

### On a physical phone

Steps 1 to 5 still apply, with these differences:

- `10.0.2.2` only exists inside the emulator. Use `127.0.0.1` in all three edits (`baseUrl`, the CSP `connect-src`, and the `<domain>` in the network security config; it is plain http, hence `cleartextTrafficPermitted`), and run `adb reverse tcp:8445 tcp:8445` so the phone's `127.0.0.1` reaches the mock on the PC.
- `./gradlew assembleDebug` fails with "SDK location not found" unless `ANDROID_HOME` is set or `android/local.properties` exists (`sdk.dir=<path to the Android SDK>`; the file is git-ignored).
- The phone locks after its screen timeout and the test stops. Turn on Developer options > Stay awake (or use a longer timeout), and keep the phone unlocked for adb.
- A debug build with the normal application id (`applicationId` in `android/app/build.gradle`) cannot be installed over a release-signed BLDesk, and uninstalling that one wipes its data. Give the throwaway build a different `applicationId` and the two install side by side.
- If `adb devices` does not list the phone at all, change the phone's USB "controlled by" setting, and accept the "Allow USB debugging" prompt on the phone.
- With an emulator and a phone both attached, add `-s <serial>` (from `adb devices`) to every `adb` command, `adb install` included.
- When you finish, clean up the phone as well as the worktree: `adb uninstall <the throwaway applicationId>` and `adb reverse --remove tcp:8445`.
