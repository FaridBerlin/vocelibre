import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AudioLines, Check, CircleCheck, Download, MousePointer2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ProviderIcon } from "../ui/ProviderIcon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useModelDownload } from "../../hooks/useModelDownload";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  getTranscriptionProviders,
  getParakeetModels,
  isCohereTranscribeModel,
  getWhisperModels,
  modelRegistry,
  type CloudProviderData,
  type TranscriptionProviderData,
} from "../../models/ModelRegistry";
import { pickDefaultModelId } from "../../models/providerDefaultModel";
import type { OnboardingStepId } from "./flow";
import { forgetPendingLocalModel, rememberPendingLocalModel } from "./pendingLocalModels";
import { isLocalStageDownloadActive } from "./localDownloadState";

export function SetupStageStepper({ stepId }: { stepId: OnboardingStepId }) {
  const { t } = useTranslation();
  const assistant = stepId.endsWith("assistant");
  const local = stepId.startsWith("local");
  return (
    <div
      className="relative mx-auto flex w-36 items-start justify-between"
      aria-label={t("onboarding.rehaul.provider.progress")}
    >
      <span className="absolute left-8 right-8 top-3.5 border-t border-dashed border-[var(--onboarding-control-border)]" />
      <div className="relative z-10 flex w-14 flex-col items-center gap-1.5 text-[var(--onboarding-text-secondary)]">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${
            assistant
              ? "bg-[var(--onboarding-accent)] text-[var(--onboarding-accent-foreground)]"
              : "bg-[var(--onboarding-inverse-surface)] text-[var(--onboarding-inverse-text)]"
          }`}
        >
          {assistant ? (
            local ? (
              <AudioLines className="size-3.5" />
            ) : (
              <CircleCheck className="size-3.5" strokeWidth={2} />
            )
          ) : (
            <AudioLines className="size-3.5" />
          )}
        </span>
        <span className="text-[0.6875rem]">{t("onboarding.rehaul.provider.dictation")}</span>
      </div>
      <div className="relative z-10 flex w-14 flex-col items-center gap-1.5 text-[var(--onboarding-text-secondary)]">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${
            assistant
              ? "bg-[var(--onboarding-inverse-surface)] text-[var(--onboarding-inverse-text)]"
              : "border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] text-[var(--onboarding-text-primary)]"
          }`}
        >
          <MousePointer2 className="size-3.5" />
        </span>
        <span className="text-[0.6875rem]">
          {local && assistant
            ? t("onboarding.rehaul.local.agent")
            : t("onboarding.rehaul.provider.assistant")}
        </span>
      </div>
    </div>
  );
}

/**
 * The card actions run on the same two pills as the shell footer (Figma
 * "Frame 25" and "Frame 32"): 40 tall, radius 38, Inter Medium 14/140%, the
 * primary on the onboarding accent and the secondary stroke-only on
 * light/surface-stroke. Before this, each card carried its own hand-rolled
 * 32px-tall button — some on blue-500, some on neutral-950, all at regular
 * weight — so the step's own call to action read quieter than the Continue
 * button sitting right under it.
 */
