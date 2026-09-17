import { forwardRef, type HTMLAttributes } from "react";
import { ChevronUp, Zap } from "lucide-react";
import { cn } from "../lib/utils";
import { PillWaveform } from "./PillWaveform";
import { VoiceIdentityIcon } from "./VoiceIdentityIcon";
import { RESTING_WAVE_SILHOUETTE, WAVEFORM_BAR_COUNT } from "./waveformMath";
import {
  LISTENING_ENTRANCE_TIMING,
  VOICE_PILL_FOOTPRINT,
} from "../../helpers/voicePillPresentation";

export type VoicePillState =
  "idle" | "hover" | "recording" | "processing" | "thinking" | "unavailable";

interface VoicePillProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  variant: "floating" | "panel";
  state: VoicePillState;
  getAudioLevel: () => number | null;
  expanded?: boolean;
  collapseToLogo?: boolean;
  waveformVisible?: boolean;
  waveformOnlyWhileRecording?: boolean;
  integratedWithPanel?: boolean;
  agentMode?: boolean;
  showExpandChevron?: boolean;
  isDragging?: boolean;
  horizontalDirection?: "left" | "right";
}

const GROW_TRANSITION = `${LISTENING_ENTRANCE_TIMING.expansionMs}ms cubic-bezier(0.2, 0, 0, 1)`;
// Sized from WAVEFORM_BAR_COUNT so a bar-count change can never silently
// desync the resting silhouette from the live waveform's footprint.
const RESTING_WAVE_HEIGHTS = Array.from(
  { length: WAVEFORM_BAR_COUNT },
  (_, index) => RESTING_WAVE_SILHOUETTE[index % RESTING_WAVE_SILHOUETTE.length]
);

// Jagged polylines in a 100x100 viewBox. The button occupies r=30 (60px), so
// arcs run from r~31 to r~42 — 12px of travel, matching the dock inset that
// bounds the overlay window (voice-pill-position-* in dictation-panel.css).
const LIGHTNING_ARCS = [
  // up
  "50,19 47,13 53,9 49,2",
  // upper right
  "72,29 78,26 76,20 82,16",
  // lower right
  "72,71 79,73 77,80 83,84",
  // down
  "50,81 53,87 47,91 51,98",
  // lower left
  "28,71 21,74 24,80 17,85",
  // upper left
  "28,29 22,25 25,19 18,15",
];

const STATE_APPEARANCE: Record<VoicePillState, string> = {
  idle: "border-border-hover bg-surface-1 text-muted-foreground dark:border-border/50",
  hover: "border-border-hover bg-surface-3 text-foreground",
  recording: "border-border-hover bg-surface-1 text-foreground",
  processing: "border-border/60 bg-surface-1 text-foreground/70",
  thinking: "border-border/60 bg-surface-1 text-foreground",
  unavailable: "border-border/60 bg-surface-1 text-muted-foreground",
};

