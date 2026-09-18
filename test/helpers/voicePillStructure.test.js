const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderStatic } = require("./harness/reactSsr");

const sourceRoot = path.resolve(__dirname, "../..");
// The dictation-window feature styles are split out of index.css; selectors
// under test may live in either file.
const readDictationStyles = () =>
  fs.readFileSync(path.join(sourceRoot, "src/index.css"), "utf8") +
  fs.readFileSync(path.join(sourceRoot, "src/styles/dictation-panel.css"), "utf8");

// The pill renders the resting silhouette and the live waveform as two
// stacked bar sets, both sized from the shared bar count.
const totalWaveBars = async () => {
  const { WAVEFORM_BAR_COUNT } = await import("../../src/components/dictation/waveformMath.ts");
  return WAVEFORM_BAR_COUNT * 2;
};

// The pill's rendered footprints are a native-window contract (see
// VOICE_PILL_FOOTPRINT); every footprint assertion derives from the exported
// constants so the literals live in exactly one place.
const pillFootprints = async () => {
  const { VOICE_PILL_FOOTPRINT } = await import("../../src/helpers/voicePillPresentation.js");
  const asStyle = ({ width, height }) => new RegExp(`style="width:${width}px;height:${height}px`);
  return {
    idle: asStyle(VOICE_PILL_FOOTPRINT.idle),
    recording: asStyle(VOICE_PILL_FOOTPRINT.recording),
  };
};

const renderPill = async (state, expanded, horizontalDirection = "right", overrides = {}) => {
  const { VoicePill } = await import("../../src/components/dictation/VoicePill.tsx");
  return renderStatic(VoicePill, {
    variant: "floating",
    state,
    expanded,
    horizontalDirection,
    getAudioLevel: () => 0,
    ...overrides,
  });
};

test("thinking and recording keep the same persistent glow and pill roots", async () => {
  const thinking = await renderPill("thinking", false);
  const recording = await renderPill("recording", true);

  for (const markup of [thinking, recording]) {
    // The floating trigger wraps the anchor in a row so the meter can sit
    // beside it; the anchor and pill roots themselves stay shared, which is
    // what keeps the glow continuous across state changes.
    assert.match(markup, /^<span class="voice-trigger-shell"/);
    assert.match(markup, /<span class="voice-pill-glow-anchor">/);
    assert.match(markup, /class="processing-signal-glow"/);
    assert.match(markup, /voice-pill-control/);
  }
  assert.match(thinking, /class="processing-signal-glow" data-active="true"/);
  assert.doesNotMatch(recording, /data-active/);

  // Bar counts are a capsule property, so they are asserted on the panel
  // variant; the floating trigger renders no waveform at all now.
  const expectedBars = await totalWaveBars();
  const panelThinking = await renderPill("thinking", false, "right", { variant: "panel" });
  const panelRecording = await renderPill("recording", true, "right", { variant: "panel" });
  assert.equal((panelThinking.match(/rounded-full bg-current/g) || []).length, expectedBars);
  assert.equal((panelRecording.match(/rounded-full bg-current/g) || []).length, expectedBars);
});

