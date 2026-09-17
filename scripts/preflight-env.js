#!/usr/bin/env node
/**
 * Preflight checks for `npm run dev` / `npm start`.
 *
 * Catches the two ways a shell environment silently breaks a dev launch:
 *
 * 1. ELECTRON_RUN_AS_NODE — when set, the Electron binary runs as plain Node
 *    and never opens a window, so the app "does nothing". Editors that are
 *    themselves Electron apps (VS Code, Cursor) export it to their child
 *    processes. VS Code strips it from its own integrated terminal, but a
 *    terminal emulator it spawned keeps it, and on Linux gnome-terminal runs
 *    one shared server process, so every later window inherits it too.
 *    run-electron.js unsets it before spawning; this only reports it.
 *
 * 2. Chromium's Linux sandbox — Electron needs either an unprivileged user
 *    namespace or a root-owned setuid chrome-sandbox helper. Ubuntu 24.04 sets
 *    kernel.apparmor_restrict_unprivileged_userns=1, which denies namespaces to
 *    *unconfined* processes. A terminal spawned by VS Code inherits VS Code's
 *    named AppArmor profile and is exempt, so the app starts there; a plain
 *    gnome-terminal is unconfined, falls back to the setuid helper, and aborts
 *    because npm unpacks chrome-sandbox owned by the current user. The sysctl
 *    reads 1 in both cases, so the capability has to be probed, not read.
 *
 * 3. Node major version drift — a system Node on PATH instead of the version
 *    pinned in .nvmrc. Native modules (better-sqlite3) are built against one
 *    ABI, so the mismatch surfaces much later as an opaque load error.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

function readPinnedMajor() {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, ".nvmrc"), "utf8").trim();
    const major = parseInt(raw.replace(/^v/, ""), 10);
    return Number.isInteger(major) ? major : null;
  } catch {
    return null;
  }
}

const notes = [];

if (process.env.ELECTRON_RUN_AS_NODE) {
  notes.push(
    "ELECTRON_RUN_AS_NODE is set in this shell. Electron launched directly " +
      "(e.g. `npx electron .`) would run as plain Node and never open a window. " +
      "`npm run dev` and `npm start` unset it for the app process, so this is " +
      "informational — but a terminal that has it inherited it from an editor. " +
      "To clear it for new terminals, quit the terminal app fully (on GNOME: " +
      "`pkill -f gnome-terminal-server`) and reopen it from the desktop."
  );
}

function canCreateUserNamespace() {
  // Probe rather than read kernel.apparmor_restrict_unprivileged_userns: the
  // sysctl is set even in contexts that are exempt from it via AppArmor.
  const probe = spawnSync("unshare", ["--user", "--map-root-user", "true"], {
    stdio: "ignore",
    timeout: 5000,
  });
  if (probe.error) return null; // unshare missing — cannot tell, stay quiet
  return probe.status === 0;
}

function sandboxHelperIsSetuidRoot(helperPath) {
  try {
    const info = fs.statSync(helperPath);
    // Chromium requires root ownership plus the setuid bit.
    return info.uid === 0 && (info.mode & 0o4000) !== 0;
  } catch {
    return null; // not unpacked yet
  }
}

if (process.platform === "linux") {
  const helper = path.join(repoRoot, "node_modules", "electron", "dist", "chrome-sandbox");
  const helperOk = sandboxHelperIsSetuidRoot(helper);
  const namespacesOk = canCreateUserNamespace();

  // Only a hard failure when both sandbox routes are closed. Either one alone
  // is fine, which is why this launches from a VS Code terminal regardless.
  if (helperOk === false && namespacesOk === false) {
    console.error(
      "\n[preflight] Electron cannot start: both of its Linux sandbox options are unavailable.\n" +
        "[preflight]   - unprivileged user namespaces are denied to this shell\n" +
        `[preflight]   - ${helper}\n` +
        "[preflight]     is not owned by root with the setuid bit, so the fallback helper is refused.\n" +
        "[preflight] Fix (keeps the sandbox on; re-run after any npm install that reinstalls Electron):\n" +
        "[preflight]   npm run fix:sandbox\n"
    );
    process.exit(1);
  }
}

const pinnedMajor = readPinnedMajor();
const currentMajor = parseInt(process.versions.node.split(".")[0], 10);

if (pinnedMajor !== null && currentMajor !== pinnedMajor) {
  console.error(
    `\n[preflight] Node ${process.versions.node} is on PATH, but this project pins Node ${pinnedMajor} (.nvmrc).\n` +
      `[preflight] Native modules are built against one ABI, so a mismatch breaks the app in confusing ways.\n` +
      `[preflight] node resolves to: ${process.execPath}\n` +
      `[preflight] Fix: run \`nvm use\` in this directory, or \`nvm alias default ${pinnedMajor}\` to make it stick.\n`
  );
  process.exit(1);
}

for (const note of notes) {
  console.warn(`[preflight] ${note}`);
}
