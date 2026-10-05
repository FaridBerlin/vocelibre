import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import OnboardingShell, { OnboardingStepHeader } from "./onboarding/OnboardingShell";
import CompactPermissionsStep from "./onboarding/CompactPermissionsStep";
import LanguageSelectionStep from "./onboarding/LanguageSelectionStep";
import ShortcutSetupStep from "./onboarding/ShortcutSetupStep";
import DemoStep from "./onboarding/DemoStep";
import { LocalModelSetupStep } from "./onboarding/ProviderSetupStep";
import { AlertDialog } from "./ui/dialog";
import { usePermissions } from "../hooks/usePermissions";
import { useClipboard } from "../hooks/useClipboard";
import { useScreenRecordingPermission } from "../hooks/useScreenRecordingPermission";
import { useSystemAudioPermission } from "../hooks/useSystemAudioPermission";
import { useSettings } from "../hooks/useSettings";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useSettingsStore } from "../stores/settingsStore";
import { getDefaultHotkey, parseHotkeyList, serializeHotkeyList } from "../utils/hotkeys";
import { formatHotkeyInstruction } from "./onboarding/hotkeyPresentation";
import { getValidationMessage } from "../utils/hotkeyValidator";
import { getPlatform } from "../utils/platform";
import { ACCESSIBILITY_SKIPPED_KEY, areRequiredPermissionsMet } from "../utils/permissions";
import logger from "../utils/logger";
import {
  COMPACT_STEPS,
  getNextOnboardingStep,
  getOnboardingProgress,
  getOnboardingRoute,
  reconcileStepWithRoute,
} from "./onboarding/flow";
import { useOnboardingSession } from "./onboarding/useOnboardingSession";
import { clearPendingLocalModels, hasPendingLocalModels } from "./onboarding/pendingLocalModels";

interface OnboardingFlowProps {
  onComplete: (options?: { openSettings?: boolean }) => void;
}

function DemoHotkeyDescription({ text, hotkey }: { text: string; hotkey: string }) {
  const hotkeyStart = text.indexOf(hotkey);
  if (hotkeyStart < 0) return text;

  return (
    <>
      {text.slice(0, hotkeyStart)}
      <kbd className="mx-0.5 inline-flex rounded-md bg-[color-mix(in_srgb,var(--onboarding-accent)_12%,transparent)] px-1.5 py-0.5 font-semibold text-[var(--onboarding-accent)]">
        {hotkey}
      </kbd>
      {text.slice(hotkeyStart + hotkey.length)}
    </>
  );
}

