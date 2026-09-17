const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererServer, installBrowserGlobals } = require("../lib/rendererTestHarness");

// A self-hosted endpoint is the only non-local transcription route left, so
// this is the shape the fail-closed guard has to protect.
function customConfig(url) {
  return {
    useLocalWhisper: false,
    localTranscriptionProvider: "whisper",
    whisperModel: "base",
    parakeetModel: "parakeet-tdt-0.6b-v3",
    isOpenWhisprCloud: false,
    getApiKey: () => "must-not-leak",
    cloudTranscriptionProvider: "custom",
    language: "en",
    transcriptionMode: "self-hosted",
    remoteTranscriptionUrl: url,
    remoteTranscriptionModel: "whisper-1",
  };
}

test("file transcription enforces Custom endpoint security before IPC", async (t) => {
  const { window } = installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-file-custom-endpoint-test-",
    mockModules: {
    },
  });
  const { transcribeFile } = await vite.ssrLoadModule("/services/fileTranscription.ts");

  let ipcCalls = 0;
  window.electronAPI.transcribeAudioFileByok = async () => {
    ipcCalls += 1;
    return { success: true, text: "must not run" };
  };

  for (const baseUrl of [
    "",
    "http://public.example.com/v1",
    "ftp://192.168.1.20/v1",
  ]) {
    const result = await transcribeFile("/tmp/audio.webm", customConfig(baseUrl), false);
    assert.equal(result.success, false, baseUrl);
    assert.ok(result.error, baseUrl);
  }

  assert.equal(ipcCalls, 0, "a misconfigured endpoint must never reach IPC");
  ipcCalls = 0;

  let receivedOptions = null;
  window.electronAPI.transcribeAudioFileByok = async (options) => {
    receivedOptions = options;
    return { success: true, text: "local gateway" };
  };

  const result = await transcribeFile(
    "/tmp/audio.webm",
    customConfig("http://192.168.1.20:5001/v1"),
    false
  );

  assert.equal(result.success, true);
  // Self-hosted carries its endpoint in remoteTranscriptionUrl, not baseUrl.
  assert.equal(receivedOptions.remoteTranscriptionUrl, "http://192.168.1.20:5001/v1");
});

test("self-hosted file transcription bypasses stale Custom endpoint validation", async (t) => {
  const { window } = installBrowserGlobals(t);
  const vite = await createRendererServer(t, {
    cachePrefix: "openwhispr-file-self-hosted-endpoint-test-",
    mockModules: {
    },
  });
  const { transcribeFile } = await vite.ssrLoadModule("/services/fileTranscription.ts");

  let receivedOptions = null;
  window.electronAPI.transcribeAudioFileByok = async (options) => {
    receivedOptions = options;
    return { success: true, text: "self-hosted" };
  };

  const result = await transcribeFile(
    "/tmp/audio.webm",
    {
      ...customConfig(""),
      transcriptionMode: "self-hosted",
      remoteTranscriptionUrl: "http://192.168.1.20:9000/v1",
      remoteTranscriptionModel: "whisper-large-v3",
    },
    false
  );

  assert.equal(result.success, true);
  assert.equal(receivedOptions.transcriptionMode, "self-hosted");
  assert.equal(receivedOptions.remoteTranscriptionUrl, "http://192.168.1.20:9000/v1");
  assert.equal(receivedOptions.remoteTranscriptionModel, "whisper-large-v3");
});
