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

- Checks 15 seconds after launch and then every hour, when "Check now" is pressed, and when the window gets focus or the computer wakes (15 seconds after waking, so the network is back), as long as no check started in the last 15 minutes.
- Windows and Linux download automatically (`autoDownload = true`). Windows installs on quit (`autoInstallOnAppQuit = true`); a Linux `.deb` is installed by BLDesk's own helper, also on quit (see below), so the library's install is off there. A native notification says once per version that an update is ready.
- A downloaded update stays ready until it is installed, the channel is changed or a newer version starts to download: a later check that finds nothing newer or fails does not clear it. On Windows and Linux it is dropped when a different version is announced, because `electron-updater` deletes the downloaded installer then.
- The channel choice is saved in `<userData>/updater.json`. Stable sets `channel = latest` and `allowPrerelease = false`; Beta sets `channel = beta` and `allowPrerelease = true`. `allowDowngrade` is false.
- A check that cannot reach the feed (offline, no manifest) is `check-failed`, never `up-to-date`.
- Nothing runs in an unpackaged (development) build: the status stays `idle` and `supported` is false.
- The state is pushed to the renderer over IPC on every change.

Per platform:

| Platform | How it updates |
|---|---|
| Windows (NSIS) | `electron-updater` installs the downloaded installer on restart. `verifyUpdateCodeSignature` is false, because the builds are unsigned. The portable `.exe` is not covered: electron-builder supports auto-update for the NSIS installer, and BLDesk adds nothing for the portable build. |
| Linux `.deb` | `electron-updater` downloads and checks the package; BLDesk installs it itself through `pkexec` and a small helper, with the window open while the password is asked for. See [Linux package updates](#linux-package-updates). |
| Linux AppImage | `electron-updater`'s AppImage updater replaces the file and restarts itself. |
| macOS | Not Squirrel.Mac, which refuses to apply an update to an app without a Developer ID signature. BLDesk downloads the universal `.zip` itself (`autoDownload` is false) into `<userData>/updates`, with Electron's `net.fetch`, so the download uses the system proxy settings as the update check does. A download that fails part-way, receives nothing for 60 seconds or cannot be written is deleted and reported like any other update error. The zip is offered only if its size and SHA-512 are the ones `latest-mac.yml` lists for it: a download that does not match is deleted, never offered, and reported like any other update error, and a zip already there (from an earlier download, which may have been interrupted) is reused only if it matches. If the feed lists no size or no SHA-512 for the zip, nothing is downloaded or offered, and that is reported instead. On restart or quit a detached shell script waits for the app to exit, unzips the archive, copies the new app bundle next to the installed one, swaps the two by renaming them and clears the quarantine attribute, and after a restart (not when it runs on quit) opens the app. If unzipping or copying fails, the installed app is left as it was: the script logs the failure to the system log (tag `BLDesk`) and exits non-zero, and after a restart it opens the version that is still installed. |
| Android | Not `electron-updater`. `api/mobile-bridge.ts` asks the GitHub releases API (the latest release on Stable, the release list on Beta) for a newer `BLDesk-android.apk`, and "Update" opens that download for the system installer. The channel is saved in the app's preferences. The APK address must be one of this repository's own release downloads. |

## Linux package updates

The `.deb` is not updated by `electron-updater`'s Debian updater, which ran `pkexec /bin/bash -c 'dpkg -i <file>'` synchronously: the window froze for about ten seconds, the password prompt was the generic one for running `/bin/bash`, the files were replaced under the running app, and the package was installed from a folder the user can write to without being checked again. The library still downloads the package and checks it against the SHA-512 in `latest-linux.yml`. BLDesk installs it:

1. **Restart to update** first looks at the feed once more, because the download can be hours old and the hourly check may not have seen a release published since (the status is `installing` with `installPhase: 'checking'`, and it waits at most six seconds). If a newer version has been published, the library replaces the download, and BLDesk installs the newer one as soon as it has downloaded, without another click. If the feed cannot be read in time it goes on with what it has.
2. It then runs `update-session.sh` (the user's, detached) and the status becomes `installing` with `installPhase: 'authorising'`. BLDesk stays open and responsive. `update-session.sh` first checks that the tools exist and that the helper can be trusted (below), then runs `pkexec` on `install-update.sh`, which polkit knows by the action `com.termau.bldesk.install-update` in `linux/com.termau.bldesk.policy`, so the prompt says "Authentication is required to install a BLDesk update".
3. As root, `install-update.sh` checks its arguments (the BLDesk process id, the package path, its SHA-512) and that the package is a regular file, owned by the user who asked, within the size limit. It then reads the package **as that user** (through `setpriv`, never as root: the user can swap the path for a link to a file only root can read at any moment after the checks, and then root would read it), at most one byte past the limit, into a new folder only root can enter. There it checks the copy against the SHA-512 from the feed and that its `Package` field is `bldesk`. Only then does it open the copy to `apt-get` (which reads local files as its own unprivileged user) and print `AUTHORIZED`. A copy that fails any check was never readable by anyone else and is removed, a kill included. The file the user can write to is never installed.
4. BLDesk reads `AUTHORIZED` from the session's output file (`<userData>/update-session/session.out`, polled four times a second), sets `installPhase: 'installing'` and quits after a moment. The helper waits up to a minute for the process to exit, then runs `apt-get install` on the checked copy (which refuses a downgrade and installs dependencies) and prints `INSTALLED`.
5. `update-session.sh` writes `RESULT installed`, `RESULT cancelled` (`pkexec` exit 126 or 127: the prompt was closed or the password was not accepted) or `RESULT failed <why>`. If it saw `AUTHORIZED`, which is what tells BLDesk to close, it waits for BLDesk to finish closing and starts it again with the same command line, minus any `bldesk://` link. After a dismissed prompt, or when nothing was asked, BLDesk was never told to close and is left alone (if the user quit it meanwhile they did not ask for it back). Nothing is reopened for an install started at quit. If the script itself dies without a result, BLDesk records `RESULT failed` for it, so the status cannot stay on `installing`.
6. If it did not install while BLDesk is still open, the status goes back to `ready` with `installError` set, which the title bar shows as a failure notice. If the installer refused the file itself (wrong checksum, not a regular file, too large, not readable), the file is deleted and the next check downloads it again, since the same file would be refused every time. A result left by a session that ran while BLDesk was closed is reported the same way the next time BLDesk starts. While an install is under way a release announced by a check that was still running is ignored and not downloaded, so it cannot replace the file about to be installed.

Quitting with an update waiting does the same thing without the restart: the prompt opens while BLDesk closes, and BLDesk is not opened again. If it is cancelled, BLDesk says so the next time it starts.

BLDesk is restarted with a plain command, not `app.relaunch()`, which leaves the new process with `no_new_privs` set (`NoNewPrivs: 1` in `/proc/<pid>/status`), so the next update's `pkexec` would exit 127. BLDesk checks for that first and says to open it again from the app menu.

The two scripts are packaged to `/opt/BLDesk/resources/linux/` (`build.linux.extraResources`), and the policy to `/usr/share/polkit-1/actions/` (`build.deb.fpm`). The package recommends `pkexec | policykit-1`. `after-install.sh` makes the scripts, and the folders on the way to them, writable by root alone whatever umask built the package. The helper is installed at `/opt/BLDesk/resources/linux/install-update.sh`, the path the policy's `exec.path` names. `update-session.sh` finds it beside itself, and refuses to hand it to `pkexec` (`RESULT untrusted`) unless it and every folder above it are owned by root and not writable by group or others, so an unpacked or development copy in a user's folder, where anything running as that user could change the script first, does not install updates this way. `scripts/check-updater-guards.mjs` keeps the policy's path, `APP_DIR` in `after-install.sh`, the packaging entries and `updateScriptPaths` in agreement. The scripts are tested in `scripts/test-linux-update-scripts.mjs` with a fake `pkexec`, `apt-get` and `dpkg-deb`.

`<userData>/updater.log` (`~/.config/bldesk/updater.log`) records what the updater did, the install session's lines and `apt-get`'s output included, and is rotated at 512 KiB.

**What this does not do.** Updates aren't signed yet, so the checksum, which the helper is handed by whoever runs it, only guards against the file being swapped after BLDesk checked it. Any process running as the logged-in user can ask for the same password prompt with a package of its own (it must be named `bldesk`, and `apt-get` won't go to a lower version): no more than it could ask for before with a `/bin/bash` prompt, but this prompt looks routine, and a compromised GitHub release could likewise serve a package that matches its checksum. Signing, with a key shipped root-owned in the package that the helper verifies, or an APT repository, is the fix, and is not set up here.

With no polkit agent running (an SSH session, say) `pkexec` exits 127, and BLDesk reports that as the prompt having been closed or the password not accepted. KDE's agent also gives 127 when the prompt is cancelled, where GNOME's gives 126.

Before it asks for a password, `update-session.sh` checks that `pkexec` (from polkit), `apt-get` and `dpkg-deb` exist, and if one does not it writes `RESULT unavailable <what is missing>`; BLDesk then says it can't install updates on that system. A plain KDE Plasma install has no `pkexec`, for example, because Ubuntu ships it as its own package. Without the check the shell's "not found" is exit status 127 too, and looked like a dismissed prompt.

Known limits. If another package manager (`apt`, `unattended-upgrades`) holds the dpkg lock, `apt-get` waits up to two minutes for it, with BLDesk already closed; after that the install fails and BLDesk reopens with a notice. If the system shuts down or the session ends while `apt-get` is running, dpkg can be left half-way, as for any interrupted install, and `sudo dpkg --configure -a` finishes it. A session started at quit that is still waiting for its password when BLDesk is opened again is left alone, so a Restart can then open a second prompt; if the first is approved it installs under the running BLDesk.

An update from a version before this one still runs the old install, once: the new flow starts with the version that contains it.

## The title bar

`UpdateMenu.tsx` sits in the title bar next to the profile switcher. It shows `vX.Y.Z` with a dropdown holding the status, progress, release notes, a Stable/Beta channel select and "Check now". When an update is downloaded the control becomes a gold **Restart to update** pill.

## IPC

| Channel | Direction | Payload |
|---|---|---|
| `updater:getState` | invoke | → `UpdaterState` |
| `updater:check` | invoke | → `UpdaterState` |
| `updater:install` | invoke | installs if the status is `ready`; on Windows and Linux the status becomes `installing` first, so a repeated request is ignored (on macOS the install script is started directly; on a Linux package `installPhase` says whether the password is still being asked for) |
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
  installPhase?: 'checking' | 'authorising' | 'installing'  // Linux package, while `installing`
  installError?: string    // why the last Restart did not install (prompt closed, checksum, installer)
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
