// Every realtime meeting provider was a cloud one (OpenAI Realtime, AssemblyAI,
// Deepgram, Corti, Tinfoil) and went with cloud transcription. Meetings now
// transcribe locally: audio is chunked and handed to the same local engine
// dictation uses, so there is no streaming client to select.
const STREAMING_CLIENT_BY_PROVIDER = {};

const ALLOWED_MEETING_PROVIDERS = new Set(["local"]);

const getMeetingStreamingClient = (provider) => {
  throw new Error(`Unsupported meeting streaming provider: ${provider}`);
};

const getMeetingConnectionKey = (options = {}) =>
  JSON.stringify({
    provider: options.provider,
    model: options.model,
    language: options.language,
    mode: options.mode,
  });

module.exports = {
  STREAMING_CLIENT_BY_PROVIDER,
  ALLOWED_MEETING_PROVIDERS,
  getMeetingStreamingClient,
  getMeetingConnectionKey,
};