/** One persistent control that resizes between the floating and panel layouts. */
export const VoicePill = forwardRef<HTMLDivElement, VoicePillProps>(function VoicePill(
  {
    variant,
    state,
    getAudioLevel,
    expanded = false,
    collapseToLogo = false,
    waveformVisible = true,
    waveformOnlyWhileRecording = false,
    integratedWithPanel = false,
    agentMode = false,
    showExpandChevron = false,
    isDragging = false,
    horizontalDirection = "right",
    className,
    style,
    ...props
  },
  ref
) {
  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isThinking = state === "thinking";
  const isUnavailable = state === "unavailable";
  // One Signal glow (comet orbit over a breathing halo) serves both
  // identities; only the palette differs. It lights for the real thinking
  // state alone — glowing during the entrance or while listening would read
  // as work already in flight before any transcript exists.
  const showSignalGlow = !isUnavailable && isThinking;
  const isPanel = variant === "panel";
  const collapseToIdentity = collapseToLogo || isThinking;
  // The capsule (identity mark + waveform) is now a panel-only shape. The
  // floating trigger keeps one circular form across idle and listening so the
  // desktop only ever learns a single control; listening is signalled by the
  // arcs instead of by changing shape.
  const showCompactPill =
    isPanel && !collapseToIdentity && (isRecording || expanded || !waveformOnlyWhileRecording);
  const showDivider = showCompactPill && waveformVisible && !isRecording;
  const dividerMargin = showCompactPill ? (showDivider ? 4 : 3) : 0;
  const identitySize = 22;
  const boltSize = 28;
  const floatingHover = !isPanel && state === "hover";
  // The bolt is the floating trigger's only glyph, idle and listening alike.
  // The panel variant keeps the identity mark, which pairs with the waveform
  // and is what morphs into the Agent glyph.
  const showBolt = !isPanel && !collapseToIdentity && !showExpandChevron;
  // Sparking arcs are the sole "live" signal, so listening reads as the same
  // control energised rather than as a different surface.
  const showListeningArcs = !isPanel && isRecording;
  const footprint = showCompactPill ? VOICE_PILL_FOOTPRINT.recording : VOICE_PILL_FOOTPRINT.idle;

  const pill = (
    <div
      ref={ref}
      className={cn(
        "voice-pill-control relative flex items-center justify-center overflow-hidden rounded-full border",
        showCompactPill && "pr-1",
        "shadow-[var(--shadow-card)]",
        // The bolt surface paints its own background, border and glyph colour,
        // so the per-state surface tokens would only be dead classes that make
        // idle and listening look different in the markup without differing on
        // screen. Idle and listening must differ by the arcs alone.
        showBolt ? "border-transparent" : STATE_APPEARANCE[state],
        className
      )}
      style={{
        // Listening uses the same compact pill as the assistant panel. The
        // previous wide recording bar made the control feel like a different
        // surface and forced an unnecessary large window resize.
        width: footprint.width,
        height: footprint.height,
        cursor: isProcessing || isThinking ? "not-allowed" : isDragging ? "grabbing" : "pointer",
        boxShadow: floatingHover ? "var(--shadow-card-hover-subtle)" : undefined,
        transition: `width ${GROW_TRANSITION}, height ${GROW_TRANSITION}, padding-left ${GROW_TRANSITION}, padding-right ${GROW_TRANSITION}, background-color 220ms ease-out, border-color 220ms ease-out, box-shadow 220ms ease-out`,
        ...style,
      }}
      data-horizontal-direction={horizontalDirection}
      data-integrated-with-panel={integratedWithPanel || undefined}
      data-bolt-surface={showBolt || undefined}
      data-pill-state={showBolt ? state : undefined}
      data-agent-mode={agentMode || undefined}
      data-agent-beam-active={(agentMode && isThinking) || undefined}
      data-expand-chevron={showExpandChevron || undefined}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-foreground/10 to-transparent transition-opacity duration-200 ease-out"
        style={{ opacity: state === "hover" ? 0.72 : 0 }}
      />

      <span
        className="voice-pill-identity-slot relative inline-block shrink-0 transition-[width,height] duration-200"
        style={{
          width: showBolt ? boltSize : identitySize,
          height: showBolt ? boltSize : identitySize,
        }}
        aria-hidden="true"
      >
        <Zap
          className={cn(
            "voice-pill-bolt absolute inset-0 m-auto transition-[opacity,transform] duration-200 ease-out",
            showBolt ? "scale-100 opacity-100" : "scale-75 opacity-0"
          )}
          style={{ width: boltSize, height: boltSize }}
          strokeWidth={1.5}
        />
        <span
          className={cn(
            "voice-pill-identity-logo absolute inset-0 transition-[opacity,transform] duration-200 ease-out",
            showBolt || showExpandChevron
              ? "translate-y-1 scale-75 opacity-0"
              : "scale-100 opacity-100"
          )}
        >
          <VoiceIdentityIcon
            size={identitySize}
            agentMode={agentMode}
            className={cn(
              "transition-[width,height] duration-200",
              state === "idle" && "text-foreground",
              (isUnavailable || isProcessing) && "animate-pulse"
            )}
          />
        </span>
        <ChevronUp
          className={cn(
            "voice-pill-expand-chevron absolute inset-0 m-auto size-5 transition-[opacity,transform] duration-200 ease-out",
            showExpandChevron ? "scale-100 opacity-100" : "translate-y-1 scale-75 opacity-0"
          )}
          strokeWidth={2}
        />
      </span>

      {/* Divider and waveform belong to the panel capsule. The floating
          trigger never grows into that shape, so it does not render them
          at all rather than collapsing them to zero width. */}
      {isPanel && (
        <>
          <div
            className="shrink-0 overflow-hidden bg-border/60"
            style={{
              height: showCompactPill ? 16 : 20,
              width: showDivider ? 1 : 0,
              marginLeft: dividerMargin,
              marginRight: dividerMargin,
              opacity: showDivider ? 1 : 0,
              transition: `width ${GROW_TRANSITION}, margin ${GROW_TRANSITION}, opacity 180ms ease-out`,
            }}
          />

          <div
            className="voice-pill-waveform relative shrink-0 overflow-hidden text-foreground"
            style={{
              width: showCompactPill ? 52 : 0,
              height: showCompactPill ? 24 : 32,
              transition: `width ${GROW_TRANSITION}, height ${GROW_TRANSITION}`,
            }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center gap-0.75 transition-opacity duration-200 ease-out"
              style={{ opacity: showCompactPill && waveformVisible && !isRecording ? 1 : 0 }}
              aria-hidden="true"
            >
              {RESTING_WAVE_HEIGHTS.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="w-0.5 rounded-full bg-current"
                  style={{ height }}
                />
              ))}
            </div>
            <PillWaveform
              getLevel={getAudioLevel}
              active={isRecording}
              className={cn(
                "absolute inset-0 transition-opacity duration-200 ease-out",
                showCompactPill && waveformVisible && isRecording ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </>
      )}

      {isUnavailable && (
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-foreground/30 animate-pulse" />
      )}
    </div>
  );

  return (
    <span className="voice-pill-glow-anchor">
      {showListeningArcs && (
        // Six arcs around the circle. Their flicker cycles are deliberately
        // non-harmonic (see the CSS), so the pattern never visibly repeats and
        // reads as random sparking rather than a metronome. Geometry stays
        // inside the pill's 12px dock inset so nothing clips at the window edge.
        <span aria-hidden="true" className="voice-pill-arcs">
          {LIGHTNING_ARCS.map((arc, index) => (
            <svg
              key={arc}
              className="voice-pill-arc"
              data-arc={index + 1}
              viewBox="0 0 100 100"
              fill="none"
            >
              <polyline points={arc} />
            </svg>
          ))}
        </span>
      )}
      <span
        aria-hidden="true"
        className="processing-signal-glow"
        data-active={showSignalGlow ? "true" : undefined}
        data-agent={agentMode || undefined}
      >
        <span className="processing-signal-ring" />
      </span>
      {pill}
    </span>
  );
});
