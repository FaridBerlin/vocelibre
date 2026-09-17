import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Renderer-side AI SDK factory. Cloud providers were removed, so the only
// targets left are a downloaded local model served by llama-server and a
// self-hosted OpenAI-compatible endpoint — both plain Chat Completions.

// OpenRouter's reasoning control is a top-level request field the AI SDK
// can't emit — inject it at the fetch boundary.
const withDisabledReasoning: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.reasoning = { enabled: false };
      init = { ...init, body: JSON.stringify(body) };
    } catch {}
  }
  return fetch(input, init);
};

export async function getAIModel(
  provider: string,
  model: string,
  apiKey: string,
  baseURL?: string,
  opts?: { disableThinking?: boolean }
): Promise<LanguageModel> {
  switch (provider) {
    case "custom":
      // Self-hosted OpenAI-compatible servers implement Chat Completions, not
      // the OpenAI Responses API.
      return createOpenAI({ apiKey, baseURL }).chat(model);
    case "local":
      return createOpenAI({ apiKey: apiKey || "no-key", baseURL }).chat(model);
    default:
      throw new Error(`Unsupported AI SDK provider for renderer: ${provider}`);
  }
}
