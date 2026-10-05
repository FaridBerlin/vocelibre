#!/bin/bash
# Post-install script for VoceLibre (deb/rpm)
# Replaces electron-builder's default after-install template, so it must also do
# that template's job: the /usr/bin launcher, desktop/MIME database refresh, the
# AppArmor profile and chrome-sandbox permissions. Then it sets up the ydotool
# daemon prerequisites.
# Best-effort: nothing here may fail the package install.
#
# Paths are literal, not electron-builder ${...} macros: the rpm target passes
# this file to fpm untemplated. They follow productName ("VoceLibre") and the
# package.json name ("vocelibre").

set -uo pipefail

APP_DIR="/opt/VoceLibre"
EXE="vocelibre"
LAUNCHER="/usr/bin/$EXE"

# 0a. /usr/bin launcher, so `vocelibre` works from a terminal
if [ -e "$APP_DIR/$EXE" ]; then
  if type update-alternatives >/dev/null 2>&1; then
    # Drop a plain symlink left by an older install that did not use alternatives
    if [ -L "$LAUNCHER" ] && [ "$(readlink "$LAUNCHER")" != "/etc/alternatives/$EXE" ]; then
      rm -f "$LAUNCHER"
    fi
    update-alternatives --install "$LAUNCHER" "$EXE" "$APP_DIR/$EXE" 100 >/dev/null 2>&1 \
      || ln -sf "$APP_DIR/$EXE" "$LAUNCHER" 2>/dev/null || true
  else
    ln -sf "$APP_DIR/$EXE" "$LAUNCHER" 2>/dev/null || true
  fi
fi

# 0b. Make the app menu and the openwhispr:// handler pick up the new entry
if hash update-mime-database 2>/dev/null; then
  update-mime-database /usr/share/mime >/dev/null 2>&1 || true
fi
if hash update-desktop-database 2>/dev/null; then
  update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
if hash gtk-update-icon-cache 2>/dev/null; then
  gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
fi

# 0c. AppArmor profile granting user namespaces (Ubuntu 24.04+ restricts them for
#     unconfined apps, and Chromium's sandbox needs them). The dry-run parse skips
#     AppArmor versions that predate abi/4.0, such as Ubuntu 22.04's, where the
#     app runs without a profile anyway.
APPARMOR_LOADED=0
APPARMOR_SOURCE="$APP_DIR/resources/apparmor-profile"
APPARMOR_TARGET="/etc/apparmor.d/$EXE"
if [ -f "$APPARMOR_SOURCE" ] && hash apparmor_parser 2>/dev/null \
  && apparmor_status --enabled >/dev/null 2>&1; then
  if apparmor_parser --skip-kernel-load --debug "$APPARMOR_SOURCE" >/dev/null 2>&1; then
    cp -f "$APPARMOR_SOURCE" "$APPARMOR_TARGET" 2>/dev/null || true
    # Live-loading is meaningless in a chroot (image builds); the profile is
    # picked up at next boot there instead.
    if [ -x /usr/bin/ischroot ] && /usr/bin/ischroot; then
      :
    elif apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_TARGET" >/dev/null 2>&1; then
      APPARMOR_LOADED=1
    fi
  fi
fi

# 0d. chrome-sandbox. Chromium sandboxes through unprivileged user namespaces
#     where it can and needs a root-owned setuid helper where it cannot. Keep the
#     setuid bit off when namespaces work, as electron-builder's template does,
#     and set it when the kernel lacks them or AppArmor restricts them and our
#     profile could not be loaded. (scripts/lib/linux-launcher.js still falls
#     back to --no-sandbox if neither path works at launch.)
CHROME_SANDBOX="$APP_DIR/chrome-sandbox"
if [ -f "$CHROME_SANDBOX" ]; then
  NEEDS_SUID=0
  if [ ! -L /proc/self/ns/user ] \
    || [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ] \
    || [ "$(cat /proc/sys/user/max_user_namespaces 2>/dev/null)" = "0" ]; then
    NEEDS_SUID=1
  elif [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] \
    && [ "$APPARMOR_LOADED" != "1" ]; then
    NEEDS_SUID=1
  fi
  chown root:root "$CHROME_SANDBOX" 2>/dev/null || true
  if [ "$NEEDS_SUID" = "1" ]; then
    chmod 4755 "$CHROME_SANDBOX" 2>/dev/null || true
  else
    chmod 0755 "$CHROME_SANDBOX" 2>/dev/null || true
  fi
