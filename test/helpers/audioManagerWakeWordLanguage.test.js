const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

async function loadAudioManager(t) {
  const { window } = installBrowserGlobals(t, {
    initialStorage: { agentName: "Jarvis" },
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: window.localStorage,
    writable: true,
    configurable: true,
  });
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    value: { ...originalNavigator, onLine: true },
    configurable: true,
  });
  t.after(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
    delete globalThis.__wakeWordSettings;
  });

  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-wake-language-test-",
    mockModules: {
      "/utils/logger":
        "export default { debug() {}, info() {}, warn() {}, error() {}, logReasoning() {} };",
      "/stores/settingsStore": `
        export const getSettings = () => globalThis.__wakeWordSettings;
        export const getEffectiveCleanupModel = () => "cleanup-model";
        export const isCloudCleanupMode = () => false;
        export const isCloudDictationAgentMode = () => false;
        export const isCloudTranslationMode = () => false;
        export const selectResolvedLLMConfig = () => ({ model: "cleanup-model" });
      `,
      "/dictationAgentInference": `
        export const resolveDictationAgentInference = () => ({
          reachable: true,
          model: "agent-model",
          displayProvider: "test",
          config: { provider: "test" },
        });
        export const resolveDictationAgentVisionInference = () => ({
          active: false,
          model: "",
          config: {},
        });
      `,
      "/dictationTranslationInference": `
        export const resolveDictationTranslationInference = () => ({
          reachable: false,
          model: "",
          displayProvider: "none",
          config: {},
        });
      `,
      "/config/prompts": `
        export const resolvePrompt = () => "agent prompt";
        export const appendScreenContextSuffix = (prompt) => prompt;
      `,
      "/services/ReasoningService": "export default class ReasoningService {};",
      "/utils/permissions": "export const isAccessibilitySkipped = () => false;",
    },
  });

  const AudioManager = (await vite.ssrLoadModule("/helpers/audioManager.js")).default;
  return {
    window,
    setSettings: (settings) => {
      globalThis.__wakeWordSettings = settings;
    },
    createManager: () =>
      Object.assign(Object.create(AudioManager.prototype), {
        voiceAgentRequested: false,
        translationRequested: false,
        isDictionaryEcho: () => false,
        getWhisperPrompt: () => null,
        assertAgentAllowedByPolicy: () => {},
        processAgentCommand: async () => "agent output",
        processWithReasoningModel: async () => "cleanup output",
        finalizeChineseScript: async (text) => text,
      }),
  };
}

test("local analytics save uses the propagated occurrence time", async (t) => {
  const { window, setSettings, createManager } = await loadAudioManager(t);
  const analyticsOccurredAt = "2026-09-02T14:00:00.000Z";
  let recordedEvent;

  setSettings({
    dataRetentionEnabled: true,
    audioRetentionDays: 0,
    customDictionary: [],
    snippets: [],
  });
  window.electronAPI.recordAnalyticsEvent = async (event) => {
    recordedEvent = event;
  };
  window.electronAPI.saveTranscription = async () => ({});

  await createManager().saveTranscription("same event", "same event", {
    clientTranscriptionId: "event-1",
    analyticsOccurredAt,
  });

  assert.equal(recordedEvent.occurredAt, analyticsOccurredAt);
});
