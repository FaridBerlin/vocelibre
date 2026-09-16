# Cloud & account removal — handoff

**Written for: the next Claude Code session (paste this file to resume).**
Working doc on branch `feat/remove-cloud-and-accounts`. Delete this file when the
work lands.

---

## The goal (user's words)

> "no account, no cloud, and also in the code without any connection to
> OpenWhispr… the user doesn't have to sign in or log in or anything, nothing
> complicated"

User chose **"Cut all cloud entirely"** over keeping BYOK. So:

**Remove** — OpenWhispr accounts/sign-in, `*.openwhispr.com` endpoints, cloud
transcription, cloud LLM, **BYOK API keys for all cloud providers**, team
spaces, note sharing, enterprise SSO/SCIM/policy, billing, referrals, cloud
sync, MCP/CLI/public-API cards.

**Keep** — local Whisper/Parakeet/Cohere, local llama.cpp LLM, `lan`
(self-hosted: user's own server, no account, no internet), local notes + FTS5 +
Qdrant semantic search, local diarization, meeting transcription, Google/MS/
Apple calendar OAuth (third-party, not OpenWhispr — explicitly kept).

> `lan`/self-hosted was kept deliberately even though the chosen option listed
> "8 inference providers" removed — it is not cloud, and cutting it orphans the
> `examples/custom-asr-shim/` the README links. User has not objected; confirm
> if it comes up.

---

## State: ~40% done

Branch `feat/remove-cloud-and-accounts`, **5 commits, nothing pushed**:

```
2c49cba4 build: fetch native helpers from this repo's releases, not upstream's
e5fe0628 refactor: collapse inference to local/self-hosted and drop the account flow
51dd23d5 chore: fix fork metadata, rename fallout, and document the native-ABI split
9e035a4b ci: run tests on pushes to main and stop the permanently-red gates
fd321cf7 fix: point the auto-updater at VoceLibre's own release feed
```

### Gates right now

| Gate | State |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run format:check` | clean |
| `npm test` | **16 failing** (all the not-yet-removed policy/BYOK surface) + 1 pre-existing |

**Before running tests:** `npm run rebuild:node`. Before running the app again:
`npm run rebuild:electron`. (better-sqlite3 is built for Electron's ABI by
`postinstall`; the suite runs under plain Node. The two are mutually exclusive —
see README "Development".)

---

## The method that worked — reuse it

Narrow a type, let `tsc` produce the worklist, fix top-down so typecheck stays
green. Narrowing `InferenceMode` to `"local" | "self-hosted"` surfaced 96 errors
across 17 files and caught every routing decision. **Do the same for auth**:
delete `useAuth`/`isSignedIn` at the source and let the compiler find all 115
call sites, rather than grepping.

Work **top-down** (UI → hooks/stores → services). Deleting leaves first breaks
every caller at once; deleting callers first leaves orphans that still compile.

---

## Next: Stage 3 — auth, sync, spaces, enterprise

Largest remaining chunk. Suggested order:

### 3a. Kill the policy system (clears ~10 of the 16 failing tests)

Org policy arrived with the enterprise workspace; with no workspace it can never
be `managed`. `selectPolicyEffectiveSettings` is already a no-op and
`policyRules` already ignores BYOK/enterprise allowlists — finish the job.

- Delete `src/stores/policyStore.ts` (277), `src/stores/policyRules.ts` (465),
  `src/hooks/usePolicy.ts`, `usePolicyModeOptions`
- Delete `src/helpers/workspacePolicyManager.js`, `workspacePolicyCache.js`
- Callers assume "allowed": `isAgentAllowed` → `true`,
  `isModeAllowedByPolicy` → `true`, `isScreenContextAllowed` → follow the
  user setting only
- Delete `test/helpers/policyRules.test.js`,
  `test/helpers/transcriptionRoute.test.js` (policy floor test)
- Trim `test/services/reasoningServiceEnforcement.test.js` to the
  non-policy cases (the self-hosted endpoint + key-isolation tests are
  **still valuable — keep them**)

### 3b. Delete auth + account modules

```
src/lib/auth.ts (330)              src/hooks/useAuth.ts (247)
src/hooks/useUsage.ts (261)        src/services/cloudApi.ts (102)
src/lib/authRequestContext.ts      src/lib/emailAuthDiscovery.ts
src/lib/authAccountScope.ts        src/lib/upsell.ts
```
Components: `SignInDialog`, `AuthenticationStep`, `CompactAuthenticationFlow`,
`EmailVerificationStep`, `ForgotPasswordView`, `ReauthenticationScreen`,
`AcceptInvitationModal`, `JoinYourTeamModal`, `settings/ProfileSection`.

`AppRouter.jsx` is **already auth-free** — done in `e5fe0628`.

### 3c. Delete sync / spaces / workspaces / enterprise / referral

```
services/  SyncService.ts (2726!)  SpacesService.ts  spaceActions.ts
           spaceActionsCore.ts     accountSpaceValidation.ts
           WorkspacesService.ts    WorkspaceApiKeysService.ts
           EnterpriseIdentityService.ts   syncPassPolicy.ts (361)
stores/    workspaceStore.ts  enterpriseIdentityStore.ts
lib/       spacePermissions  workspaceSelection  workspaceBilling
           billingPortalError  teamSpacesCapability  spaceRosterCache
helpers/   cloudSyncGuards.js  enterpriseAiProviders.js
           enterpriseIdentityManager.js  enterpriseManagedConfig.mjs
           enterpriseProviderErrors.js  sessionHeaders.js
           transcriptionAuth.js
components/  EnterpriseSection  EnterpriseProviderConfig  CreateWorkspaceDialog
             ReferralModal  ReferralDashboard  referral-cards/
             IntegrationsView  McpIntegrationCard  CliIntegrationCard
             settings/{EnterpriseCheckoutDialog,EnterpriseConsoleRow,
                       WorkspaceBillingCard,WorkspaceBillingOverview,
                       WorkspaceDeveloperTab,WorkspaceMembersTab,
                       WorkspaceSection,WorkspaceTeamsTab}
notes/     ShareNoteDialog  SpaceSyncToastListener  (+ spaces UI in SpacesTree)
```
Keep local notes and folders. Only cloud sync + sharing + spaces go.

### 3d. Settings + sidebar

- `SettingsSectionType`: drop `"account" | "plansBilling" | "workspace"`
- `ControlPanelView`: drop `"integrations"` (MCP/CLI/API are all cloud)
- `src/components/SettingsPage.tsx` is 4,777 lines — expect a long tail

### 3e. BYOK secrets

- `src/config/secretKeys.js` — `BYOK_API_KEYS` is the single source of truth;
  emptying it cascades to `environment.js`, `ipcHandlers.js`, settings store
- `preload.js` mirrors the tuples inline as `BYOK_KEY_BRIDGES` — **keep in
  sync**, guarded by `test/helpers/secretKeys.test.js`
- Delete cloud providers under `src/services/ai/inferenceProviders/`:
  `anthropic corti enterprise gemini groq openai openwhispr tinfoil`
  → registry keeps only `local` + `lan`
- `src/models/modelRegistryData.json` → `cloudProviders: []`
- Delete `corti*.js`, `src/config/retiredCloudModels.ts`

### 3f. Main process

`src/helpers/ipcHandlers.js` (11,653 lines) — remove these handler families:
```
auth-clear-session  auth-get-token  auth-get-token-state  auth-set-token
cloud-agent-stream-{start,cancel,chunk,end,error}
cloud-api-request  cloud-billing-portal  cloud-checkout  cloud-health-check
cloud-preview-switch  cloud-reason  cloud-reason-cancel  cloud-streaming-usage
cloud-switch-plan  cloud-transcribe  cloud-transcribe-cancel  cloud-usage
```
Plus the matching `preload.js` bridges, `main.js:771` (`auth.openwhispr.com`
session header wiring) and the `sessionHeaders.js` allowlist.

### 3g. i18n — last, once nothing references the keys

10 locales in `src/locales/*/translation.json`. Whole top-level blocks to drop:
`auth`, `workspaces`, `referral`, `upgradePrompt`. Plus cloud keys scattered
under `settingsPage.*`, `notes.upload.*`, `onboarding.*`.
`npm run i18n:check` enforces parity across all 10 — run it after every pass.

### 3h. Docs

- README: feature list still advertises team spaces, enterprise controls,
  public API/MCP, cloud sync, and links `docs.openwhispr.com` for every doc
- CLAUDE.md: the fork section's "Still genuinely upstream-owned" list should
  shrink to nothing as endpoints are deleted

---

## Verification

22 `*.openwhispr.com` references in live code today (excluding `src/locales`).
**Target: 0.**

```bash
grep -rn "openwhispr\.com" --include="*.ts" --include="*.tsx" --include="*.js" \
  --exclude-dir=node_modules src/ main.js preload.js | grep -v "^src/locales"

grep -rn "isSignedIn" --include="*.ts" --include="*.tsx" src/ | wc -l   # 115 -> 0
```

Do **not** rename these — they are load-bearing identifiers, not branding
(see the rename policy in CLAUDE.md): `com.openwhispr.App` (D-Bus),
`~/.cache/openwhispr/`, `openwhispr://`, `OPENWHISPR_LOG_LEVEL`, the gsettings
keybinding paths, `COMPONENT_NAME = "openwhispr"` in `kdeShortcut.js`.

---

## Two loose ends from earlier work

1. **`test/helpers/uiLanguageStartup.test.js`** — "fresh Chinese browser locale
   survives settings hydration" fails with `transport was disconnected, cannot
   call "fetchModule"` from Vite 8's `SSRCompatModuleRunner`. **Pre-existing**,
   reproduces on a clean tree. Ruled out: the `navigator` stub, a module that
   fails to load, an error hidden by the harness's `logLevel: "silent"`.
   Suspect the harness's deprecated `ssrLoadModule` path under Vite 8.
   CI now runs on pushes to `main`, so main stays red until this is fixed or
   quarantined.

2. **KDE stale registration** — I flagged this as a leak, then softened it.
   KGlobalAccel most likely matches on `componentUnique` + `actionUnique` (both
   unchanged), making re-registration an in-place update with no leak. Needs
   verifying on a real KDE box; don't "fix" it from a guess.

3. **Native helper releases** — `FaridBerlin/vocelibre` has **0 releases**, so
   the six repointed download scripts find nothing and fail soft. Run each
   `build-*` workflow once from the Actions tab to populate them. Until then:
   push-to-talk → tap mode, mic detection → polling, system audio → Chromium
   loopback. whisper.cpp deliberately still points upstream (ggml-org publishes
   no binary assets at all — repointing breaks local transcription everywhere).