export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const agentAllowed = true;
  const screenContextAllowed = true;
  const settings = useSettings();
  const settingsStore = useSettingsStore();
  const { session, setSession, goTo, goBack, clearSession } = useOnboardingSession();

  const [dictationHotkey, setDictationHotkey] = useState(
    () => parseHotkeyList(settings.dictationKey)[0] || getDefaultHotkey()
  );
  const [dictationHotkeyConfirmed, setDictationHotkeyConfirmed] = useState(false);
  // Seeded from main rather than getDefaultHotkey(): main already knows when the
  // platform default can't bind (GNOME/X11 reject modifier-only combos) and
  // registered a fallback instead — recommending the unregistrable default would
  // make every confirm of it fail.
  const [recommendedDictationHotkey, setRecommendedDictationHotkey] = useState(getDefaultHotkey);
  const [dictationDemoSuccess, setDictationDemoSuccess] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [permissionAlert, setPermissionAlert] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [, setAccessibilitySkipped] = useLocalStorage(ACCESSIBILITY_SKIPPED_KEY, false);

  const permissions = usePermissions((dialog) =>
    setPermissionAlert({ title: dialog.title, description: dialog.description })
  );
  useClipboard((dialog) =>
    setPermissionAlert({ title: dialog.title, description: dialog.description })
  );
  const systemAudio = useSystemAudioPermission();
  const {
    granted: screenRecordingGranted,
    needsRelaunch: screenRecordingNeedsRelaunch,
    request: requestScreenRecordingAccess,
  } = useScreenRecordingPermission();
  const { activationMode } = settings;
  // This hook also starts the membership fetch for already-authenticated users;
  // relying on the login transition alone would leave resumed onboarding stuck
  // waiting for workspace resolution after an app restart.
  // The setting turns on only once the permission is actually granted, so an
  // Enable click whose System Settings grant is abandoned can't leave screen
  // context armed to activate silently on some later grant.
  const [screenContextRequested, setScreenContextRequested] = useState(false);

  const applyScreenContext = useCallback(() => {
    settingsStore.setVoiceAgentScreenContext(true);
    // Keeps the dictation overlay out of its own screenshots.
    void window.electronAPI?.setScreenContextEnabled?.(true);
  }, [settingsStore]);

  const enableScreenContext = useCallback(async () => {
    setScreenContextRequested(true);
    const granted = await requestScreenRecordingAccess();
    if (granted) applyScreenContext();
    return granted;
  }, [applyScreenContext, requestScreenRecordingAccess]);

  // macOS grants Screen Recording in System Settings, outside the app; the
  // permission hook re-checks on window focus. When the grant lands, complete
  // the opt-in the Enable click started — within this session only.
  useEffect(() => {
    if (!screenContextRequested || !screenRecordingGranted) return;
    if (settingsStore.voiceAgentScreenContext) return;
    applyScreenContext();
  }, [
    screenContextRequested,
    screenRecordingGranted,
    settingsStore.voiceAgentScreenContext,
    applyScreenContext,
  ]);

  const route = useMemo(() => getOnboardingRoute(), []);
  const currentStepId = reconcileStepWithRoute(session.currentStepId, route);
  const compact = COMPACT_STEPS.has(currentStepId);

  useEffect(() => {
    if (session.currentStepId !== currentStepId) {
      setSession((current) => ({ ...current, currentStepId }));
    }
  }, [currentStepId, session.currentStepId, setSession]);

  // AppRouter releases this only after it has committed the normal app. Keeping
  // the gate active across this component's unmount prevents a one-frame flash
  // of the dictation pill or another normal-app overlay at completion/error.
  useEffect(() => {
    void window.electronAPI?.setOnboardingActive?.(true);
  }, []);

  useEffect(() => {
    void window.electronAPI?.setOnboardingWindowMode?.(compact ? "compact" : "expanded");
  }, [compact]);

  useEffect(() => {
    setStageReady(false);
  }, [currentStepId]);

  // Track main's actual registration: the platform default may be unregistrable
  // (GNOME gsettings and X11 reject modifier-only combos like Control+Super), in
  // which case main silently registered FALLBACK_HOTKEYS instead. Recommend and
  // teach the key that really works, not the one that always errors.
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      ?.getEffectiveDefaultHotkey?.()
      .then((key) => {
        const effective = key && parseHotkeyList(key)[0];
        if (cancelled || !effective) return;
        setRecommendedDictationHotkey(effective);
        // finalizeOnboarding registers dictationHotkey without further input on
        // routes that never show the hotkey step, so an unregistrable renderer
        // default has to be replaced here, not just in the recommendation.
        setDictationHotkey((current) => (current === getDefaultHotkey() ? effective : current));
      })
      .catch((error) =>
        logger.warn("Failed to read effective default hotkey", { error }, "onboarding")
      );
    const unsubscribe = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      const fallback = parseHotkeyList(data?.fallback)[0];
      if (!fallback) return;
      setDictationHotkey(fallback);
      setRecommendedDictationHotkey(fallback);
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const withExtraDictationHotkeys = useCallback(
    (primary: string) =>
      serializeHotkeyList([primary, ...parseHotkeyList(settings.dictationKey).slice(1)]),
    [settings.dictationKey]
  );

  const { registerHotkey, isRegistering } = useHotkeyRegistration({
    onSuccess: (registered) => {
      const primary = parseHotkeyList(registered)[0] || registered;
      setDictationHotkey(primary);
      settings.setDictationKey(registered);
    },
    showSuccessToast: false,
    showErrorToast: false,
  });

  const validateDictationHotkey = useCallback(
    (value: string) => getValidationMessage(value, getPlatform()),
    []
  );

  const confirmDictationHotkey = useCallback(
    async (value: string) => {
      const registered = await registerHotkey(withExtraDictationHotkeys(value));
      return registered ? null : t("onboarding.rehaul.hotkey.inUse");
    },
    [registerHotkey, t, withExtraDictationHotkeys]
  );

  const finalizeOnboarding = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setFatalError(null);
    try {
      const registered = await registerHotkey(withExtraDictationHotkeys(dictationHotkey));
      if (!registered) {
        setFatalError(t("onboarding.hotkey.couldNotRegisterDescription"));
        return;
      }

      await window.electronAPI?.saveAllKeysToEnv?.();
      await window.electronAPI?.markBundleMigrated?.();
      await window.electronAPI?.setOnboardingWindowMode?.("restore");

      // hasPendingLocalModels() covers proceeding past a still-running download
      // rather than skipping: the model was remembered when the download
      // started, and BackgroundModelDownloadTray only applies it (and then
      // clears this flag) while the flag is set.
      //
      if (hasPendingLocalModels()) {
        localStorage.setItem("localSetupPending", "true");
      } else {
        localStorage.removeItem("localSetupPending");
        clearPendingLocalModels();
      }

      clearSession();
      localStorage.setItem("onboardingCompleted", "true");
      onComplete();
    } catch (error) {
      logger.error("Failed to finish onboarding", { error }, "onboarding");
      setFatalError(t("common.unknownError"));
    } finally {
      setIsFinishing(false);
    }
  }, [
    clearSession,
    dictationHotkey,
    isFinishing,
    onComplete,
    registerHotkey,
    t,
    withExtraDictationHotkeys,
  ]);

  const continueFromCurrentStep = useCallback(async () => {
    // A banner from an earlier failed attempt must not outlive the retry.
    setFatalError(null);
    if (currentStepId === "permissions") {
      if (getPlatform() === "darwin" && !permissions.accessibilityPermissionGranted) {
        setAccessibilitySkipped(true);
      }
    } else if (currentStepId === "languages") {
      settings.setPreferredLanguage(
        settings.spokenLanguages.length === 1 ? settings.spokenLanguages[0] : "auto"
      );
    } else if (currentStepId === "dictation-hotkey") {
      const registered = await registerHotkey(withExtraDictationHotkeys(dictationHotkey));
      if (!registered) {
        setFatalError(t("onboarding.hotkey.couldNotRegisterDescription"));
        return;
      }
    } else if (currentStepId === "local-dictation") {
      settingsStore.setCloudTranscriptionForAllScopes({ useLocalWhisper: true });
      // Onboarding downloads no local LLM, so cleanup must not fall back to an
      // unconfigured provider.
      settingsStore.updateCleanupSettings({ useCleanupModel: false });
    }

    const next = getNextOnboardingStep(currentStepId, route);
    if (next) {
      goTo(next);
      return;
    }

    await finalizeOnboarding();
  }, [
    currentStepId,
    dictationHotkey,
    finalizeOnboarding,
    goTo,
    permissions.accessibilityPermissionGranted,
    registerHotkey,
    route,
    setAccessibilitySkipped,
    settings,
    settingsStore,
    t,
    withExtraDictationHotkeys,
  ]);

  const canContinue = (() => {
    switch (currentStepId) {
      case "permissions":
        return areRequiredPermissionsMet(permissions.micPermissionGranted);
      case "languages":
        return settings.spokenLanguages.length > 0;
      case "dictation-hotkey":
        return dictationHotkeyConfirmed;
      case "dictation-demo":
        return dictationDemoSuccess;
      case "local-dictation":
        return stageReady;
      default:
        return true;
    }
  })();

  const renderStep = () => {
    switch (currentStepId) {
      case "permissions":
        return (
          <CompactPermissionsStep
            permissions={permissions}
            systemAudio={systemAudio}
            screenContext={
              agentAllowed && screenContextAllowed
                ? {
                    enabled: settingsStore.voiceAgentScreenContext,
                    granted: screenRecordingGranted,
                    needsRelaunch: screenRecordingNeedsRelaunch,
                    request: enableScreenContext,
                  }
                : undefined
            }
            onContinue={() => void continueFromCurrentStep()}
          />
        );

      case "languages":
        return (
          <div className="flex h-full min-h-0 w-full flex-col pt-1">
            <OnboardingStepHeader
              title={t("onboarding.rehaul.languages.title")}
              titleLines={[
                t("onboarding.rehaul.languages.titleLineOne"),
                t("onboarding.rehaul.languages.titleLineTwo"),
              ]}
              description={t("onboarding.rehaul.languages.description")}
            />
            <LanguageSelectionStep
              selected={settings.spokenLanguages}
              onChange={settings.setSpokenLanguages}
              searchPlaceholder={t("languageSelector.searchPlaceholder")}
              noResultsLabel={t("languageSelector.noLanguagesFound")}
              selectedLabel={t("onboarding.rehaul.languages.title")}
            />
          </div>
        );

      case "dictation-hotkey":
        return (
          // Flex column so the capture box always stays inside the shell, which
          // is overflow-hidden.
          <div className="flex h-full min-h-0 w-full flex-col pt-2">
            <OnboardingStepHeader
              title={t("onboarding.rehaul.dictationHotkey.title")}
              titleLines={[
                t("onboarding.rehaul.dictationHotkey.titleLineOne"),
                t("onboarding.rehaul.dictationHotkey.titleLineTwo"),
              ]}
              description={t("onboarding.rehaul.dictationHotkey.description")}
            />
            <ShortcutSetupStep
              value={dictationHotkeyConfirmed ? dictationHotkey : ""}
              onChange={(value) => {
                setDictationHotkey(value);
                setDictationHotkeyConfirmed(true);
              }}
              onClearSelection={() => setDictationHotkeyConfirmed(false)}
              recommended={recommendedDictationHotkey}
              captureLabel={t("onboarding.rehaul.hotkey.capture")}
              recommendedLabel={t("common.recommended")}
              chooseAnotherLabel={t("onboarding.rehaul.hotkey.chooseAnother")}
              validate={validateDictationHotkey}
              onConfirm={confirmDictationHotkey}
              showCandidateActions
            />
          </div>
        );

      case "local-dictation":
        return (
          <div className="h-full w-full pt-2">
            <OnboardingStepHeader
              title={t("onboarding.rehaul.local.title")}
              // Without this the h1 is capped at max-w-xs (320px), which wraps
              // "Set up local models" onto a second line at 40px.
              wideTitle
              description={t("onboarding.rehaul.local.description")}
              descriptionLines={[
                t("onboarding.rehaul.local.descriptionLineOne"),
                t("onboarding.rehaul.local.descriptionLineTwo"),
              ]}
            />
            <LocalModelSetupStep
              stepId="local-dictation"
              onReadinessChange={setStageReady}
              onProceed={() => void continueFromCurrentStep()}
              // Skipping leaves dictation without a model; the demo after it
              // stays skippable, and the model can be picked in Settings later.
              onSkip={() => void continueFromCurrentStep()}
            />
          </div>
        );

      case "dictation-demo": {
        const hotkeyInstruction = formatHotkeyInstruction(dictationHotkey);
        const description = t(
          activationMode === "push"
            ? "onboarding.activation.holdHotkey"
            : "onboarding.rehaul.dictationDemo.description",
          // Formatted for reading: the raw accelerator would show internal
          // syntax like "GLOBE" or "CommandOrControl+Shift+Space".
          { hotkey: hotkeyInstruction }
        );
        return (
          <div className="h-full w-full pt-2">
            <OnboardingStepHeader
              title={t("onboarding.rehaul.dictationDemo.title")}
              titleLines={[
                t("onboarding.rehaul.dictationDemo.titleLineOne"),
                t("onboarding.rehaul.dictationDemo.titleLineTwo"),
              ]}
              description={<DemoHotkeyDescription text={description} hotkey={hotkeyInstruction} />}
            />
            <DemoStep
              kind="dictation"
              firstMessage={t("onboarding.rehaul.dictationDemo.founder")}
              secondMessage={t("onboarding.rehaul.dictationDemo.prompt")}
              placeholder={t("onboarding.rehaul.dictationDemo.placeholder")}
              listeningLabel={t("onboarding.rehaul.demo.listening")}
              processingLabel={t("onboarding.rehaul.demo.processing")}
              stopLabel={t("onboarding.rehaul.demo.stop")}
              retryLabel={t("common.retry")}
              assistantResponse={t("onboarding.rehaul.assistantDemo.response")}
              assistantSenderName={t("onboarding.rehaul.assistantDemo.senderName")}
              assistantSenderEmail={t("onboarding.rehaul.assistantDemo.senderEmail")}
              assistantRecipientLabel={t("onboarding.rehaul.assistantDemo.recipientLabel")}
              onSuccessChange={setDictationDemoSuccess}
            />
          </div>
        );
      }
    }
  };

  const hasShellNavigation = !compact;
  const hotkeyStep = currentStepId === "dictation-hotkey";
  const demoStep = currentStepId === "dictation-demo";
  const inlineGatedStep = hotkeyStep || demoStep;
  const inlineProviderStep = currentStepId === "local-dictation";
  // Provider pages own their forward action, while hotkey/demo pages withhold
  // Continue until their task is complete.
  const showsContinue =
    hasShellNavigation && !inlineProviderStep && (!inlineGatedStep || canContinue);
  // Keep this branch's demo escape hatch: practice must remain skippable when a
  // microphone or backend problem prevents completion.
  const showsSkip = demoStep && !canContinue;

  return (
    <>
      <OnboardingShell
        compact={compact}
        stepKey={currentStepId}
        // History is the only Back gate. This preserves the branch's provider
        // escape path and also lets users return from languages.
        onBack={hasShellNavigation && session.history.length > 0 ? goBack : undefined}
        onContinue={showsContinue ? () => void continueFromCurrentStep() : undefined}
        // The demos are practice, not configuration — a mic problem or an
        // unreachable transcription backend must never dead-end setup, so they
        // stay skippable until they succeed.
        onSkip={showsSkip ? () => void continueFromCurrentStep() : undefined}
        continueLabel={t("common.continue")}
        skipLabel={t("common.skip")}
        continueDisabled={!canContinue}
        continueLoading={isFinishing || isRegistering}
        progress={getOnboardingProgress(currentStepId, route)}
        // Label Back only when it is the sole footer action. Unlike the source
        // commit, this branch also has demo Skip, so Back stays icon-only there.
        showBackLabel={!showsContinue && !showsSkip}
      >
        {fatalError && (
          <div
            role="alert"
            className="fixed left-1/2 top-14 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-destructive/20 bg-card px-4 py-2 text-sm text-destructive shadow-lg"
          >
            <AlertCircle className="size-4" />
            {fatalError}
          </div>
        )}
        {renderStep()}
      </OnboardingShell>

      <AlertDialog
        open={permissionAlert !== null}
        onOpenChange={(open) => !open && setPermissionAlert(null)}
        title={permissionAlert?.title ?? ""}
        description={permissionAlert?.description}
        onOk={() => setPermissionAlert(null)}
      />
    </>
  );
}
