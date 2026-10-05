const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../src/components/onboarding/flow.ts");

test("the route covers dictation setup only", async () => {
  const { getOnboardingRoute } = await load();
  // No account, assistant, notes or calendar steps: what a first dictation
  // needs, then a practice run, then the app.
  assert.deepEqual(getOnboardingRoute(), [
    "permissions",
    "languages",
    "dictation-hotkey",
    "local-dictation",
    "dictation-demo",
  ]);
});

test("the route always grants permissions before capturing a hotkey", async () => {
  const { getOnboardingRoute } = await load();
  // finalizeOnboarding registers the dictation hotkey, so the mic grant and the
  // key the user is getting must both come first.
  const route = getOnboardingRoute();
  assert.ok(route.indexOf("permissions") < route.indexOf("dictation-hotkey"));
});

test("a speech model is set up before the dictation demo", async () => {
  const { getOnboardingRoute } = await load();
  // The demo transcribes with the local model, so it must exist by then.
  const route = getOnboardingRoute();
  assert.ok(route.indexOf("local-dictation") < route.indexOf("dictation-demo"));
});

test("the demo is the last step, so finishing it completes onboarding", async () => {
  const { getNextOnboardingStep, getOnboardingRoute } = await load();
  assert.equal(getNextOnboardingStep("dictation-demo", getOnboardingRoute()), null);
});

test("versioned sessions reject malformed or old data", async () => {
  const { createOnboardingSession, parseOnboardingSession } = await load();
  assert.equal(parseOnboardingSession(null), null);
  assert.equal(parseOnboardingSession("not json"), null);
  assert.equal(parseOnboardingSession('{"version":1,"currentStepId":"auth"}'), null);
  // A v3 session parked on a removed step (it could stall on "notes") restarts.
  assert.equal(parseOnboardingSession('{"version":3,"currentStepId":"notes","history":[]}'), null);

  const session = createOnboardingSession();
  assert.deepEqual(parseOnboardingSession(JSON.stringify(session)), session);
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

test("route helpers walk the route and clamp unknown steps", async () => {
  const { getNextOnboardingStep, getOnboardingRoute, reconcileStepWithRoute } = await load();
  const route = getOnboardingRoute();
  assert.equal(getNextOnboardingStep("permissions", route), "languages");
  assert.equal(getNextOnboardingStep("dictation-hotkey", route), "local-dictation");
  assert.equal(reconcileStepWithRoute("languages", route), "languages");
  assert.equal(reconcileStepWithRoute("notes", route), "permissions");
});

test("progress counts every step the user is shown, once each", async () => {
  const { getOnboardingProgress, getOnboardingRoute } = await load();
  const route = getOnboardingRoute();

  // permissions renders in a compact frame with no footer, so it carries no row
  // and must not inflate the total.
  assert.equal(getOnboardingProgress("permissions", route), null);

  const counted = route.filter((stepId) => getOnboardingProgress(stepId, route) !== null);
  assert.deepEqual(
    counted.map((stepId) => getOnboardingProgress(stepId, route).index),
    counted.map((_, index) => index)
  );
  assert.deepEqual(getOnboardingProgress("languages", route), { index: 0, total: 4 });
  assert.deepEqual(getOnboardingProgress("dictation-demo", route), { index: 3, total: 4 });
});
