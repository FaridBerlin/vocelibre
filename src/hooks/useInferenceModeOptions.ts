import type { InferenceMode } from "../types/electron";

export interface InferenceModeOptions<T> {
  modes: T[];
  effectiveMode: InferenceMode;
  isModeAllowed: (mode: InferenceMode) => boolean;
}

/**
 * Replaces the old usePolicyModeOptions. Org policy used to filter the offered
 * modes and could override the user's selection; with no workspace there is
 * nothing to filter against, so every offered mode is allowed and the user's
 * selection always stands.
 */
export function useInferenceModeOptions<T extends { id: InferenceMode; disabled?: boolean }>(
  options: T[],
  selectedMode: InferenceMode
): InferenceModeOptions<T> {
  return {
    modes: options,
    effectiveMode: selectedMode,
    isModeAllowed: () => true,
  };
}
