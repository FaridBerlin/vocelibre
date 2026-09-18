export const WAVEFORM_BAR_COUNT = 11;
export const WAVEFORM_BAR_MIN_PX = 4;
export const WAVEFORM_BAR_MAX_PX = 22;

// A pronounced eleven-bar rhythm keeps rounded short bars readable while tall
// peaks use nearly the full lane. Only the resting wave draws this shape —
// the live wave renders the measured signal, never a decorative profile.
export const RESTING_WAVE_SILHOUETTE = [6, 12, 5, 9, 7, 22, 18, 5, 20, 12, 17];

// Conversational speech RMS sits around 0.02–0.15. The gain puts loud voicing
// at the top of the lane; the 0.75 exponent keeps quiet speech visible while
// preserving contrast between neighboring samples — a square-root curve
// compressed them into a fluid ridge with little bar-to-bar variance.
const LEVEL_GAIN = 8;
const LEVEL_EXPONENT = 0.75;
const toBarLevel = (rms: number) =>
  Math.min(1, Math.pow(Math.max(0, rms) * LEVEL_GAIN, LEVEL_EXPONENT));

export const resolveWaveformBarHeight = (rms: number) =>
  WAVEFORM_BAR_MIN_PX + toBarLevel(rms) * (WAVEFORM_BAR_MAX_PX - WAVEFORM_BAR_MIN_PX);

// --- Live meter auto-ranging -------------------------------------------------
// The fixed curve above assumes a mic whose conversational RMS lands in
// 0.02-0.15. Real capture gain varies enormously: a USB interface can idle at
// 0.005 and peak well under 0.02, which pins every bar near the floor and reads
// as a row of static dashes. The floating meter therefore scales against what
// this mic is actually delivering.

/** Just above a quiet room's noise floor; below this counts as silence. */
export const LIVE_METER_NOISE_FLOOR = 0.006;
/** Never divide by less than this, so silence cannot amplify hiss to full scale. */
export const LIVE_METER_MIN_PEAK = 0.02;
/** Per-sample decay (~80ms), so the range follows speech down after a shout. */
export const LIVE_METER_PEAK_DECAY = 0.995;

/**
 * Returns a stateful normaliser mapping raw RMS to 0..1 against a decaying
 * running peak. Silence yields exactly 0 (bars rest), and normal speech uses
 * the full lane whatever the mic's gain.
 */
export function createLiveMeterRange({
  noiseFloor = LIVE_METER_NOISE_FLOOR,
  minPeak = LIVE_METER_MIN_PEAK,
  decay = LIVE_METER_PEAK_DECAY,
} = {}) {
  let peak = minPeak;
  return (rms: number) => {
    const above = Math.max(0, (Number.isFinite(rms) ? rms : 0) - noiseFloor);
    peak = Math.max(above, peak * decay, minPeak);
    return Math.min(1, above / peak);
  };
}

export const resolveMeterBarHeight = (level: number, maxPx: number) =>
  WAVEFORM_BAR_MIN_PX + Math.min(1, Math.max(0, level)) * (maxPx - WAVEFORM_BAR_MIN_PX);