fi

UDEV_RULE='KERNEL=="uinput", GROUP="input", MODE="0660", TAG+="uaccess"'
UDEV_RULE_PATH="/etc/udev/rules.d/70-uinput.rules"
SERVICE_PATH="/usr/lib/systemd/user/ydotoold.service"

# Detect the real user (not root) who triggered the install.
# No SUDO_USER and no tty (GUI installers, D-Bus backed ones like Aptkit) is fine:
# the user-specific steps below are simply skipped.
REAL_USER="${SUDO_USER:-}"
if [ -z "$REAL_USER" ] || [ "$REAL_USER" = "root" ]; then
  REAL_USER=$(logname 2>/dev/null || echo "")
fi
if [ "$REAL_USER" = "root" ]; then
  REAL_USER=""
fi

# 1. udev rule for /dev/uinput — only where udev actually exists (skipped in
#    containers, chroots and minimal systems, where the rule is useless anyway)
if [ -d /etc/udev/rules.d ]; then
  if [ ! -f "$UDEV_RULE_PATH" ] || ! grep -q uinput "$UDEV_RULE_PATH" 2>/dev/null; then
    echo "$UDEV_RULE" > "$UDEV_RULE_PATH" 2>/dev/null || true
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger /dev/uinput 2>/dev/null || true
  fi
fi

# 2. Add user to input group
if [ -n "$REAL_USER" ]; then
  if ! id -nG "$REAL_USER" 2>/dev/null | grep -qw input; then
    usermod -aG input "$REAL_USER" 2>/dev/null || true
  fi
fi

# 3. systemd user service for ydotoold
# Skip if a service already exists (e.g. Fedora ships one with the ydotool package)
# or if systemd is not present on this system at all.
if [ -d /usr/lib/systemd ] && [ ! -f "$SERVICE_PATH" ] && [ ! -f "/usr/lib/systemd/user/ydotool.service" ]; then
  YDOTOOLD_BIN=$(command -v ydotoold 2>/dev/null || echo "/usr/bin/ydotoold")
  if [ -x "$YDOTOOLD_BIN" ] || [ -f "$YDOTOOLD_BIN" ]; then
    mkdir -p "$(dirname "$SERVICE_PATH")" 2>/dev/null || true
    if [ -d "$(dirname "$SERVICE_PATH")" ]; then
      cat > "$SERVICE_PATH" 2>/dev/null << SERVICEEOF || true
[Unit]
Description=ydotoold - ydotool daemon
After=graphical-session.target
PartOf=graphical-session.target

[Service]
ExecStartPre=/usr/bin/sleep 2
ExecStart=$YDOTOOLD_BIN
Restart=on-failure
RestartSec=1s

[Install]
WantedBy=graphical-session.target
SERVICEEOF
    fi
  fi
fi

# 4. Enable the service for the installing user
if [ -n "$REAL_USER" ]; then
  REAL_UID=$(id -u "$REAL_USER" 2>/dev/null || echo "")
  if [ -n "$REAL_UID" ]; then
    # systemctl --user requires XDG_RUNTIME_DIR
    export XDG_RUNTIME_DIR="/run/user/$REAL_UID"
    if [ -d "$XDG_RUNTIME_DIR" ]; then
      # Determine the correct service name
      SERVICE_NAME=""
      if [ -f "/usr/lib/systemd/user/ydotoold.service" ]; then
        SERVICE_NAME="ydotoold"
      elif [ -f "/usr/lib/systemd/user/ydotool.service" ]; then
        SERVICE_NAME="ydotool"
      fi
      if [ -n "$SERVICE_NAME" ]; then
        su - "$REAL_USER" -c "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user daemon-reload" 2>/dev/null || true
        su - "$REAL_USER" -c "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR systemctl --user enable $SERVICE_NAME" 2>/dev/null || true
      fi
    fi
  fi
fi

exit 0
