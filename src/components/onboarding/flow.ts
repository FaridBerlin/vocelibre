export const ONBOARDING_SESSION_KEY = "onboardingSessionV2";
export const LEGACY_ONBOARDING_STEP_KEY = "onboardingCurrentStep";
export const ONBOARDING_FLOW_VERSION = 4;

type OnboardingStorage = Pick<Storage, "setItem" | "removeItem">;

export type OnboardingStepId =
  "permissions" | "languages" | "dictation-hotkey" | "local-dictation" | "dictation-demo";

export interface OnboardingSession {
  version: typeof ONBOARDING_FLOW_VERSION;
  currentStepId: OnboardingStepId;
  history: OnboardingStepId[];
}

// Onboarding covers dictation only: what a first dictation needs (microphone,
// language, shortcut, a local speech model), then a practice run. The assistant,
// notes and calendar are reachable from the app itself. The model comes before
// the demo because the demo transcribes with it.
//
// Also the canonical order reconcileStepWithRoute clamps against.
const STEP_ORDER: OnboardingStepId[] = [
  "permissions",
  "languages",
  "dictation-hotkey",
  "local-dictation",
  "dictation-demo",
];

const KNOWN_STEPS = new Set<OnboardingStepId>(STEP_ORDER);

/**
 * Steps that render in the compact frame. That frame has no footer, so these
 * steps show no progress row and are left out of the count entirely — landing on
 * `languages` reads as "1 of N", not "3 of N" for two steps the user never saw a
 * counter on.
 */
export const COMPACT_STEPS: ReadonlySet<OnboardingStepId> = new Set<OnboardingStepId>([
  "permissions",
]);

const LEGACY_STEP_MAP: OnboardingStepId[] = [
  // A save from the pre-account flow at any of the first indexes means the
  // grants were never shown, so resume at permissions rather than past it.
  "permissions",
  "permissions",
  "permissions",
  "permissions",
  "dictation-hotkey",
  "local-dictation",
  "local-dictation",
  "local-dictation",
];

export function createOnboardingSession(): OnboardingSession {
  return {
    version: ONBOARDING_FLOW_VERSION,
    currentStepId: "permissions",
    history: [],
  };
}

export function resetOnboardingProgress(storage: OnboardingStorage): void {
  storage.removeItem(ONBOARDING_SESSION_KEY);
  storage.removeItem("onboardingCompleted");
  storage.removeItem("authenticationSkipped");
  storage.removeItem("skipAuth");
  // AppRouter uses this marker to distinguish an explicit restart from a
  // returning signed-in user, while useOnboardingSession migrates it to auth.
  storage.setItem(LEGACY_ONBOARDING_STEP_KEY, "0");
}

export function getOnboardingRoute(): OnboardingStepId[] {
  return [...STEP_ORDER];
}

export function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return typeof value === "string" && KNOWN_STEPS.has(value as OnboardingStepId);
}

export function parseOnboardingSession(value: string | null): OnboardingSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<OnboardingSession>;
    if (
      parsed.version !== ONBOARDING_FLOW_VERSION ||
      !isOnboardingStepId(parsed.currentStepId) ||
      !Array.isArray(parsed.history)
    ) {
      return null;
    }

    return {
      version: ONBOARDING_FLOW_VERSION,
      currentStepId: parsed.currentStepId,
      history: parsed.history.filter(isOnboardingStepId),
    };
  } catch {
    return null;
  }
}

export function migrateLegacyOnboardingStep(value: string | null): OnboardingStepId {
  if (!value) return "permissions";
  if (isOnboardingStepId(value)) return value;

  const index = Number.parseInt(value, 10);
  if (!Number.isFinite(index) || index < 0) return "permissions";
  return LEGACY_STEP_MAP[Math.min(index, LEGACY_STEP_MAP.length - 1)] ?? "permissions";
}

/**
 * Map a step onto the caller's route, for when a saved session names a step the
 * route no longer has (a dev jump asks for an off-route step).
 *
 * Clamps to the route step nearest in the canonical order, ties going to the
 * earlier one so nothing gets skipped.
 */
export function reconcileStepWithRoute(
  stepId: OnboardingStepId,
  route: OnboardingStepId[]
): OnboardingStepId {
  if (route.includes(stepId)) return stepId;
  const target = STEP_ORDER.indexOf(stepId);
  if (target === -1 || route.length === 0) return route[0] ?? "permissions";
  return route.reduce((best, candidate) => {
    const bestDistance = Math.abs(STEP_ORDER.indexOf(best) - target);
    const candidateDistance = Math.abs(STEP_ORDER.indexOf(candidate) - target);
    return candidateDistance < bestDistance ? candidate : best;
  }, route[0]);
}

export function getNextOnboardingStep(
  currentStepId: OnboardingStepId,
  route: OnboardingStepId[]
): OnboardingStepId | null {
  const index = route.indexOf(currentStepId);
  return index >= 0 ? (route[index + 1] ?? null) : (route[0] ?? null);
}

export interface OnboardingProgressState {
  /** Zero-based position among the counted steps. */
  index: number;
  /** Number of counted steps in the current route. */
  total: number;
}

/**
 * Progress across the route: one dot per step the user will actually see a
 * counter on, filled up to the current one.
 *
 * Returns null when there is nothing worth drawing: a compact step, an off-route
 * step, or a route with fewer than two counted steps, where a one-dot row would
 * read as decoration.
 */
export function getOnboardingProgress(
  stepId: OnboardingStepId,
  route: OnboardingStepId[]
): OnboardingProgressState | null {
  if (COMPACT_STEPS.has(stepId)) return null;

  const counted = route.filter((candidate) => !COMPACT_STEPS.has(candidate));
  const index = counted.indexOf(stepId);
  if (index === -1 || counted.length < 2) return null;

  return { index, total: counted.length };
}
