#!/bin/bash
set -e
if [ -f /etc/apparmor.d/bldesk ]; then
  apparmor_parser -R /etc/apparmor.d/bldesk 2>/dev/null || true
  rm -f /etc/apparmor.d/bldesk
fi
update-desktop-database /usr/share/applications 2>/dev/null || true