test("one Signal glow serves both identities: blue processing, purple agent", async () => {
  const styles = readDictationStyles();
  const agentThinking = await renderPill("thinking", false, "right", { agentMode: true });
  // Listening must not glow in either identity: a glow before any transcript
  // exists reads as work already in flight.
  const agentListening = await renderPill("recording", false, "right", { agentMode: true });

  assert.match(styles, /\.processing-signal-glow\s*\{/);
  assert.match(styles, /:root:not\(\.dark\) \.processing-signal-glow\s*\{/);
  assert.match(
    agentThinking,
    /class="processing-signal-glow" data-active="true" data-agent="true"/
  );
  assert.doesNotMatch(agentListening, /data-active/);
});

test("the pill renders exactly the footprints the native window ladder is sized around", async () => {
  const footprint = await pillFootprints();
  const idle = await renderPill("idle", false);
  // The capsule is panel-only now; the floating trigger never changes shape.
  const panelRecording = await renderPill("recording", true, "right", { variant: "panel" });
  const floatingRecording = await renderPill("recording", true);

  assert.match(idle, footprint.idle);
  assert.doesNotMatch(idle, footprint.recording);
  assert.match(panelRecording, footprint.recording);
  assert.doesNotMatch(panelRecording, footprint.idle);
  assert.match(floatingRecording, footprint.idle);
  assert.doesNotMatch(floatingRecording, footprint.recording);
});

test("panel thinking contracts to the identity circle instead of freezing a waveform", async () => {
  const footprint = await pillFootprints();
  const panelThinking = await renderPill("thinking", false, "right", {
    variant: "panel",
    agentMode: true,
  });

  assert.match(panelThinking, footprint.idle);
  assert.match(panelThinking, /data-agent-beam-active="true"/);
  assert.doesNotMatch(panelThinking, footprint.recording);
});

test("an idle Agent panel starts with the normal pill and expands only while listening", async () => {
  const footprint = await pillFootprints();
  const idleAgent = await renderPill("idle", false, "right", {
    variant: "panel",
    agentMode: true,
    waveformOnlyWhileRecording: true,
  });
  const listeningAgent = await renderPill("recording", false, "right", {
    variant: "panel",
    agentMode: true,
    waveformOnlyWhileRecording: true,
  });

  assert.match(idleAgent, footprint.idle);
  assert.doesNotMatch(idleAgent, footprint.recording);
  assert.doesNotMatch(idleAgent, /data-active/);
  assert.match(listeningAgent, footprint.recording);
  assert.doesNotMatch(listeningAgent, /data-active/);
});

test("the waveform stays to the right of the identity across docks and voice modes", async () => {
  // The waveform capsule only exists on the panel variant now.
  const right = await renderPill("recording", true, "right", { variant: "panel" });
  const left = await renderPill("recording", true, "left", { variant: "panel" });
  const leftAgent = await renderPill("recording", true, "left", {
    variant: "panel",
    agentMode: true,
  });
  const leftLiveTranscript = await renderPill("recording", true, "left", {
    variant: "panel",
    integratedWithPanel: true,
  });

  assert.match(right, /data-horizontal-direction="right"/);
  assert.match(right, /voice-pill-control[^"\n]*pr-1/);
  assert.match(left, /data-horizontal-direction="left"/);
  assert.match(left, /voice-pill-control[^"\n]*pr-1/);

  for (const markup of [right, left, leftAgent, leftLiveTranscript]) {
    assert.doesNotMatch(markup, /flex-row-reverse/);
    assert.ok(markup.indexOf("voice-pill-identity-slot") >= 0);
    assert.ok(markup.indexOf("voice-pill-waveform") > markup.indexOf("voice-pill-identity-slot"));
  }
});

test("the collapsed Live Transcript pill transitions its logo into an expand chevron", async () => {
  const resting = await renderPill("recording", true, "right", { variant: "panel" });
  const hovered = await renderPill("recording", true, "right", {
    variant: "panel",
    showExpandChevron: true,
  });
  const leftHovered = await renderPill("recording", true, "left", {
    variant: "panel",
    showExpandChevron: true,
  });

  assert.doesNotMatch(resting, /data-expand-chevron/);
  assert.match(resting, /voice-pill-identity-logo[^"\n]*scale-100 opacity-100/);
  assert.match(resting, /voice-pill-expand-chevron[^"\n]*opacity-0/);
  assert.match(hovered, /data-expand-chevron="true"/);
  assert.match(hovered, /voice-pill-identity-logo[^"\n]*opacity-0/);
  assert.match(hovered, /voice-pill-expand-chevron[^"\n]*scale-100 opacity-100/);
  assert.doesNotMatch(leftHovered, /flex-row-reverse/);
  assert.ok(
    leftHovered.indexOf("voice-pill-expand-chevron") < leftHovered.indexOf("voice-pill-waveform")
  );
});

test("the panel pill keeps the logo at normal foreground strength", async () => {
  // The floating trigger now paints its own bolt surface, so the neutral
  // surface tokens live on with the panel variant that still uses them.
  const idle = await renderPill("idle", false, "right", { variant: "panel" });

  assert.match(idle, /border-border-hover[^"\n]*dark:border-border\/50/);
  assert.match(
    idle,
    /voice-identity-icon relative inline-block shrink-0 transition-\[width,height\] duration-200 text-foreground/
  );
});

test("the floating hover pill changes surface treatment without zooming", async () => {
  const footprint = await pillFootprints();
  const hovered = await renderPill("hover", false);
  const css = readDictationStyles();

  // Hover is expressed through the bolt surface now. The breathing keyframe
  // sets box-shadow, which outranks any inline hover shadow, so the hover
  // treatment has to come from CSS keyed on the state.
  assert.match(hovered, /data-bolt-surface="true"/);
  assert.match(hovered, /data-pill-state="hover"/);
  assert.match(css, /\.voice-pill-control\[data-bolt-surface="true"\]\[data-pill-state="hover"\]/);

  // Still no zoom, and the footprint never changes on hover.
  assert.doesNotMatch(hovered, /style="[^"]*transform:/);
  assert.match(hovered, footprint.idle);
});

test("the panel hover pill keeps its neutral surface treatment", async () => {
  const hovered = await renderPill("hover", false, "right", { variant: "panel" });

  assert.match(hovered, /border-border-hover bg-surface-3 text-foreground/);
  assert.doesNotMatch(hovered, /style="[^"]*transform:/);
  assert.match(hovered, /<svg width="22" height="22"/);
});

test("the waveform pill keeps the normal compact logo footprint", async () => {
  const idle = await renderPill("idle", false);
  const recording = await renderPill("recording", true);
  const liveTranscript = await renderPill("recording", true, "right", {
    variant: "panel",
    integratedWithPanel: true,
  });

  for (const markup of [idle, recording, liveTranscript]) {
    assert.match(markup, /<svg width="22" height="22"/);
  }
});

test("an interactive voice pill is keyboard focusable", async () => {
  const interactive = await renderPill("recording", true, "right", {
    role: "button",
    tabIndex: 0,
  });

  assert.match(interactive, /role="button"/);
  assert.match(interactive, /tabindex="0"/);
});

test("the waveform uses foreground contrast, rounded caps, and a pronounced height range", async () => {
  const recording = await renderPill("recording", true, "right", { variant: "panel" });
  const { WAVEFORM_BAR_MIN_PX, WAVEFORM_BAR_MAX_PX, resolveWaveformBarHeight } =
    await import("../../src/components/dictation/waveformMath.ts");

  assert.match(recording, /relative shrink-0 overflow-hidden text-foreground/);
  assert.equal(
    (recording.match(/w-0\.5 rounded-full bg-current/g) || []).length,
    await totalWaveBars()
  );
  assert.equal(WAVEFORM_BAR_MIN_PX, 4);
  assert.equal(WAVEFORM_BAR_MAX_PX, 22);
  assert.equal(resolveWaveformBarHeight(0), WAVEFORM_BAR_MIN_PX);
  assert.equal(resolveWaveformBarHeight(1), WAVEFORM_BAR_MAX_PX);
  assert.ok(resolveWaveformBarHeight(0.15) > 20);
});

test("Live Transcript hands visual border ownership to the shared panel", async () => {
  const integrated = await renderPill("recording", true, "right", {
    variant: "panel",
    integratedWithPanel: true,
  });
  const standalone = await renderPill("recording", true);

  assert.match(integrated, /voice-pill-control/);
  assert.match(integrated, /data-integrated-with-panel="true"/);
  assert.doesNotMatch(standalone, /data-integrated-with-panel/);
});

test("Agent Mode uses the supplied mark, a purple perimeter glow, and a neutral waveform", async () => {
  const agentRecording = await renderPill("recording", true, "right", {
    variant: "panel",
    agentMode: true,
  });
  const normalRecording = await renderPill("recording", true, "right", { variant: "panel" });
  const { AGENT_MODE_PATH } = await import("../../src/components/dictation/voiceIdentityMorph.ts");
  const styles = readDictationStyles();

  assert.match(AGENT_MODE_PATH, /^M6\.14226 /);
  assert.match(styles, /--color-agent-brand:/);
  assert.doesNotMatch(styles, /\.voice-pill-control\[data-agent-mode="true"\]\s*\{/);
  // The agent glow is the same Signal treatment re-palettes to the agent's
  // purple around the brand color.
  assert.match(styles, /\.processing-signal-glow\[data-agent="true"\]\s*\{/);
  assert.match(styles, /--signal-core: #8787ff/);
  assert.doesNotMatch(styles, /agent-waveform-background|agent-waveform-highlight/);
  // Listening stays glow-free; the purple Signal glow is reserved for the
  // post-recording thinking state so "hearing you" and "working" read apart.
  assert.match(agentRecording, /class="processing-signal-glow" data-agent="true"/);
  assert.doesNotMatch(agentRecording, /data-active/);
  assert.match(agentRecording, /data-agent-mode="true"/);
  assert.match(agentRecording, /voice-identity-final-agent/);
  assert.ok(agentRecording.includes(`d="${AGENT_MODE_PATH}"`));
  assert.doesNotMatch(agentRecording, /agent-waveform-background|text-agent-brand/);
  assert.equal(
    (agentRecording.match(/w-0\.5 rounded-full bg-current/g) || []).length,
    await totalWaveBars()
  );
  assert.doesNotMatch(normalRecording, /agent-waveform-background/);
});

test("Agent thinking keeps the purple glow on the same persistent pill root", async () => {
  const agentThinking = await renderPill("thinking", false, "right", {
    agentMode: true,
  });

  assert.match(
    agentThinking,
    /class="processing-signal-glow" data-active="true" data-agent="true"/
  );
  assert.match(agentThinking, /<div [^>]*data-agent-mode="true"/);
  assert.match(agentThinking, /data-agent-beam-active="true"/);
});

test("the stable identity box stages the sound-bars into the Agent mark", async () => {
  const idle = await renderPill("idle", false);
  const agentThinking = await renderPill("thinking", false, "right", {
    agentMode: true,
  });

  assert.match(idle, /data-agent-mode="false"/);
  assert.match(idle, /voice-identity-morph-shell/);
  assert.match(idle, /voice-identity-morph-bar-left/);
  assert.match(idle, /voice-identity-morph-bar-center/);
  assert.match(idle, /voice-identity-morph-bar-right/);
  assert.match(agentThinking, /data-agent-mode="true"/);
  assert.match(agentThinking, /voice-identity-final-agent/);
});

test("the voice identity performs an actual SVG geometry morph", async () => {
  const { resolveVoiceIdentityMorphPaths } =
    await import("../../src/components/dictation/voiceIdentityMorph.ts");
  const listening = resolveVoiceIdentityMorphPaths(0);
  const midpoint = resolveVoiceIdentityMorphPaths(0.5);
  const agent = resolveVoiceIdentityMorphPaths(1);

  assert.notEqual(listening.shell, midpoint.shell);
  assert.notEqual(midpoint.shell, agent.shell);
  assert.notEqual(listening.centerBar, midpoint.centerBar);
  assert.notEqual(midpoint.centerBar, agent.centerBar);
  assert.equal(listening.agentOpacity, 0);
  assert.ok(midpoint.sparkOpacity > 0);
  assert.equal(agent.agentOpacity, 1);
  assert.equal(agent.constructionOpacity, 0);
});

test("the floating trigger keeps one circular bolt form across idle and listening", async () => {
  const footprint = await pillFootprints();
  const idle = await renderPill("idle", false);
  const listening = await renderPill("recording", true);
  const panel = await renderPill("idle", false, "right", { variant: "panel" });

  // Idle and listening differ only by the arcs: same surface, same glyph, same
  // footprint. This is the whole point of the redesign.
  for (const markup of [idle, listening]) {
    assert.match(markup, /data-bolt-surface="true"/);
    assert.match(markup, /voice-pill-bolt[^"\n]*scale-100 opacity-100/);
    assert.match(markup, footprint.idle);
  }

  // The old capsule UI must be gone from the floating trigger entirely: no
  // waveform bars, no divider padding, no identity mark standing in for a bolt.
  assert.doesNotMatch(listening, /rounded-full bg-current/);
  assert.doesNotMatch(listening, /voice-pill-control[^"\n]*pr-1/);
  assert.match(listening, /voice-pill-identity-logo[^"\n]*opacity-0/);

  // The docked panel variant still owns the identity mark that morphs to Agent.
  assert.doesNotMatch(panel, /data-bolt-surface/);
});

test("the live meter appears only while recording, and only on the floating trigger", async () => {
  const { WAVEFORM_BAR_MIN_PX } = await import("../../src/components/dictation/waveformMath.ts");
  const idle = await renderPill("idle", false);
  const listening = await renderPill("recording", true);
  const processing = await renderPill("processing", false);
  const panelListening = await renderPill("recording", true, "right", { variant: "panel" });

  // Idle collapses the shell to the bolt alone: no live flag, no bars.
  assert.doesNotMatch(idle, /data-live="true"/);
  assert.doesNotMatch(idle, /voice-pill-eq-bar/);
  assert.doesNotMatch(processing, /data-live="true"/);
  // The panel capsule keeps its own inline waveform and never grows the shell.
  assert.doesNotMatch(panelListening, /voice-trigger-shell/);

  // One fused component: the bolt and the bars live inside a single shell.
  assert.match(listening, /<span class="voice-trigger-shell" data-live="true"/);
  assert.match(listening, /voice-trigger-shell[^>]*>\s*<span class="voice-pill-glow-anchor"/);
  // Exact class: "voice-pill-eq-bars" on the container would match a loose one.
  assert.equal((listening.match(/class="voice-pill-eq-bar"/g) || []).length, 13);
  // Bars start at rest; the rAF loop raises them from real input.
  assert.match(listening, new RegExp(`height:${WAVEFORM_BAR_MIN_PX}px`));

  // The bolt is untouched by the meter: same surface, same glyph, same size.
  const footprint = await pillFootprints();
  assert.match(listening, /data-bolt-surface="true"/);
  assert.match(listening, /voice-pill-bolt[^"\n]*scale-100 opacity-100/);
  assert.match(listening, footprint.idle);
});

test("bar height tracks input amplitude across the speech range", async () => {
  const { resolveWaveformBarHeight, WAVEFORM_BAR_MIN_PX, WAVEFORM_BAR_MAX_PX } =
    await import("../../src/components/dictation/waveformMath.ts");

  // Silence rests at the floor and loud voicing reaches the ceiling.
  assert.equal(resolveWaveformBarHeight(0), WAVEFORM_BAR_MIN_PX);
  assert.equal(resolveWaveformBarHeight(1), WAVEFORM_BAR_MAX_PX);

  // The point of a live meter is visible variation *within* conversational
  // speech (RMS ~0.02-0.15), not just at the extremes: a mapping that
  // saturated early would look like a canned animation.
  const speech = [0.02, 0.04, 0.06, 0.09, 0.12, 0.15];
  // Explicit arity: passing this straight to map would feed the index in as a
  // second argument if the signature ever grows one again.
  const heights = speech.map((rms) => resolveWaveformBarHeight(rms));
  for (let i = 1; i < heights.length; i += 1) {
    assert.ok(
      heights[i] > heights[i - 1],
      `louder input must give a taller bar (${speech[i]} vs ${speech[i - 1]})`
    );
  }
  // And the range actually spans a visible portion of the lane.
  const lane = WAVEFORM_BAR_MAX_PX - WAVEFORM_BAR_MIN_PX;
  assert.ok(
    heights[heights.length - 1] - heights[0] > lane * 0.4,
    "conversational speech must move the bars across a visible share of the lane"
  );
});

test("the bolt treatment supplies its own contrast and keeps the glyph still", async () => {
  const css = readDictationStyles();

  // The trigger sits on an arbitrary desktop, so it cannot inherit surface tokens.
  assert.match(css, /\.voice-pill-control\[data-bolt-surface="true"\]/);
  assert.match(css, /--bolt-center:\s*#8fe0ff/);
  assert.match(css, /--bolt-core:\s*#2196f3/);
  assert.match(css, /--bolt-edge:\s*#0a3d8f/);
  assert.match(css, /animation:\s*voice-pill-breathe/);

  // All motion lives in the glow and arcs; a moving bolt would not stay legible.
  assert.match(css, /@keyframes voice-pill-breathe/);
  assert.doesNotMatch(css, /voice-pill-bolt\s*\{[^}]*animation/);

  // Every earlier active-state treatment must be gone, not merely unused.
  assert.doesNotMatch(css, /voice-pill-listening-ring/);
  assert.doesNotMatch(css, /@keyframes voice-pill-ping/);
  assert.doesNotMatch(css, /voice-pill-arc/);

  // The meter shell and its gradient bars.
  assert.match(css, /\.voice-trigger-shell\[data-live="true"\]\s*\{/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /linear-gradient\(to top, #2ea3ff, #9fe6ff\)/);
  assert.match(css, /transition:\s*height 100ms/);

  // Reduced motion still has to distinguish resting from live.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("the live meter auto-ranges to the mic's own gain", async () => {
  const { createLiveMeterRange, resolveMeterBarHeight, WAVEFORM_BAR_MIN_PX } =
    await import("../../src/components/dictation/waveformMath.ts");

  // Measured on a real USB interface: idle RMS sits at ~0.0055 and speech peaks
  // well under the 0.02 the fixed curve assumes. With that curve every bar
  // lands within ~2px of the floor, which is the "static dashes" report.
  const quietMic = [0.0055, 0.0055, 0.012, 0.03, 0.045, 0.02, 0.008, 0.0055];
  const norm = createLiveMeterRange();
  const heights = quietMic.map((rms) => resolveMeterBarHeight(norm(rms), 26));

  // Silence must rest exactly at the floor — a meter that idles high reads as
  // broken just as much as one that never moves.
  assert.equal(heights[0], WAVEFORM_BAR_MIN_PX);
  assert.equal(heights[1], WAVEFORM_BAR_MIN_PX);

  // Speech on this same quiet mic must reach the top of the lane.
  assert.equal(Math.max(...heights), 26);

  // And the strip must show real variation, not one step.
  const distinct = new Set(heights.map((h) => Math.round(h)));
  assert.ok(distinct.size >= 5, `expected a varied strip, got ${[...distinct].join(",")}`);
});

test("silence never amplifies hiss to full scale", async () => {
  const { createLiveMeterRange, resolveMeterBarHeight, WAVEFORM_BAR_MIN_PX } =
    await import("../../src/components/dictation/waveformMath.ts");
  const norm = createLiveMeterRange();

  // A naive peak-normaliser would divide by its own noise and paint a full
  // dancing strip in a silent room; the minimum-peak floor prevents that.
  for (let i = 0; i < 50; i += 1) {
    const h = resolveMeterBarHeight(norm(0.0055 + Math.sin(i) * 0.0003), 26);
    assert.ok(h < WAVEFORM_BAR_MIN_PX + 2, `silence must stay at rest, got ${h}px`);
  }
});
