const test = require("node:test");
const assert = require("node:assert/strict");
const { loadAudioManager } = require("./harness/audioManager");

async function loadManager(t) {
  const { createManager } = await loadAudioManager(t, {
    cachePrefix: "openwhispr-streaming-routing-test-",
    settingsKey: "__streamingRoutingSettings",
  });
  return createManager();
}

function setSettings(overrides = {}) {
  globalThis.__streamingRoutingSettings = {
    useLocalWhisper: false,
    transcriptionMode: "providers",
    remoteTranscriptionUrl: "",
    cloudTranscriptionMode: "byok",
    cloudTranscriptionProvider: "openai",
    cloudTranscriptionModel: "gpt-4o-mini-transcribe",
    openaiApiKey: "sk-test",
    isSignedIn: true,
    ...overrides,
  };
}

test("managed OpenWhispr Cloud still respects its batch configuration", async (t) => {
  const manager = await loadManager(t);
  manager.sttConfig = { dictation: { mode: "batch" } };
  setSettings({
    transcriptionMode: "openwhispr",
    cloudTranscriptionMode: "openwhispr",
  });

  assert.equal(manager.shouldUseStreaming(), false);
});
