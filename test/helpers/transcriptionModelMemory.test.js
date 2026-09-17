const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

test("explicit model click commits the clicked model, not the remembered one", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: {
      _providerSettingsMigrated: "1",
      uploadTranscriptionMigrated: "true",
      cloudTranscriptionProvider: "openai",
      cloudTranscriptionModel: "gpt-4o-transcribe",
      cloudTranscriptionBaseUrl: "https://stt.parasail.example.com/v1",
      transcriptionModelByProvider: JSON.stringify({
        "dictation:groq": "whisper-large-v3",
      }),
    },
  });
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-model-click-commit-test-",
  });
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  const state = () => useSettingsStore.getState();

  state().switchCloudTranscriptionProvider("dictation", "groq");
  state().setCloudTranscriptionModel("whisper-large-v3-turbo");

  assert.equal(state().cloudTranscriptionProvider, "groq");
  assert.equal(
    state().cloudTranscriptionModel,
    "whisper-large-v3-turbo",
    "the clicked model must win over the remembered/default one"
  );
  assert.equal(
    state().transcriptionModelByProvider["dictation:openai"],
    "gpt-4o-transcribe",
    "the outgoing provider's model is remembered"
  );
  assert.equal(
    state().cloudTranscriptionBaseUrl,
    "https://stt.parasail.example.com/v1",
    "the custom URL slot must never be touched by the commit sequence (#1459/#1463)"
  );
});

test("corrupt persisted model memory hydrates as empty, not a crash", async (t) => {
  installBrowserGlobals(t, {
    initialStorage: {
      _providerSettingsMigrated: "1",
      uploadTranscriptionMigrated: "true",
      transcriptionModelByProvider: "{not json",
    },
  });
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-model-memory-corrupt-test-",
  });
  const { useSettingsStore } = await vite.ssrLoadModule("/stores/settingsStore.ts");
  assert.deepEqual(useSettingsStore.getState().transcriptionModelByProvider, {});
});
