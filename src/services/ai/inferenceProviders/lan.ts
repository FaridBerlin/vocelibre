import type { InferenceProvider } from "./types";
import { buildApiUrl } from "../../../config/constants";
import { getSettings } from "../../../stores/settingsStore";
import logger from "../../../utils/logger";
import {
  canBorrowCleanupCustomKey,
  resolveConfiguredOpenAIBase,
  resolveSelfHostedOpenAIBase,
} from "../openaiBase";

// Serves both self-hosted shapes, which differ only in where the endpoint is
// stored: `lanUrl`/`cleanupRemoteUrl` for the "self-hosted" mode, and
// `baseUrl`/`cleanupCloudBaseUrl` for a scope still tagged "custom". Both are
// an OpenAI-compatible server the user runs, reached over Chat Completions.
export const lanProvider: InferenceProvider = {
  id: "lan",
  async call({ text, model, agentName, config, ctx }) {
    const settings = getSettings();
    // An endpoint passed on the call belongs to that scope and must win over
    // the ambient cleanup settings — otherwise a scope-specific request would
    // be sent to the cleanup endpoint along with the cleanup key.
    const explicitLan = (config.lanUrl || "").trim();
    const explicitCustom = (config.baseUrl || "").trim();
    // With no explicit endpoint this is dictation cleanup's own call, so read
    // the field its mode actually stores: cleanupRemoteUrl for self-hosted,
    // cleanupCloudBaseUrl for a scope still tagged "custom". Reading both would
    // let a stale value from the other mode take over.
    const ambientLan = settings.cleanupMode === "self-hosted" ? settings.cleanupRemoteUrl : "";
    const ambientCustom =
      settings.cleanupMode === "self-hosted" ? "" : settings.cleanupCloudBaseUrl;
    const hasExplicitEndpoint = !!(explicitLan || explicitCustom);
    const lanUrl = explicitLan || (hasExplicitEndpoint ? "" : (ambientLan || "").trim());
    const customUrl = explicitCustom || (hasExplicitEndpoint ? "" : (ambientCustom || "").trim());
    logger.logReasoning("LAN_START", { url: lanUrl || customUrl, agentName, model });

    try {
      // A custom-tagged endpoint goes through the stricter validator, which
      // refuses known cloud hosts so a leftover key can't reach one. Anything
      // else — including a self-hosted scope with no URL saved — goes through
      // the self-hosted validator, which rejects an empty or insecure endpoint
      // rather than inferring a cloud one.
      const baseUrl = customUrl
        ? resolveConfiguredOpenAIBase("custom", customUrl)
        : resolveSelfHostedOpenAIBase(lanUrl);
      const endpoint = buildApiUrl(baseUrl, "/chat/completions");
      // The shared cleanup key only rides to the cleanup endpoint itself;
      // another scope's endpoint must bring its own credential.
      const apiKey =
        config.customApiKey?.trim() ||
        (canBorrowCleanupCustomKey(baseUrl) ? settings.cleanupCustomApiKey?.trim() : "") ||
        "";
      const resolvedModel = model?.trim() || "default";
      return await ctx.callChatCompletionsApi(
        endpoint,
        apiKey,
        resolvedModel,
        text,
        agentName,
        config,
        "LAN"
      );
    } catch (error) {
      logger.logReasoning("LAN_ERROR", {
        url: lanUrl,
        error: (error as Error).message,
        errorType: (error as Error).name,
      });
      throw error;
    }
  },
};