function StepPrimaryAction({
  onClick,
  disabled = false,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 rounded-[38px] border-0 bg-[var(--onboarding-accent)] px-5 text-sm font-medium leading-[1.4] text-[var(--onboarding-accent-foreground)] shadow-none! hover:bg-[var(--onboarding-accent-hover)] hover:shadow-none! disabled:bg-[var(--onboarding-surface-tertiary)] disabled:text-[var(--onboarding-text-secondary)] disabled:opacity-100! ${className}`}
    >
      {children}
    </Button>
  );
}

function StepSecondaryAction({
  onClick,
  className = "",
  children,
}: {
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline-flat"
      onClick={onClick}
      className={`h-9 rounded-[38px]! border! border-[var(--onboarding-control-border)]! bg-transparent! px-5 text-sm font-medium leading-[1.4] text-[var(--onboarding-text-primary)] shadow-none! hover:bg-[var(--onboarding-surface-hover)]! ${className}`}
    >
      {children}
    </Button>
  );
}

/** The card each setup mode's step renders into. Top margin is per call site. */
export const SETUP_CARD_CLASS =
  "mx-auto w-full max-w-[22rem] rounded-[1.125rem] border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-3 py-4 text-[var(--onboarding-text-primary)]";

/** The field trigger. Call sites that can be disabled add the disabled: variants. */
const SELECT_TRIGGER_CLASS =
  "h-9 rounded-xl border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface-secondary)] px-3 text-xs text-[var(--onboarding-text-primary)]";

/**
 * The dropdown sheet, Figma "Onboarding / Frame 16": radius 17 on
 * light/surface-stroke, 12 pad, `0 3 7.3 #0000001F` shadow. Radix's viewport
 * carries its own 4px pad, which would stack with the panel's — zero it and let
 * the panel own the inset, so the rows run edge to edge inside it and the
 * scrollbar (styled in index.css) sits in the panel's gutter.
 *
 * The 12 of inset is split 6 here and 6 on the row, the same way
 * .onboarding-list-scroll splits its 4 with .onboarding-list-row: labels still
 * land 12 from the panel edge, and the 6 is the breathing room the row's hover
 * slab needs so it reads as a slab and not as a full-bleed band. Vertical drops
 * to 8 because the rows keep their own 12 at the ends now (see below).
 *
 * Every colour here is an --onboarding-* token rather than a literal, which is
 * what lets the panel follow the theme from out here: it portals to document.body,
 * outside .onboarding-canvas, and the token block in index.css is scoped to
 * `body:has(.onboarding-canvas)` for exactly this case. It used to carry `dark:`
 * copies of the light values instead, to pin the sheet light while onboarding was
 * light-only.
 */
const SELECT_PANEL_CLASS =
  "onboarding-select-panel rounded-[17px] border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-1.5 py-2 text-[var(--onboarding-text-primary)] shadow-[0_3px_7.3px_0_rgba(0,0,0,0.12)] [&_[data-radix-select-viewport]]:p-0";

/**
 * A row from the same frame: 12 of vertical padding, 20px mark at gap 10, label
 * Inter Medium 16/140%.
 *
 * The dividers and the rounded hover slab live in `.onboarding-select-item`
 * (index.css) so they can behave the way .onboarding-list-row's do — hairlines
 * separate rows rather than bounding them, and a hovered row's slab swallows its
 * own rule and the next one's. Unlike the old `first:pt-0 last:pb-0`, the end rows
 * keep their padding: dropping it would leave the first and last slab shorter than
 * every other one. The panel's vertical inset absorbs that instead.
 *
 * The bg-transparent variants neutralise the base SelectItem's theme-bound fills
 * (`hover:bg-muted`, `dark:hover:bg-primary/8`), which resolve against the app
 * theme out here and would paint a square band behind the slab.
 */
const SELECT_ITEM_CLASS =
  "onboarding-select-item gap-2.5 rounded-none py-2.5 pl-1.5 pr-8 text-sm font-normal leading-[1.4] hover:bg-transparent focus:bg-transparent data-highlighted:bg-transparent dark:hover:bg-transparent dark:focus:bg-transparent dark:data-highlighted:bg-transparent [&>span:nth-child(2)]:w-full";

function providerCredential(provider: string, store: ReturnType<typeof useSettingsStore.getState>) {
  switch (provider) {
    case "openai":
      return { value: store.openaiApiKey, set: store.setOpenaiApiKey };
    case "anthropic":
      return { value: store.anthropicApiKey, set: store.setAnthropicApiKey };
    case "gemini":
      return { value: store.geminiApiKey, set: store.setGeminiApiKey };
    case "groq":
      return { value: store.groqApiKey, set: store.setGroqApiKey };
    case "xai":
      return { value: store.xaiApiKey, set: store.setXaiApiKey };
    case "mistral":
      return { value: store.mistralApiKey, set: store.setMistralApiKey };
    case "openrouter":
      return { value: store.openrouterApiKey, set: store.setOpenrouterApiKey };
    case "tinfoil":
      return { value: store.tinfoilApiKey, set: store.setTinfoilApiKey };
    case "corti":
      return { value: store.cortiApiKey, set: store.setCortiApiKey };
    default:
      return { value: "", set: (_value: string) => undefined };
  }
}

type HostedProvider = CloudProviderData | TranscriptionProviderData;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-xs text-[var(--onboarding-text-tertiary)]">{children}</span>
  );
}

