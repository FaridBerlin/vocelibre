// Single source of truth for the per-scope self-hosted endpoint API keys.
// environment.js, ipcHandlers.js and the settings store all derive their
// per-key plumbing from this list, so adding one is a single entry.
// CommonJS + pure data so both the main process and the Vite renderer share it.
// `base` yields the IPC channels `get-<base>-key` / `save-<base>-key`.
// preload.js can't require local modules under sandbox, so it mirrors the
// {base, get, save} tuples inline — keep BYOK_KEY_BRIDGES there in sync
// (guarded by test/helpers/secretKeys.test.js).
//
// The cloud provider keys (OpenAI, Anthropic, Gemini, Groq, xAI, Mistral,
// OpenRouter, Tinfoil, Corti) were removed with cloud inference. What remains
// authenticates an OpenAI-compatible endpoint the user hosts themselves, which
// still needs a credential even though nothing leaves their network.
const BYOK_API_KEYS = [
  {
    base: "note-formatting-custom",
    env: "NOTE_FORMATTING_CUSTOM_API_KEY",
    get: "getNoteFormattingCustomKey",
    save: "saveNoteFormattingCustomKey",
    storeKey: "noteFormattingCustomApiKey",
  },
  {
    base: "translation-custom",
    env: "TRANSLATION_CUSTOM_API_KEY",
    get: "getTranslationCustomKey",
    save: "saveTranslationCustomKey",
    storeKey: "translationCustomApiKey",
  },
  {
    base: "dictation-agent-custom",
    env: "DICTATION_AGENT_CUSTOM_API_KEY",
    get: "getDictationAgentCustomKey",
    save: "saveDictationAgentCustomKey",
    storeKey: "dictationAgentCustomApiKey",
  },
  {
    base: "dictation-agent-vision-custom",
    env: "DICTATION_AGENT_VISION_CUSTOM_API_KEY",
    get: "getDictationAgentVisionCustomKey",
    save: "saveDictationAgentVisionCustomKey",
    storeKey: "dictationAgentVisionCustomApiKey",
  },
  {
    base: "chat-agent-custom",
    env: "CHAT_AGENT_CUSTOM_API_KEY",
    get: "getChatAgentCustomKey",
    save: "saveChatAgentCustomKey",
    storeKey: "chatAgentCustomApiKey",
  },
];

module.exports = { BYOK_API_KEYS };
