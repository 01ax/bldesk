#!/bin/sh
# Runs one BLDesk package update for the signed-in user: asks for permission (pkexec shows the system's password
# prompt), has install-update.sh install the package, and opens BLDesk again afterwards. BLDesk starts it detached and
# keeps running while the prompt is open; this script outlives BLDesk, which closes once the password was accepted.
#
#   update-session.sh LOG OUT APP_PID PACKAGE SHA512 RELAUNCH [COMMAND [ARGUMENT...]]
#     LOG       a file to append timestamped lines to (BLDesk's updater.log)
#     OUT       a file BLDesk reads; install-update.sh's lines go in it, then one line of this script's own:
#                 RESULT installed | RESULT cancelled | RESULT failed <why> | RESULT unavailable <what is missing>
#                 | RESULT untrusted
#     APP_PID   the BLDesk process that started this
#     RELAUNCH  1 to start COMMAND once BLDesk has exited, 0 to leave it closed (the update was installed at quit)
#
# This runs as the user, never as root: the only thing that does is install-update.sh, through pkexec.
set -u
# The helper sits next to this script, wherever the package put it (BLDesk starts this by its full path). For the .deb that
# is /opt/BLDesk/resources/linux/, the path the polkit action names: only there does the prompt say what it is for.
HELPER=${0%/*}/install-update.sh
# What install-update.sh runs as root, and that it needs to be there before anyone is asked for a password.
APT_GET=/usr/bin/apt-get
DPKG_DEB=/usr/bin/dpkg-deb
SETPRIV=/usr/bin/setpriv
# Who must own the helper and every folder above it, and where the walk up from the helper stops.
TRUSTED_OWNER=0
TRUST_TOP=/

[ "$#" -ge 6 ] || { echo "usage: update-session.sh LOG OUT APP_PID PACKAGE SHA512 RELAUNCH [COMMAND [ARGUMENT...]]" >&2; exit 2; }
LOG=$1
OUT=$2
APP_PID=$3
PACKAGE=$4
SHA512=$5
RELAUNCH=$6
shift 6

note() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$1" >> "$LOG" 2>/dev/null || true; }

: > "$OUT" || exit 2
# A missing tool is reported as that, before any prompt. Left to pkexec it would look like a dismissed prompt: the shell's
# "not found" and pkexec's "not authorised" are both exit status 127.
MISSING=
command -v pkexec > /dev/null 2>&1 || MISSING='pkexec (part of polkit)'
[ -x "$APT_GET" ] || MISSING="${MISSING:+$MISSING, }apt-get"
[ -x "$DPKG_DEB" ] || MISSING="${MISSING:+$MISSING, }dpkg-deb"
[ -x "$SETPRIV" ] || MISSING="${MISSING:+$MISSING, }setpriv (part of util-linux)"
if [ -n "$MISSING" ]; then
  printf 'RESULT unavailable %s\n' "$MISSING" >> "$OUT"
  note "update session: RESULT unavailable $MISSING"
  exit 0
fi
# pkexec runs the helper as root, so the helper and every folder above it must belong to root and not be writable by anyone
# else. A development or unpacked copy of BLDesk sits in a user's own folder, where anything running as that user could
# change the helper first.
untrusted() {
  p=$HELPER
  while :; do
    [ "$(stat -c %u -- "$p" 2>/dev/null)" = "$TRUSTED_OWNER" ] || return 0
    m=$(stat -c %a -- "$p" 2>/dev/null) || return 0
    m=${m#"${m%???}"}
    case $m in ?[2367]? | ??[2367]) return 0 ;; esac
    [ "$p" = "$TRUST_TOP" ] && return 1
    p=${p%/*}
    [ -n "$p" ] || p=/
  done
}
if untrusted; then
  printf 'RESULT untrusted\n' >> "$OUT"
  note "update session: RESULT untrusted ($HELPER, or a folder above it, is not owned by root or can be written to by others)"
  exit 0
fi
note "update session: asking for permission to install $PACKAGE"
# pkexec exits 126 when the prompt was dismissed and 127 when it was not authorised or could not run, so both of those
# are reported as not installed because the user did not allow it, anything else as a failed install.
pkexec --disable-internal-agent "$HELPER" "$APP_PID" "$PACKAGE" "$SHA512" > "$OUT" 2>> "$LOG"
STATUS=$?
if [ "$STATUS" -eq 0 ] && grep -qx INSTALLED "$OUT"; then
  RESULT="RESULT installed"
elif [ "$STATUS" -eq 126 ] || [ "$STATUS" -eq 127 ]; then
  RESULT="RESULT cancelled"
else
  WHY=$(sed -n 's/^FAILED //p' "$OUT" | tail -n 1)
  RESULT="RESULT failed ${WHY:-the update did not install (exit status $STATUS)}"
fi
printf '%s\n' "$RESULT" >> "$OUT"
note "update session: $RESULT (pkexec exit status $STATUS)"

# Open BLDesk again if it was told to close. That happens only once the password has been accepted (the AUTHORIZED line), so
# a prompt that was dismissed, or a tool that was missing, leaves the running BLDesk alone: if the user quit it themselves
# meanwhile they did not ask for it back, and a second copy would only be turned away by the single-instance lock. BLDesk
# may not have finished closing yet, so wait for it (a minute is more than it needs; the helper waits as long).
if [ "$RELAUNCH" = 1 ] && [ "$#" -ge 1 ] && grep -qx AUTHORIZED "$OUT"; then
  i=0
  while kill -0 "$APP_PID" 2>/dev/null && [ "$i" -lt 100 ]; do
    sleep 0.2
    i=$((i + 1))
  done
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    note "update session: opening BLDesk again"
    exec "$@"
  fi
fi