export function LocalModelSetupStep({
  stepId,
  onReadinessChange,
  onProceed,
  onSkip,
}: {
  stepId: "local-dictation" | "local-assistant";
  onReadinessChange: (ready: boolean) => void;
  onProceed: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const store = useSettingsStore();
  const assistant = stepId === "local-assistant";
  const [selectedProvider, setSelectedProvider] = useState(assistant ? "qwen" : "whisper");
  const [selectedModel, setSelectedModel] = useState("");
  const [downloadedWhisper, setDownloadedWhisper] = useState<Set<string>>(new Set());
  const [downloadedParakeet, setDownloadedParakeet] = useState<Set<string>>(new Set());
  const [downloadedLlm, setDownloadedLlm] = useState<Set<string>>(new Set());

  const refreshDownloadedModels = useCallback(async () => {
    const [whisper, parakeet, llm] = await Promise.all([
      window.electronAPI?.listWhisperModels?.().catch(() => undefined),
      window.electronAPI?.listParakeetModels?.().catch(() => undefined),
      window.electronAPI?.modelGetAll?.().catch(() => undefined),
    ]);
    setDownloadedWhisper(
      new Set(
        (whisper?.models ?? []).filter((model) => model.downloaded).map((model) => model.model)
      )
    );
    setDownloadedParakeet(
      new Set(
        (parakeet?.models ?? []).filter((model) => model.downloaded).map((model) => model.model)
      )
    );
    setDownloadedLlm(
      new Set((llm ?? []).filter((model) => model.isDownloaded).map((model) => model.id))
    );
  }, []);

  const whisperDownload = useModelDownload({
    modelType: "whisper",
    onDownloadComplete: refreshDownloadedModels,
  });
  const parakeetDownload = useModelDownload({
    modelType: "parakeet",
    onDownloadComplete: refreshDownloadedModels,
  });
  const llmDownload = useModelDownload({
    modelType: "llm",
    onDownloadComplete: refreshDownloadedModels,
  });

  useEffect(() => {
    void refreshDownloadedModels();
  }, [refreshDownloadedModels]);

  useEffect(() => {
    const saved = useSettingsStore.getState();
    const defaultProvider = assistant
      ? modelRegistry.getProvider(saved.chatAgentProvider)
        ? saved.chatAgentProvider
        : "qwen"
      : saved.localTranscriptionProvider === "nvidia"
        ? "nvidia"
        : "whisper";
    setSelectedProvider(defaultProvider);
    setSelectedModel("");
    onReadinessChange(false);
  }, [assistant, onReadinessChange, stepId]);

  const providerOptions = useMemo(() => {
    if (assistant) {
      return modelRegistry.getAllProviders().map((provider) => ({
        id: provider.id,
        name: provider.name,
        icon: provider.id,
      }));
    }
    return [
      { id: "whisper", name: "OpenAI", icon: "openai" },
      { id: "nvidia", name: "NVIDIA", icon: "nvidia" },
    ];
  }, [assistant]);

  const models = useMemo(() => {
    if (assistant) {
      return (modelRegistry.getProvider(selectedProvider)?.models ?? []).map((model) => ({
        id: model.id,
        name: model.name,
        size: model.size,
        recommended: model.recommended,
        icon: selectedProvider,
      }));
    }
    if (selectedProvider === "nvidia") {
      // Onboarding offers only the whisper/NVIDIA providers; Cohere models
      // would otherwise commit provider "nvidia" with a Cohere model id.
      return Object.entries(getParakeetModels())
        .filter(([id]) => !isCohereTranscribeModel(id))
        .map(([id, model]) => ({
          id,
          name: model.name,
          size: model.size.replace(/(?<=\d)(?=[A-Za-z])/, " "),
          recommended: model.recommended,
          icon: "nvidia",
        }));
    }
    return Object.entries(getWhisperModels()).map(([id, model]) => ({
      id,
      name: model.name,
      size: model.size.replace(/(?<=\d)(?=[A-Za-z])/, " "),
      recommended: model.recommended,
      icon: "openai",
    }));
  }, [assistant, selectedProvider]);

  const currentProvider = providerOptions.find((provider) => provider.id === selectedProvider);
  const activeDownload = assistant
    ? llmDownload
    : selectedProvider === "nvidia"
      ? parakeetDownload
      : whisperDownload;
  const downloadedModels = assistant
    ? downloadedLlm
    : selectedProvider === "nvidia"
      ? downloadedParakeet
      : downloadedWhisper;
  const selectedReady = Boolean(selectedModel && downloadedModels.has(selectedModel));

  useEffect(() => {
    onReadinessChange(selectedReady);
  }, [onReadinessChange, selectedReady]);

  const selectInstalledModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      if (assistant) {
        store.setChatAgentMode("local");
        store.setChatAgentProvider(selectedProvider);
        store.setChatAgentModel(modelId);
      } else if (selectedProvider === "nvidia") {
        store.setLocalTranscriptionProvider("nvidia");
        store.setParakeetModel(modelId);
      } else {
        store.setLocalTranscriptionProvider("whisper");
        store.setWhisperModel(modelId);
      }
      if (localStorage.getItem("localSetupPending") !== "true") {
        forgetPendingLocalModel(assistant ? "assistant" : "dictation", modelId);
      }
    },
    [assistant, selectedProvider, store]
  );

  const downloadModel = (modelId: string) => {
    // downloadModel refuses (toast only) while another download of this kind
    // runs; recording the pending selection for a refused download leaves a
    // stale entry that a much later download would silently activate.
    if (!activeDownload.isDownloading) {
      rememberPendingLocalModel(assistant ? "assistant" : "dictation", {
        provider: selectedProvider,
        modelId,
      });
    }
    void activeDownload.downloadModel(modelId, selectInstalledModel);
  };

  const chooseProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setSelectedModel("");
    onReadinessChange(false);
  };

  const anyDownloadActive = isLocalStageDownloadActive(assistant ? "assistant" : "dictation", {
    whisper: whisperDownload.isDownloading,
    parakeet: parakeetDownload.isDownloading,
    llm: llmDownload.isDownloading,
  });
  // A running download is enough to move on: it lives in the main process, the
  // model is already remembered as pending (downloadModel above), and
  // BackgroundModelDownloadTray keeps the progress on screen and applies the
  // selection when it lands. Waiting for 100% would pin the user to this step
  // for a multi-gigabyte download.
  const canProceed = selectedReady || anyDownloadActive;

  const proceed = () => {
    // Leaving mid-download is the same situation as "download in background":
    // this step unmounts, so the tray is what finishes the job, and it only
    // applies the pending selection while localSetupPending is set.
    if (anyDownloadActive && !selectedReady) {
      localStorage.setItem("localSetupPending", "true");
    }
    onProceed();
  };

  return (
    <section className={`mt-5 ${SETUP_CARD_CLASS}`}>
      <SetupStageStepper stepId={stepId} />

      <div className="mt-5">
        <FieldLabel>{t("onboarding.rehaul.local.providerLabel")}</FieldLabel>
        <Select value={selectedProvider} onValueChange={chooseProvider}>
          <SelectTrigger className={SELECT_TRIGGER_CLASS}>
            <div className="flex items-center gap-2">
              <ProviderIcon
                provider={currentProvider?.icon ?? selectedProvider}
                className="size-4"
                monochrome={assistant && selectedProvider === "qwen"}
              />
              {currentProvider?.name ?? selectedProvider}
            </div>
          </SelectTrigger>
          <SelectContent className={`max-h-[14.625rem] ${SELECT_PANEL_CLASS}`}>
            {providerOptions.map((provider) => (
              <SelectItem key={provider.id} value={provider.id} className={SELECT_ITEM_CLASS}>
                <span className="flex items-center gap-2.5">
                  <ProviderIcon
                    provider={provider.icon}
                    className="size-5"
                    monochrome={assistant && provider.id === "qwen"}
                  />
                  {provider.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* h, not max-h: a fixed 16rem keeps the card the same height for every
          provider. Hugging the rows instead makes the card — and the Proceed
          button under it — jump as you move through the provider dropdown, since
          providers carry anywhere from one model to five. The empty grey under a
          short list is the accepted cost of that stability. Rows are min-h-16, so
          16rem shows four and the rest scrolls. */}
      {/* onboarding-scroll-hidden, not the 5px thin thumb: a classic scrollbar
          reserves layout width, so rows in an overflowing list stopped short of
          the edge while a short provider's list filled it, and the two read as
          different widths. The partially visible row at the bottom edge is the
          overflow affordance instead. */}
      <div className="onboarding-scroll-hidden mt-3 h-56 overflow-y-auto rounded-2xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface-secondary)] px-3">
        {models.map((model) => {
          const isDownloaded = downloadedModels.has(model.id);
          const isDownloading = activeDownload.isDownloadingModel(model.id);
          const isSelected = selectedModel === model.id && isDownloaded;
          const percentage = Math.round(activeDownload.downloadProgress.percentage);
          return (
            <div
              key={model.id}
              className="flex min-h-14 items-center gap-3 border-b border-[var(--onboarding-control-border)] px-1 py-2 last:border-b-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)]">
                <ProviderIcon
                  provider={model.icon}
                  className="size-5"
                  monochrome={assistant && model.icon === "qwen"}
                />
              </span>
              <button
                type="button"
                disabled={!isDownloaded}
                onClick={() => selectInstalledModel(model.id)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span className="block truncate text-sm font-medium text-[var(--onboarding-text-primary)]">
                  {model.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--onboarding-text-secondary)]">
                  {model.size}
                  {!assistant && model.recommended && ` - ${t("common.recommended")}`}
                </span>
              </button>

              {isDownloading ? (
                // Figma "Frame 25": white pill, #E3E3E3 stroke, radius 38, 6/12
                // padding, gap 8, both labels Inter Medium 14/140% in
                // text-secondary. Progress is a light/surface-tertiary fill
                // growing from the left behind them, not a fixed-width segment
                // around the percentage.
                <span className="relative -mr-2 flex shrink-0 items-center gap-2 overflow-hidden rounded-[38px] border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface)] px-3 py-1.5 text-sm font-medium leading-[1.4] text-[var(--onboarding-text-secondary)]">
                  {/* Figma draws the rect taller than the pill so it bleeds top
                      and bottom; inset-y-0 does that without a magic height. */}
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--onboarding-surface-tertiary)] transition-[width] duration-300 ease-out"
                    style={{ width: `${percentage}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative">{percentage}%</span>
                  <span className="relative whitespace-nowrap">
                    {activeDownload.isInstalling
                      ? t("onboarding.rehaul.local.installing")
                      : t("onboarding.rehaul.local.downloadingShort")}
                  </span>
                </span>
              ) : isSelected ? (
                // Same token as the Use pill it replaces on click — on blue-500 it
                // was a visibly different blue sitting in the same slot.
                <span className="-mr-2 flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--onboarding-accent)] px-3 text-xs text-[var(--onboarding-accent-foreground)]">
                  <Check className="size-3.5" />
                  {t("onboarding.rehaul.local.selected")}
                </span>
              ) : isDownloaded ? (
                // On the accent rather than neutral-950: this is the row's
                // affirmative action, so it carries the brand the way every other
                // primary in onboarding does, and Download stays neutral below it.
                <Button
                  type="button"
                  onClick={() => selectInstalledModel(model.id)}
                  className="-mr-2 h-7 gap-1.5 rounded-full border-0! bg-[var(--onboarding-accent)] px-2.5 text-xs font-normal text-[var(--onboarding-accent-foreground)] shadow-none! hover:bg-[var(--onboarding-accent-hover)] hover:shadow-none!"
                >
                  {t("onboarding.rehaul.local.use")}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => downloadModel(model.id)}
                  className="-mr-2 h-7 gap-1.5 rounded-full border-[var(--onboarding-inverse-surface)]! bg-[var(--onboarding-inverse-surface)] px-2.5 text-xs font-normal text-[var(--onboarding-inverse-text)] shadow-none! hover:shadow-none! hover:bg-[var(--onboarding-inverse-surface-secondary)] disabled:bg-[var(--onboarding-surface-tertiary-hover)] disabled:opacity-100"
                >
                  <Download className="size-3.5" />
                  {t("onboarding.rehaul.local.download")}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className={`mt-4 grid gap-2 ${anyDownloadActive ? "grid-cols-2" : "grid-cols-1"}`}>
        {anyDownloadActive && (
          <StepSecondaryAction onClick={onSkip}>{t("common.skip")}</StepSecondaryAction>
        )}
        <StepPrimaryAction onClick={proceed} disabled={!canProceed}>
          {t("onboarding.rehaul.provider.proceed")}
        </StepPrimaryAction>
      </div>
    </section>
  );
}
