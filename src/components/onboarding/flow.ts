export const ONBOARDING_SESSION_KEY = "onboardingSessionV2";
export const LEGACY_ONBOARDING_STEP_KEY = "onboardingCurrentStep";
export const ONBOARDING_FLOW_VERSION = 3;

type OnboardingStorage = Pick<Storage, "setItem" | "removeItem">;

export type OnboardingStepId =
  | "permissions"
  | "languages"
  | "use-cases"
  | "dictation-hotkey"
  | "activation-mode"
  | "dictation-demo"
  | "assistant-hotkey"
  | "assistant-demo"
  | "notes"
  | "local-dictation"
  | "local-assistant";

// Accounts and cloud/BYOK setup were removed: there is one route, and the only
// runtime to set up is a downloaded local model.
export type OnboardingSetupMode = "local" | null;

export interface OnboardingSession {
  version: typeof ONBOARDING_FLOW_VERSION;
  currentStepId: OnboardingStepId;
  history: OnboardingStepId[];
  setupMode: OnboardingSetupMode;
  selfHostedRequested: boolean;
}

export interface OnboardingRouteContext {
  setupMode: OnboardingSetupMode;
  agentAllowed: boolean;
}

const BASE_ROUTE: OnboardingStepId[] = [
  "permissions",
  "languages",
  "use-cases",
  "dictation-hotkey",
  "activation-mode",
  "dictation-demo",
];

// Canonical flow order, independent of any one route. reconcileStepWithRoute uses
// it to clamp backwards instead of jumping to the end of the route.
const STEP_ORDER: OnboardingStepId[] = [
  "permissions",
  "languages",
  "use-cases",
  "dictation-hotkey",
  "activation-mode",
  "dictation-demo",
  "assistant-hotkey",
  "assistant-demo",
  "notes",
  "local-dictation",
  "local-assistant",
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
  "assistant-hotkey",
  "notes",
  "local-dictation",
];

export function createOnboardingSession(): OnboardingSession {
  return {
    version: ONBOARDING_FLOW_VERSION,
    currentStepId: "permissions",
    history: [],
    setupMode: null,
    selfHostedRequested: false,
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

export function getOnboardingRoute(context: OnboardingRouteContext): OnboardingStepId[] {
  const route = [
    ...BASE_ROUTE,
    ...(context.agentAllowed ? (["assistant-hotkey", "assistant-demo"] as OnboardingStepId[]) : []),
    "notes" as const,
  ];

  if (context.setupMode) {
    route.push(
      ...(["local-dictation", "local-assistant"] as OnboardingStepId[]).filter(
        (stepId) => context.agentAllowed || !stepId.endsWith("assistant")
      )
    );
  }

  return route;
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

    const setupMode = parsed.setupMode;
    if (setupMode !== null && setupMode !== "local") {
      return null;
    }
    if (
      parsed.selfHostedRequested !== undefined &&
      typeof parsed.selfHostedRequested !== "boolean"
    ) {
      return null;
    }

    return {
      version: ONBOARDING_FLOW_VERSION,
      currentStepId: parsed.currentStepId,
      history: parsed.history.filter(isOnboardingStepId),
      setupMode,
      selfHostedRequested: parsed.selfHostedRequested ?? false,
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
 * current route no longer has (the agent gets disallowed, setupMode changes, or a
 * dev jump asks for an off-route step).
 *
 * Clamps to the route step nearest in the canonical order, ties going to the
 * earlier one so nothing gets skipped — falling back to the route's last step
 * would teleport past intermediate steps (with agentAllowed false, asking for an
 * assistant step must land on its neighbour, not on setup-choice).
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
 * Progress across the live route: one dot per step the user will actually see a
 * counter on, filled up to the current one.
 *
 * The total comes from the route rather than a constant because the route itself
 * is conditional — the assistant pair drops out when the agent is disallowed, and
 * the provider pair only exists once a non-cloud setup mode is picked. Choosing
 * BYOK/local on setup-choice therefore appends two steps and the row
 * grows by two dots at that moment, which is the flow honestly getting longer.
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

/** Enterprise customers keep provider/model selection in Settings, outside onboarding. */
