# Existing SSH key-file selection

Released in 1.0.61-beta.8 (7 September 2026). Follow-up to issue #56.

## Behaviour

Remote Access → Key for this server → Browse… opens the native single-file picker, without extension filters. The selected exact full path, including filename, is stored in the existing per-profile/server association. Cancellation leaves it unchanged. The filename appears in the selector and the full path under Key file.

The picker and availability checks use `existingKeyFiles` (`src/main/sshKeyFiles.ts`), which checks absolute-path shape and file metadata only. No private-key content is read, copied, imported or persisted by this new path. No passphrase storage is implemented. Existing automatic discovery continues to read public `.pub` files. Selected private files do not need a `.pub` sibling or a conventional filename/location; OpenSSH determines whether their format and credentials work.

`availableSshKeys` includes the originating profile's associations and last-working path when requesting metadata. Server launchers, terminal picker/reopen, broadcast and learning all use it. Address preferences and key learning are unchanged. A genuinely missing file remains subject to existing fallback/pruning and broadcast missing-key skips. Browse again after moving or renaming a file.

## Verification

- Typecheck and mutation/UI/help/PTY/updater guards passed.
- Terminal unit suite passed, including the actual key metadata helper with Windows path semantics: `D:\Team Keys\production-access.pem` retains its exact path and filename; duplicates are removed; missing files/directories are excluded; relative/control-character paths are rejected. The filesystem stub offers only stat, no file-read API.
- Actual picker-handler tests cover exact path return, cancellation and rejection of callers outside the main window/frame.
- Production bundle build passed.
- Electron/OpenSSH loopback suite passed. Only the native dialog response is stubbed; the production picker IPC and production availability handler run against generated fixture files in an isolated home directory. An external `Team key arbitrary filename.pem`, without a `.pub` sibling, is selected, survives cancellation and a full Electron restart, prefills the terminal picker, runs broadcast with exit 0, and remains the last-working path. Moving the fixture file then produces key missing and disables broadcast. Existing two-key and host-alias positive/negative controls remain passing.
- Native Electron sizes 1024×680 and 1280×840 at 80%, 125%, 150%: Browse… and full-path display remain reachable. No renderer errors. Report directory: `bldesk-terminal-smoke-RAIrWK` under the system temporary directory. Test listeners/processes are cleaned up; generated artifacts remain there for inspection.

Not tested on a native Windows machine: operating-system file-picker interaction and actual Windows OpenSSH execution. Windows path semantics are unit-tested, not a replacement for that acceptance check. On Windows, browse to a non-default filename outside the user .ssh directory, cancel/reselect, restart BLDesk and connect using the appropriate server. Confirm passphrase handling occurs in OpenSSH or the user's SSH agent; BLDesk has no passphrase field.

Help source audit: [HELP_VERIFICATION.md](HELP_VERIFICATION.md).
