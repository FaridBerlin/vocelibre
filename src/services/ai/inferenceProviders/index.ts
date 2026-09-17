import type { InferenceProvider } from "./types";
import { localProvider } from "./local";
import { lanProvider } from "./lan";

// Cloud and BYOK providers were removed. What remains runs on the user's own
// hardware: a downloaded GGUF model through llama-server, or an OpenAI-compatible
// endpoint they host themselves.
export const PROVIDER_REGISTRY: Readonly<Record<string, InferenceProvider>> = Object.freeze({
  local: localProvider,
  lan: lanProvider,
});

export type { InferenceProvider, ProviderContext, ProviderCallParams } from "./types";
