#!/bin/bash
# Post-remove script for VoceLibre (deb)
# Best-effort: must never fail package removal, and must never run on upgrade.

set -uo pipefail

# dpkg also invokes the old version's postrm during upgrades (arg: upgrade /
# failed-upgrade). Only clean up when the package is really going away.
case "${1:-remove}" in
  remove|purge) ;;
  *) exit 0 ;;
esac

# Undo what after-install.sh set up outside the package's own file list.
APP_DIR="/opt/VoceLibre"
EXE="vocelibre"

if type update-alternatives >/dev/null 2>&1; then
  update-alternatives --remove "$EXE" "$APP_DIR/$EXE" >/dev/null 2>&1 || true
fi
if [ -L "/usr/bin/$EXE" ] && [ ! -e "/usr/bin/$EXE" ]; then
  rm -f "/usr/bin/$EXE"
fi

APPARMOR_TARGET="/etc/apparmor.d/$EXE"
if [ -f "$APPARMOR_TARGET" ]; then
  # Unload before deleting so the policy is not left enforced until reboot
  if apparmor_status --enabled >/dev/null 2>&1 && hash apparmor_parser 2>/dev/null \
    && ! { [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; }; then
    apparmor_parser --remove "$APPARMOR_TARGET" >/dev/null 2>&1 || true
  fi
  rm -f "$APPARMOR_TARGET"
fi

if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi

REAL_USER="${SUDO_USER:-}"
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
  REAL_USER=$(logname 2>/dev/null || echo "")
fi
if [ "$REAL_USER" = "root" ]; then
  REAL_USER=""
fi

REAL_HOME=""
if [ -n "$REAL_USER" ]; then
  REAL_HOME=$(getent passwd "$REAL_USER" 2>/dev/null | cut -d: -f6 || echo "")
fi
if [ -z "$REAL_HOME" ]; then
  exit 0
fi

CACHE_DIR="$REAL_HOME/.cache/openwhispr"
MODELS_DIR="$CACHE_DIR/models"

if [ -d "$MODELS_DIR" ]; then
  rm -rf "$MODELS_DIR" 2>/dev/null || true
  echo "Removed VoceLibre cached models"
fi

if [ -d "$CACHE_DIR" ]; then
  rmdir "$CACHE_DIR" 2>/dev/null || true
fi

exit 0
