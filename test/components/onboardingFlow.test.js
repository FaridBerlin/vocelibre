const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../src/components/onboarding/flow.ts");

test("the single route walks permissions through notes", async () => {
  const { getOnboardingRoute } = await load();
  // Accounts were removed, so there is one route for everyone.
  assert.deepEqual(getOnboardingRoute({ setupMode: null, agentAllowed: true }), [
    "permissions",
    "languages",
    "use-cases",
    "dictation-hotkey",
    "activation-mode",
    "dictation-demo",
    "assistant-hotkey",
    "assistant-demo",
    "notes",
  ]);
});

test("the route always grants permissions before capturing a hotkey", async () => {
  const { getOnboardingRoute } = await load();
  // finalizeOnboarding registers the dictation hotkey on every path, so the mic
  // grant and the key the user is getting must both come first.
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: true });
  assert.ok(route.indexOf("permissions") < route.indexOf("dictation-hotkey"));
});

test("activation mode setup follows shortcut capture", async () => {
  const { getOnboardingRoute } = await load();
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: true });
  assert.equal(route[route.indexOf("dictation-hotkey") + 1], "activation-mode");
});

test("policy removes assistant states", async () => {
  const { getOnboardingRoute } = await load();
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: false });
  assert.equal(route.includes("assistant-hotkey"), false);
  assert.equal(route.includes("assistant-demo"), false);
  assert.equal(route.at(-1), "notes");
});

test("choosing local setup appends its two stages", async () => {
  const { getOnboardingRoute } = await load();
  assert.deepEqual(
    getOnboardingRoute({ setupMode: "local", agentAllowed: true }).slice(-3),
    ["notes", "local-dictation", "local-assistant"]
  );
  // Without the agent the assistant stage drops with it.
  assert.deepEqual(getOnboardingRoute({ setupMode: "local", agentAllowed: false }).slice(-2), [
    "notes",
    "local-dictation",
  ]);
});

test("versioned sessions reject malformed or old data", async () => {
  const { createOnboardingSession, parseOnboardingSession } = await load();
  assert.equal(parseOnboardingSession(null), null);
  assert.equal(parseOnboardingSession("not json"), null);
  assert.equal(parseOnboardingSession('{"version":1,"currentStepId":"auth"}'), null);

  const session = createOnboardingSession();
  assert.deepEqual(parseOnboardingSession(JSON.stringify(session)), session);

  const legacyV2 = { ...session };
  delete legacyV2.selfHostedRequested;
  assert.equal(parseOnboardingSession(JSON.stringify(legacyV2)).selfHostedRequested, false);
  assert.equal(
    parseOnboardingSession(JSON.stringify({ ...session, selfHostedRequested: "yes" })),
    null
  );
});

test("an explicit restart clears every persisted route choice", async () => {
  const { resetOnboardingProgress } = await load();
  const values = new Map([
    ["onboardingSessionV2", '{"currentStepId":"permissions"}'],
    ["onboardingCompleted", "true"],
    ["authenticationSkipped", "true"],
    ["skipAuth", "true"],
  ]);
  const storage = {
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };

  resetOnboardingProgress(storage);

  assert.equal(values.get("onboardingCurrentStep"), "0");
  assert.equal(values.has("onboardingSessionV2"), false);
  assert.equal(values.has("onboardingCompleted"), false);
  assert.equal(values.has("authenticationSkipped"), false);
  assert.equal(values.has("skipAuth"), false);
});

test("legacy numeric steps migrate conservatively", async () => {
  const { migrateLegacyOnboardingStep } = await load();
  // Everything before the old hotkey index predates the current permissions
  // step, so those saves resume at permissions rather than past it.
  assert.equal(migrateLegacyOnboardingStep(null), "permissions");
  assert.equal(migrateLegacyOnboardingStep("0"), "permissions");
  assert.equal(migrateLegacyOnboardingStep("1"), "permissions");
  assert.equal(migrateLegacyOnboardingStep("2"), "permissions");
  assert.equal(migrateLegacyOnboardingStep("4"), "dictation-hotkey");
  assert.equal(migrateLegacyOnboardingStep("999"), "local-dictation");
});

test("an off-route assistant step clamps to its neighbour, not the end of the route", async () => {
  const { getOnboardingRoute, reconcileStepWithRoute } = await load();
  // agentAllowed false is what a failed policy fetch produces, and it drops both
  // assistant steps. Clamping to route.at(-1) would skip intermediate steps.
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: false });
  assert.equal(route.includes("assistant-hotkey"), false);
  assert.equal(reconcileStepWithRoute("assistant-hotkey", route), "dictation-demo");
  assert.equal(reconcileStepWithRoute("assistant-demo", route), "notes");

  const agentRoute = getOnboardingRoute({ setupMode: null, agentAllowed: true });
  assert.equal(reconcileStepWithRoute("assistant-hotkey", agentRoute), "assistant-hotkey");
});

test("route helpers recover from ineligible steps", async () => {
  const { getNextOnboardingStep, getOnboardingRoute, reconcileStepWithRoute } = await load();
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: false });
  assert.equal(reconcileStepWithRoute("local-assistant", route), "notes");
  assert.equal(getNextOnboardingStep("permissions", route), "languages");
  assert.equal(getNextOnboardingStep("notes", route), null);
});

test("progress counts every step the user is shown, once each", async () => {
  const { getOnboardingProgress, getOnboardingRoute } = await load();
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: true });

  // permissions renders in a compact frame with no footer, so it carries no row
  // and must not inflate the total.
  assert.equal(getOnboardingProgress("permissions", route), null);

  const counted = route.filter((stepId) => getOnboardingProgress(stepId, route) !== null);
  assert.deepEqual(
    counted.map((stepId) => getOnboardingProgress(stepId, route).index),
    counted.map((_, index) => index)
  );
  assert.deepEqual(getOnboardingProgress("languages", route), { index: 0, total: 8 });
  assert.deepEqual(getOnboardingProgress("notes", route), { index: 7, total: 8 });
});

test("progress total tracks the conditional parts of the route", async () => {
  const { getOnboardingProgress, getOnboardingRoute } = await load();

  // Dropping the assistant pair shortens the row rather than leaving two dots
  // that can never fill.
  const noAgent = getOnboardingRoute({ setupMode: null, agentAllowed: false });
  assert.equal(getOnboardingProgress("languages", noAgent).total, 6);
  assert.deepEqual(getOnboardingProgress("notes", noAgent), { index: 5, total: 6 });

  // Committing to local setup appends the provider pair, so the row grows by two
  // and the last provider step is what fills it.
  const local = getOnboardingRoute({ setupMode: "local", agentAllowed: true });
  assert.deepEqual(getOnboardingProgress("notes", local), { index: 7, total: 10 });
  assert.deepEqual(getOnboardingProgress("local-assistant", local), { index: 9, total: 10 });
});

test("an off-route step has no position to report", async () => {
  const { getOnboardingProgress, getOnboardingRoute } = await load();
  const route = getOnboardingRoute({ setupMode: null, agentAllowed: false });
  assert.equal(getOnboardingProgress("assistant-demo", route), null);
});
