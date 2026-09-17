const test = require("node:test");
const assert = require("node:assert/strict");

// Mirrors WindowManager.setMainWindowInteractivity. Electron ignores the
// `forward` option on Linux, so a pill window put back into click-through never
// receives another mouseenter — and the renderer only re-enables capture from
// the pill's onMouseEnter. The first mouseleave after a drag would therefore
// latch the pill click-through for the rest of the session, leaving it
// undraggable. Same root cause as the meeting card in #1456.
const setMainWindowInteractivity = (platform, win, shouldCapture) => {
  if (platform === "win32") {
    win.setIgnoreMouseEvents(false);
    return;
  }
  if (platform === "linux") {
    win.setIgnoreMouseEvents(false);
    return;
  }
  if (shouldCapture) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
};

const harness = () => {
  const calls = [];
  return {
    calls,
    win: { setIgnoreMouseEvents: (ignore, opts) => calls.push({ ignore, opts }) },
  };
};

// The hover cycle the renderer drives: capture on mouseenter, release on
// mouseleave. On Linux the release is what used to strand the pill.
const hoverCycle = (platform, win) => {
  setMainWindowInteractivity(platform, win, true);
  setMainWindowInteractivity(platform, win, false);
};

for (const platform of ["linux", "win32"]) {
  test(`${platform} never puts the pill window into click-through`, () => {
    const { calls, win } = harness();

    hoverCycle(platform, win);

    assert.ok(calls.length > 0, "the window is still told what to do");
    assert.ok(
      calls.every((call) => call.ignore === false),
      `${platform} must never call setIgnoreMouseEvents(true) for the pill`
    );
  });

  test(`${platform} leaves the pill draggable after repeated hover cycles`, () => {
    const { calls, win } = harness();

    // The reported bug: the pill could be dragged once, then never again.
    for (let i = 0; i < 3; i += 1) hoverCycle(platform, win);

    assert.equal(
      calls.filter((call) => call.ignore === true).length,
      0,
      "no cycle may latch the window click-through"
    );
  });
}

test("macOS keeps the click-through behaviour that forwarding supports there", () => {
  const { calls, win } = harness();

  hoverCycle("darwin", win);

  assert.deepEqual(calls, [
    { ignore: false, opts: undefined },
    { ignore: true, opts: { forward: true } },
  ]);
});
