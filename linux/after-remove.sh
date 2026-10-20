#!/bin/bash
set -e

# Undo the /usr/bin/bldesk link that after-install.sh adds, but only when the
# package is really being removed. On an upgrade dpkg runs this script from the
# old version ("upgrade"), and the link has to survive it.
case "$1" in
  remove|purge)
    if type update-alternatives >/dev/null 2>&1; then
      update-alternatives --remove bldesk /opt/BLDesk/bldesk 2>/dev/null || true
    fi
    # after-install.sh falls back to a plain link when update-alternatives is missing or fails.
    if [ "$(readlink /usr/bin/bldesk)" = /opt/BLDesk/bldesk ]; then
      rm -f /usr/bin/bldesk
    fi
    # The AppArmor profile goes only with the package, for the same reason. On an upgrade this script runs from the
    # old version, and after-install.sh of the new one writes and reloads the profile again at the end: removing it
    # here left BLDesk with no profile for however long the install took (about six seconds), and on Ubuntu 23.10+
    # a BLDesk started in that gap is refused the user namespaces its sandbox needs.
    if [ -f /etc/apparmor.d/bldesk ]; then
      apparmor_parser -R /etc/apparmor.d/bldesk 2>/dev/null || true
      rm -f /etc/apparmor.d/bldesk
    fi
    ;;
esac

update-desktop-database /usr/share/applications 2>/dev/null || true
