#!/bin/bash
# Post-install for the .deb. Replaces electron-builder's default script.
#
# Chromium sandboxes with unprivileged user namespaces when it can, and only
# falls back to the setuid helper (chrome-sandbox 4755) when it cannot. The
# default script tests `unshare --user` here — as root, where it always works —
# and so sets the helper 0755 even on Ubuntu 23.10+, where AppArmor denies
# namespaces to unprivileged binaries. Result: the app aborts at launch.
#
# Order of preference, so no setuid file is used unless nothing else works:
#   1. AppArmor profile granting `userns` to our binary (what Ubuntu documents
#      and what Chrome's own .deb does)  → helper 0755, never used.
#   2. Kernel has no restriction          → helper 0755, never used.
#   3. Restriction on and no AppArmor     → helper 4755, Chromium's fallback.
set -e

APP_DIR='/opt/BLDesk'
EXECUTABLE='bldesk'   # the launcher script; the ELF is bldesk.bin (see scripts/after-pack.cjs)

# --- Desktop integration (as electron-builder's default) ---
if type update-alternatives >/dev/null 2>&1; then
  if [ -L "/usr/bin/$EXECUTABLE" ] && [ -e "/usr/bin/$EXECUTABLE" ] && [ "$(readlink "/usr/bin/$EXECUTABLE")" != "/etc/alternatives/$EXECUTABLE" ]; then
    rm -f "/usr/bin/$EXECUTABLE"
  fi
  update-alternatives --install "/usr/bin/$EXECUTABLE" "$EXECUTABLE" "$APP_DIR/$EXECUTABLE" 100 || ln -sf "$APP_DIR/$EXECUTABLE" "/usr/bin/$EXECUTABLE"
else
  ln -sf "$APP_DIR/$EXECUTABLE" "/usr/bin/$EXECUTABLE"
fi
hash update-mime-database 2>/dev/null && update-mime-database /usr/share/mime || true
hash update-desktop-database 2>/dev/null && update-desktop-database /usr/share/applications || true

# --- Sandbox ---
restricted="$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)"
profile_loaded=0
if [ -d /etc/apparmor.d ] && command -v apparmor_parser >/dev/null 2>&1; then
  cat > /etc/apparmor.d/bldesk <<'PROFILE'
# AppArmor profile for BLDesk (BinaryLane Desktop): allow user namespaces so
# Chromium's sandbox works on Ubuntu 23.10+ without a setuid helper.
abi <abi/4.0>,
include <tunables/global>

profile bldesk /opt/BLDesk/bldesk.bin flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/bldesk>
}
PROFILE
  # Older AppArmor (Ubuntu 22.04 and earlier) cannot parse abi 4.0; those
  # releases do not restrict user namespaces, so falling through is harmless.
  if apparmor_parser -r /etc/apparmor.d/bldesk 2>/dev/null; then
    profile_loaded=1
  else
    rm -f /etc/apparmor.d/bldesk
  fi
fi

if [ "$profile_loaded" = "1" ] || [ "$restricted" != "1" ]; then
  chmod 0755 "$APP_DIR/chrome-sandbox" || true
else
  # No AppArmor to grant namespaces and the kernel denies them: Chromium's
  # setuid fallback is the only way it will start.
  chmod 4755 "$APP_DIR/chrome-sandbox" || true
fi
