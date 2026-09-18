const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// preload.js exposes a channel; the main process must answer it. Nothing
// enforced that pairing before, so when 169fa408 removed the cloud handlers it
// also took local ones with it — UI language, hotkeys, logging, startup prefs
// and the whole llama.cpp bridge — and the only symptom was "No handler
// registered for X" on stderr at runtime. tsc does not check .js, so the gates
// stayed green. This is the check that would have caught it.

const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const collect = (text, pattern) => new Set([...text.matchAll(pattern)].map((m) => m[1]));

const mainProcessSources = () => {
  const out = [read("main.js")];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === "dist" || entry.name === "node_modules") continue;
        walk(rel);
      } else if (entry.name.endsWith(".js")) {
        out.push(read(rel));
      }
    }
  };
  walk("src");
  return out.join("\n");
};

const preload = read("preload.js");
const main = mainProcessSources();

// Channels registered with a template literal (`get-${k.base}-key`) cannot be
// matched statically; they are enumerated here so the check stays exact rather
// than silently loose.
const TEMPLATE_REGISTERED = new Set(
  ["openai", "anthropic", "gemini", "groq", "voice-agent", "lan", "enterprise"].flatMap((base) => [
    `get-${base}-key`,
    `save-${base}-key`,
  ])
);

test("every channel preload invokes has a main-process handler", () => {
  const invoked = collect(preload, /ipcRenderer\.invoke\(\s*"([^"]+)"/g);
  const handled = collect(main, /ipcMain\.handle\(\s*"([^"]+)"/g);

  const missing = [...invoked].filter((c) => !handled.has(c) && !TEMPLATE_REGISTERED.has(c)).sort();

  assert.deepEqual(
    missing,
    [],
    `preload invokes ${missing.length} channel(s) with no ipcMain.handle:\n  ${missing.join("\n  ")}\n` +
      "Either register the handler or remove the bridge method — an invoke with " +
      "no handler rejects at runtime and the feature silently does nothing."
  );
});

test("every channel preload sends has a main-process listener", () => {
  const sent = collect(preload, /ipcRenderer\.send\(\s*"([^"]+)"/g);
  const onned = collect(main, /ipcMain\.on\(\s*"([^"]+)"/g);
  const handled = collect(main, /ipcMain\.handle\(\s*"([^"]+)"/g);

  const missing = [...sent].filter((c) => !onned.has(c) && !handled.has(c)).sort();

  assert.deepEqual(missing, [], `preload sends with no ipcMain.on:\n  ${missing.join("\n  ")}`);
});
