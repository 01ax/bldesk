# BLDesk auto-update

How BLDesk updates itself, as the code does it today. The desktop builds use `electron-updater` against GitHub Releases, except on macOS; Android has its own check. For the commands that cut a release see `AGENTS.md`.

---

## Publishing

A push of a `v*` tag runs `.github/workflows/release.yml`:

1. Each desktop OS builds in its own job with a read-only token and packages with `electron-builder --publish never`. The Android APK is built in the same run by `android.yml` (called as a reusable workflow).
2. Only if every build passes, the `publish` job, the only one with `contents: write`, runs no repository code. It creates the GitHub Release for the tag as a **draft**, uploads the installers and blockmaps, then the update manifests last (so an updater never reads a manifest that points at a file not uploaded yet), applies the CHANGELOG title and notes, and publishes it.
3. The release carries `latest.yml` (Windows), `latest-mac.yml` and `latest-linux.yml`, the installers (`.exe` NSIS and portable, `.dmg`, `.zip`, `.AppImage`, `.deb`), their `.blockmap` files and `BLDesk-android.apk`. Releases are immutable once published, so a failed tag means the next version number.

**Channels.** Every release, including a `-beta.N` version, is published as a full release (not a GitHub prerelease) with `latest*.yml` manifests. No `beta*.yml` manifest is published. So today both channels read the same releases, and **a client on the Stable channel is offered beta builds**. That is the open decision in #166; it is acceptable while there are few testers and should be settled before 1.1.0.

## The desktop client

`src/main/updater.ts` (`UpdaterManager`) wraps `electron-updater`:

- Checks 15 seconds after launch and every 6 hours, and when "Check now" is pressed.
- Windows and Linux download automatically (`autoDownload = true`) and install on quit (`autoInstallOnAppQuit = true`). A native notification says once per version that an update is ready.
- A downloaded update stays ready until it is installed, the channel is changed or a newer version starts to download: a later check that finds nothing newer or fails does not clear it. On Windows and Linux it is dropped when a different version is announced, because `electron-updater` deletes the downloaded installer then.
- The channel choice is saved in `<userData>/updater.json`. Stable sets `channel = latest` and `allowPrerelease = false`; Beta sets `channel = beta` and `allowPrerelease = true`. `allowDowngrade` is false.
- A check that cannot reach the feed (offline, no manifest) is `check-failed`, never `up-to-date`.
- Nothing runs in an unpackaged (development) build: the status stays `idle` and `supported` is false.
- The state is pushed to the renderer over IPC on every change.

Per platform:

| Platform | How it updates |
|---|---|
| Windows (NSIS) | `electron-updater` installs the downloaded installer on restart. `verifyUpdateCodeSignature` is false, because the builds are unsigned. The portable `.exe` is not covered: electron-builder supports auto-update for the NSIS installer, and BLDesk adds nothing for the portable build. |
| Linux `.deb` | `electron-updater`'s Debian updater installs the downloaded package through `pkexec`, so it asks for authorisation. BLDesk then starts itself again with `relaunchAfterExit` (not `app.relaunch()`, which would leave the new process with `no_new_privs` set, so the next update's `pkexec` would fail), without the `bldesk://` link that started it. |
| Linux AppImage | `electron-updater`'s AppImage updater replaces the file and restarts itself. |
| macOS | Not Squirrel.Mac, which refuses to apply an update to an app without a Developer ID signature. BLDesk downloads the universal `.zip` itself (`autoDownload` is false) into `<userData>/updates`. On restart or quit a detached shell script waits for the app to exit, unzips the archive, replaces the app bundle and clears the quarantine attribute, and after a restart (not when it runs on quit) opens the app. Robustness gaps in this path are tracked in #133, #134 and #135. |
| Android | Not `electron-updater`. `api/mobile-bridge.ts` asks the GitHub releases API (the latest release on Stable, the release list on Beta) for a newer `BLDesk-android.apk`, and "Update" opens that download for the system installer. The channel is saved in the app's preferences. The APK address must be one of this repository's own release downloads. |

## The title bar

`UpdateMenu.tsx` sits in the title bar next to the profile switcher. It shows `vX.Y.Z` with a dropdown holding the status, progress, release notes, a Stable/Beta channel select and "Check now". When an update is downloaded the control becomes a gold **Restart to update** pill.

## IPC

| Channel | Direction | Payload |
|---|---|---|
| `updater:getState` | invoke | → `UpdaterState` |
| `updater:check` | invoke | → `UpdaterState` |
| `updater:install` | invoke | quits and installs if the status is `ready`; on Windows and Linux the status becomes `installing` first, so a repeated request is ignored (on macOS the install script is started directly) |
| `updater:setChannel` | invoke | `'stable' \| 'beta'` → `UpdaterState` |
| `updater:state` | main → renderer | `UpdaterState` on every change |

```ts
interface UpdaterState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'installing' | 'check-failed' | 'error'
  currentVersion: string
  channel: 'stable' | 'beta'
  supported: boolean       // false in unpackaged desktop builds
  availableVersion?: string
  releaseNotes?: string
  progress?: number        // 0-100 while downloading
  error?: string
  lastCheckedAt?: string
  apkUrl?: string          // Android: the APK to open
}
```

## Testing it

`scripts/gui-test` has a mock GitHub feed. `{"updateVersion":"1.0.62-beta.99"}` offers a newer version; `{"feedStatus":404}` makes the feed fail. Run a packaged build (`--bin`) against it; the README says how, and not to press Restart against a real `pkexec`.

---

## Known limitations

**macOS updates and signing.** The builds are unsigned and not notarised. The DMG installs and runs, and BLDesk's own zip-and-replace update works without a signature, but the app is not trusted by Gatekeeper. To sign: obtain an Apple Developer ID Application certificate; add repository secrets `CSC_LINK` (base64 of the `.p12`) and `CSC_KEY_PASSWORD`, and for notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` with `"mac": { "notarize": true }` in `package.json`; remove the `CSC_IDENTITY_AUTO_DISCOVERY: false` lines from the workflow.

The embedded terminal adds a native `pty.node` binary and executable
`spawn-helper`; a future signed/notarised build must verify that both nested
binaries are signed and load under hardened runtime. Do **not** add
[`com.apple.security.cs.allow-unsigned-executable-memory`](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.cs.allow-unsigned-executable-memory) pre-emptively. Apple
documents it as permission to create writable/executable memory and warns that
it increases exposure to memory-safety vulnerabilities; node-pty has not shown
that need in the current unsigned build. Add an exception only if a signed
package demonstrates one is required.

**Windows SmartScreen.** Unsigned NSIS installers trigger SmartScreen warnings, but auto-update itself works. An OV/EV certificate later uses the same `CSC_LINK` / `CSC_KEY_PASSWORD` secrets on the Windows job.

**`xterm` deprecation.** The embedded terminal intentionally stays on the existing xterm 5.3-compatible package line, including `xterm-addon-search@0.13`. Migrate the terminal and all three add-ons together to the `@xterm/*` packages in a separate dependency PR; do not mix package generations.

**Repo-specific values.** `build.publish.owner` / `repo` in `package.json` are `termau/bldesk`. Change these if the repository moves. Switching to a self-hosted feed is a `build.publish` change to `{ "provider": "generic", "url": "..." }` plus copying the `release/` output (installers, `.blockmap` and `*.yml`) there; the macOS and Android paths read GitHub directly and would need changing too.
