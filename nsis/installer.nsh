; Relaunch the executable directly after an update, not the Start Menu shortcut.
;
; electron-builder's installSection.nsh prefers the shortcut when one exists:
;
;   ${if} ${FileExists} "$newStartMenuLink"
;     StrCpy $launchLink "$newStartMenuLink"
;   ${else}
;     StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
;   ${endIf}
;
; and then relaunches with ExecShellAsUser "$launchLink". During an in-place
; update that shell invocation fails: the app does not come back, and Windows
; raises "Windows cannot find ...\BLDesk.lnk" even though the shortcut is present
; and resolves correctly by hand.
;
; Verified by A/B on Windows 11, installer run exactly as electron-updater runs
; it (--updated --force-run):
;   shortcut present -> no relaunch, error dialog
;   shortcut removed -> relaunches cleanly, no dialog
;
; customInstall is inserted after the assignment above, so pointing $launchLink
; at the executable overrides the choice without touching the shortcut itself.
!macro customInstall
  StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend
