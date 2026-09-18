import React, { useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import {
  createLiveMeterRange,
  resolveMeterBarHeight,
  resolveWaveformBarHeight,
  WAVEFORM_BAR_COUNT,
  WAVEFORM_BAR_MIN_PX,
} from "./waveformMath";

interface PillWaveformProps {
  /** Returns the current input level (0..~1) or null when no signal source exists. */
  getLevel: () => number | null;
  /** While true the bars scroll with live levels; false freezes the captured wave. */
  active: boolean;
  className?: string;
  /** Bar count. Defaults to the panel capsule's WAVEFORM_BAR_COUNT. */
  barCount?: number;
  /** Replaces the default bar styling; the height transition lives here too. */
  barClassName?: string;
  /** Tallest a bar may draw. Only used with `autoRange`. */
  barMaxPx?: number;
  /**
   * Scale against this mic's own delivered level instead of the fixed curve.
   * Capture gain varies enough between devices that a fixed curve pins a quiet
   * interface near the floor, which reads as static dashes.
   */
  autoRange?: boolean;
  /** Dev aid: logs each sample so the live path can be confirmed while speaking. */
  debugLabel?: string;
}

// Syllables run ~140-250ms; sampling much faster than that lands neighboring
// bars inside the same syllable, which reads as a fluid ridge. 80ms spacing
// lets adjacent bars straddle syllable onsets and gaps, so the real signal
// itself supplies the bar-to-bar variance.
const SAMPLE_INTERVAL_MS = 80;

/**
 * Level-driven waveform: bars scroll right-to-left with the live input signal.
 * Heights are written directly to the DOM from a rAF loop so recording never
 * pays React re-render cost. With no signal (getLevel → null) the bars rest at
 * minimum height; when `active` goes false the last captured wave stays frozen.
 */
export function PillWaveform({
  getLevel,
  active,
  className,
  barCount = WAVEFORM_BAR_COUNT,
  barClassName,
  barMaxPx,
  autoRange = false,
  debugLabel,
}: PillWaveformProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const levelsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!active) return;

    // A new recording starts from silence — never replay the previous
    // session's frozen wave.
    levelsRef.current = new Array(barCount).fill(0);
    for (let index = 0; index < barCount; index += 1) {
      const height = `${WAVEFORM_BAR_MIN_PX}px`;
      if (barRefs.current[index]) barRefs.current[index].style.height = height;
    }

    const normalise = autoRange ? createLiveMeterRange() : null;
    let frame = 0;
    let lastSample = 0;
    const paint = (now: number) => {
      if (now - lastSample >= SAMPLE_INTERVAL_MS) {
        lastSample = now;
        const level = getLevel();
        const raw = level === null ? 0 : level;
        const levels = levelsRef.current;
        levels.shift();
        levels.push(normalise ? normalise(raw) : raw);
        if (debugLabel) {
          console.log(
            `[${debugLabel}] rms=${raw.toFixed(4)} scaled=${levels[levels.length - 1].toFixed(3)}`
          );
        }
        for (let i = 0; i < levels.length; i++) {
          const bar = barRefs.current[i];
          if (!bar) continue;
          bar.style.height = normalise
            ? `${resolveMeterBarHeight(levels[i], barMaxPx ?? 26)}px`
            : `${resolveWaveformBarHeight(levels[i])}px`;
        }
      }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [active, getLevel, barCount, barMaxPx, autoRange, debugLabel]);

  return (
    <div
      className={cn("flex h-full items-center justify-center gap-0.75", className)}
      aria-hidden="true"
    >
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className={
            barClassName ??
            "w-0.5 rounded-full bg-current transition-[height] duration-75 ease-out motion-reduce:transition-none"
          }
          style={{ height: WAVEFORM_BAR_MIN_PX }}
        />
      ))}
    </div>
  );
}
