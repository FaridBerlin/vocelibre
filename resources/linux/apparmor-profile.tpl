abi <abi/4.0>,
include <tunables/global>

# Grants user namespaces to VoceLibre so Chromium's sandbox works on Ubuntu 24.04+
# (kernel.apparmor_restrict_unprivileged_userns=1).
#
# electron-builder's stock profile attaches only to /opt/<product>/<executable>,
# but scripts/afterPack.js turns that path into a bash wrapper and moves Electron
# to <executable>-app. Both are attached: the wrapper probes `unshare --user`
# to decide whether to pass --no-sandbox, and the binary it execs inherits
# this profile.
profile "${executable}" "/opt/${sanitizedProductName}/${executable}{,-app}" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/${executable}>
}
