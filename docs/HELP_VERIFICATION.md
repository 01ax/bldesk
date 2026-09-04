# Help verification

Implementation branch: `feat/help-and-ask-binarylane`. No version bump or new runtime dependencies.

## Architecture and content

- 33 bundled Markdown pages cover 15 top-level tabs, 11 server sub-tabs and all 16 palette verbs. Sources live in `docs/help`, loaded through the renderer's Vite `@help` raw-import alias. Nothing reads the filesystem at runtime.
- The local search and article-service search are separate sources in one view. The service does not index the bundled BLDesk docs; its answer appears below local results.
- Main-process IPC and the mobile bridge share the fixed `HELP_API_ORIGIN`, validators and 20-second timeout. There is no account client or token in this transport. Only visible search text is attached; feedback sends the returned answer ID as a number and a boolean.
- Markdown renders as escaped React nodes. Remote answers cannot launch local help actions, SSH deep links or arbitrary external domains. Local documentation can navigate through the existing deep-link parser.
- Opening help from a confirmation cancels that review. It never confirms the pending action.

## Checks performed

- `npm run typecheck`: both TypeScript projects, mutation guards, UI guards and help guards.
- `npm run build`: production main, preload and renderer bundles.
- Real Electron driven by Playwright, with isolated user data, fabricated account/server fixtures and cloud mutation requests rejected. No real cloud resources were modified.
- Sidebar and every top-level contextual question mark, `help firewall`, `??` and `bldesk://help/firewall#copy-a-ruleset` routing; confirmation-help cancellation; optional chip excludes a deliberately private custom image name. No nested action buttons or accidentally opened mutation dialogs in the contextual-link sweep.
- All 33 pages opened and their rendered content read in both light and dark themes. Representative screenshots visually inspected.
- 1024×680 and 1280×840 windows at 80%, 100%, 125% and 150% actual Electron zoom. Both index and article scroll independently, the search remains visible, and the document has no horizontal viewport overflow. At 1024×680/150%, the article retains approximately 285 CSS pixels of height. The initial stacked layout left only 66 pixels and was corrected before completion.
- Fixture answers: numbered steps, escaped HTML, blocked unsafe/deep links, four source rows, numeric feedback payload, disabled feedback after Thanks, suggestion keyboard selection, out-of-order answers, service errors and offline state with no request and intact local results.
- Live service: `how do I enable ipv6` returned an answer and four source articles; helpful feedback completed successfully through the real IPC/HTTP path. Only this generic query and its feedback were sent to the live service.
- Helper checks: empty Markdown headings terminate, duplicate heading IDs are stable, malformed percent-encoded links are rejected, palette aliases parse, unsafe article origins are rejected and invalid feedback IDs fail validation.

## Repeating the UI checks

Build first, then launch Electron through Playwright with a temporary `userData` path set before importing `out/main/index.js`. Supply fabricated vault responses and intercept BinaryLane cloud requests; reject all cloud writes. Test help-service fixtures separately, allowing only the fixed help origin through for the live question and feedback check.

Use Electron `webContents` zoom, not CSS scaling. Capture screenshots with `webContents.capturePage()`; browser screenshots can clip incorrectly at Electron zoom. Confirm that the last index item and the end of a long page are independently reachable while the search remains visible. Also try the named entry points above and verify the actual article heading, not merely that the Help tab opened.

The isolated scripts used for this pass live in `/private/tmp/bldesk-help.x4y9Gb` (`launcher.cjs`, `smoke.mjs`, `helpers.ts`); they are disposable verification harnesses, not app dependencies. The permanent source checks live in `scripts/check-help-guards.mjs` and run in CI through `npm run typecheck`.

## Screenshots and limits

Screenshots in `docs/screenshots/help-light.png`, `help-dark.png`, `help-150.png` and `ask-binarylane.png` contain only fabricated account data and a generic public-article answer. The displayed Electron runtime version in the test title bar comes from the isolated launcher, not a release version bump.

Packaged Windows/Linux deep-link registration and native platform menu behaviour were not rerun for this feature; the shared parser and Electron renderer routing were tested on macOS. No destructive workflow was executed against a live account. Android emulator verification is recorded below; physical-device and older-Android testing remain outside this pass.

## Android native smoke test

Installed the actual debug APK on an isolated Pixel 7-profile ARM64 emulator, Android 36, using Emulator 37.1.11 and Java 21. Playwright attached to the installed Capacitor WebView at `https://localhost/`; the runtime reported `platform: android` and `isNativePlatform(): true`. No profile or API token was added.

- APK build: `npx cap sync android`, then `./gradlew assembleDebug --no-daemon --console=plain` with the Android SDK and Java 21 configured. Build passed; existing Gradle deprecation/SDK XML-version warnings were non-fatal.
- Drawer → Help navigation and all 33 pages in both themes passed.
- Actual native `CapacitorHttp` calls were observed without replacing their implementation: live IPv6 answer, four source articles, suggestions and successful numeric-ID feedback. Requests used the pinned public help origin with no Authorization header.
- Portrait viewport 412×839: search visible, index scrollable, article approximately 451 CSS pixels high, no page-level horizontal overflow.
- Native Android keyboard opened with ADB input: viewport 412×527, search visible and approximately 139 pixels of independently scrollable article remained. This was not a simulated browser viewport.
- Landscape viewport 863×360: independent index/article scrolling, approximately 247 pixels of article height, no page-level horizontal overflow.
- Disabled both emulator Wi-Fi and mobile data, verified `navigator.onLine === false`, submitted a local-matching search and observed the offline message with intact local hits and zero native HTTP calls. Connectivity and portrait rotation were restored afterwards.

The first offline test exposed a real packaging omission: without `android.permission.ACCESS_NETWORK_STATE`, WebView kept reporting online. Adding this normal, read-only permission fixed detection in the rebuilt APK. The help guard now checks that it remains declared. Chromium documents the permission requirement in its [network notifier implementation](https://chromium.googlesource.com/chromium/src/net/+/refs/heads/main/android/java/src/org/chromium/net/NetworkChangeNotifier.java).

Android screenshots are `docs/screenshots/android-help-light.png`, `android-help-dark.png`, `android-help-keyboard.png`, `android-ask-live.png` and `android-help-offline.png`. They contain an empty account vault and generic help text only. The landscape screenshot caught Android's rotation animation and was excluded from the documentation; the landscape bounds/scroll assertions passed. The disposable harness and native-call report are in `/private/tmp/bldesk-android.F1nb3h`.

### Local emulator setup retained

The SDK is installed at `/Users/adam/Library/Android/sdk`, the AVD is named `bldesk-help-api36`, and Java 21 is at `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`. The SDK, AVD and Gradle cache occupy roughly 9 GB; no shell profile or global Java configuration was changed. To rebuild, supply `JAVA_HOME` and `ANDROID_HOME` for the Gradle command. To restart this emulator:

```sh
/Users/adam/Library/Android/sdk/emulator/emulator -avd bldesk-help-api36 -no-snapshot -no-boot-anim -gpu swiftshader -memory 2048 -no-audio
```

Use the SDK's `platform-tools/adb -s emulator-5554` for this emulator rather than an unqualified command that might select a physical device. The APK is under `android/app/build/outputs/apk/debug/app-debug.apk`; this is a local debug build, not a published release.
