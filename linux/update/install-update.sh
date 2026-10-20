#!/bin/sh
# Installs a downloaded BLDesk update. It is run as root through pkexec by update-session.sh, and the polkit action in
# com.termau.bldesk.policy names this file, so the system's password prompt says what it is for. It replaces
# `pkexec /bin/bash -c 'dpkg -i <path>'`, which asked for permission to run a shell as root with a path in the user's
# home folder in it.
#
#   install-update.sh APP_PID PACKAGE SHA512
#     APP_PID  the BLDesk process to wait for, so its files are not replaced while it runs
#     PACKAGE  the downloaded .deb (absolute path, a regular file owned by the user who started pkexec)
#     SHA512   its checksum from the release's latest-linux.yml, base64
#
# What it prints on standard output, one word or line at a time, is all the caller reads:
#   AUTHORIZED      the password was accepted and the package checked out; BLDesk may close now
#   INSTALLED       the package is installed
#   FAILED <why>    nothing was installed (it also exits non-zero)
# Everything else (apt's output) goes to standard error.
#
# The package sits in a folder the user can write to, so it is copied into a folder only root can write to and checked
# there against the checksum before apt-get installs that copy: swapping the file after the check changes nothing. That
# closes the gap between checking the download and installing it. It does NOT prove where the file came from: the
# checksum is passed in, and the releases are not signed. apt-get refuses a downgrade and resolves dependencies.
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

APT_GET=/usr/bin/apt-get
DPKG_DEB=/usr/bin/dpkg-deb
SCRATCH=/var/tmp/bldesk-update.XXXXXX
MAX_BYTES=524288000

say() { printf '%s\n' "$1"; }
fail() { say "FAILED $1"; exit 1; }

[ "$#" -eq 3 ] || fail "expected three arguments"
APP_PID=$1
PACKAGE=$2
EXPECTED=$3

[ -n "${PKEXEC_UID:-}" ] || fail "this is only run through pkexec"
case $APP_PID in '' | *[!0-9]*) fail "the process id is not a number" ;; esac
case $EXPECTED in '' | *[!A-Za-z0-9+/=]*) fail "the checksum is not base64" ;; esac
case $PACKAGE in /*) ;; *) fail "the package path is not absolute" ;; esac
case $PACKAGE in *'
'*) fail "the package path contains a newline" ;; esac
{ [ -f "$PACKAGE" ] && [ ! -L "$PACKAGE" ]; } || fail "the package is not a regular file"
[ "$(stat -c %u -- "$PACKAGE")" = "$PKEXEC_UID" ] || fail "the package is not owned by the user who asked for the update"
[ "$(stat -c %s -- "$PACKAGE")" -le "$MAX_BYTES" ] || fail "the package is larger than expected"

WORK=$(mktemp -d "$SCRATCH")
trap 'rm -rf "$WORK"' EXIT
COPY=$WORK/bldesk.deb
cat -- "$PACKAGE" > "$COPY"
# apt-get reads the file as its own unprivileged user; only root can change it.
chmod 755 "$WORK"
chmod 644 "$COPY"

ACTUAL=$(sha512sum "$COPY" | cut -d' ' -f1)
WANT=$(printf '%s' "$EXPECTED" | base64 -d 2>/dev/null | od -An -v -tx1 | tr -d ' \n')
{ [ -n "$WANT" ] && [ "$ACTUAL" = "$WANT" ]; } || fail "the downloaded package does not match its published checksum"
[ "$("$DPKG_DEB" -f "$COPY" Package 2>/dev/null)" = bldesk ] || fail "the downloaded file is not the BLDesk package"

say AUTHORIZED

# Let BLDesk finish closing. If it has not after a minute, go ahead: dpkg replaces the files either way.
i=0
while kill -0 "$APP_PID" 2>/dev/null && [ "$i" -lt 300 ]; do
  sleep 0.2
  i=$((i + 1))
done

export DEBIAN_FRONTEND=noninteractive
if "$APT_GET" install -y -o DPkg::Lock::Timeout=120 "$COPY" >&2; then
  say INSTALLED
else
  fail "apt-get could not install the package"
fi
