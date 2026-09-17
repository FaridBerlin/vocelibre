import { useCallback, useEffect, useState } from "react";
import {
  LEGACY_ONBOARDING_STEP_KEY,
  ONBOARDING_SESSION_KEY,
  createOnboardingSession,
  migrateLegacyOnboardingStep,
  parseOnboardingSession,
  type OnboardingSession,
  type OnboardingSetupMode,
  type OnboardingStepId,
} from "./flow";

function readInitialSession(): OnboardingSession {
  if (typeof window === "undefined") return createOnboardingSession();

  const stored = parseOnboardingSession(localStorage.getItem(ONBOARDING_SESSION_KEY));
  if (stored) return stored;

  const session = createOnboardingSession();
  session.currentStepId = migrateLegacyOnboardingStep(
    localStorage.getItem(LEGACY_ONBOARDING_STEP_KEY)
  );
  return session;
}

export function useOnboardingSession() {
  const [session, setSession] = useState<OnboardingSession>(readInitialSession);

  useEffect(() => {
    localStorage.setItem(ONBOARDING_SESSION_KEY, JSON.stringify(session));
    // AppRouter uses presence of this legacy key to distinguish an OAuth
    // callback from a returning user. Keep it until finalization is atomic.
    localStorage.setItem(LEGACY_ONBOARDING_STEP_KEY, session.currentStepId);
  }, [session]);

  const goTo = useCallback((stepId: OnboardingStepId) => {
    setSession((current) => {
      if (current.currentStepId === stepId) return current;
      return {
        ...current,
        currentStepId: stepId,
        history: [...current.history, current.currentStepId],
      };
    });
  }, []);

  const goBack = useCallback(() => {
    setSession((current) => {
      const history = [...current.history];
      const previous = history.pop();
      return previous ? { ...current, currentStepId: previous, history } : current;
    });
  }, []);

  const setSetupMode = useCallback((setupMode: OnboardingSetupMode) => {
    setSession((current) => ({ ...current, setupMode }));
  }, []);

  const setSelfHostedRequested = useCallback((selfHostedRequested: boolean) => {
    setSession((current) => ({ ...current, selfHostedRequested }));
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(ONBOARDING_SESSION_KEY);
    localStorage.removeItem(LEGACY_ONBOARDING_STEP_KEY);
  }, []);

  return {
    session,
    setSession,
    goTo,
    goBack,
    setSetupMode,
    setSelfHostedRequested,
    clearSession,
  };
}
