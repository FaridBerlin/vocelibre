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

## State: ~75% done (updated 2026-09-17)

Branch `feat/remove-cloud-and-accounts`, **nothing pushed**.

Day 2 removed the whole renderer-side cloud surface: **~135 files deleted**.
Auth, sync, spaces, teams, workspaces, enterprise, billing, referrals, cloud
analytics/insights, the 11 cloud API service wrappers, the 8 cloud inference
providers, and the cloud-backed web-search tool are all gone. `isSignedIn`
went 115 → 5 (the survivors are inert locals), `*.openwhispr.com` 22 → 4.

### Gates right now

| Gate | State |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run format:check` | clean |
| `npm test` | see below — 35 test files for deleted features were removed; re-run to get the current count |

> The suite got noticeably slower during day 2 (minutes, not ~45s). Worth a
> look: probably vite-harness tests retrying on modules that no longer resolve.

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

## Done on day 2

- **3a policy**: partially — `policyRules`/`policyStore` still exist but every
  predicate is inert (no workspace can ever be managed). Full deletion still
  pending; 40 files still import them.
- **3b auth**: done. `lib/auth`, `useAuth`, `authRequestContext`,
  `authAccountScope`, `emailAuthDiscovery`, `cloudApi`, `useUsage`,
  `useWorkspace`, and every sign-in / reauth / invitation component are gone.
  `settingsStore.isSignedIn` and its setter are gone.
- **3c sync/spaces/enterprise/referral**: done. `SyncService` (2,726 lines),
  `SpacesService`, `spaceActions*`, `Workspaces*`, `EnterpriseIdentityService`,
  `syncPassPolicy`, `workspaceStore`, `enterpriseIdentityStore`, all billing /
  referral / team / workspace components, plus the 11 cloud API wrappers
  (`NotesService`, `FoldersService`, …) and `InsightsView` + `AnalyticsService`.
- **3d settings/sidebar**: done. Account / plansBilling / workspace sections
  removed from `SettingsPage` and `SettingsModal`; `ControlPanelView` lost
  `insights` and `integrations`; the sidebar's upsell banners, referral row and
  account footer are gone.
- **3e providers**: the 8 cloud inference providers are deleted and the registry
  is `{ local, lan }`. **BYOK secret keys are NOT done** — see below.
- Notes kept working throughout: `noteStore` lost its sync/conflict wiring, and
  `renameSpace`/`deleteSpace` were reimplemented as local SQLite mutations.
- `oauthLoopbackFlow.js` now serves its own OAuth result page instead of
  redirecting the browser to `openwhispr.com/auth/desktop-callback`. Calendar
  OAuth therefore no longer touches an OpenWhispr host at all.

## Next — what is actually left

### A. Main process (biggest remaining piece)

`src/helpers/ipcHandlers.js` (11.6k lines) still registers every cloud handler:
```
auth-clear-session  auth-get-token  auth-get-token-state  auth-set-token
cloud-agent-stream-{start,cancel,chunk,end,error}
cloud-api-request  cloud-billing-portal  cloud-checkout  cloud-health-check
cloud-preview-switch  cloud-reason  cloud-reason-cancel  cloud-streaming-usage
cloud-switch-plan  cloud-transcribe  cloud-transcribe-cancel  cloud-usage
agent-web-search   (proxies api.openwhispr.com with auth)
```
Nothing in the renderer calls them any more, so the app runs — but they are the
last live code paths to OpenWhispr. Remove them plus:
- the matching `preload.js` bridges
- `src/helpers/sessionHeaders.js` (the `auth./api.openwhispr.com` allowlist) and
  its two importers (`main.js:304`, `ipcHandlers.js:174`)
- `main.js` `getAuthUrl()` (~line 771) and `getOauthCookieName()`
- `ipcHandlers.js` `getAuthUrl()` / `getApiUrl()` (~line 5612)
- helpers: `cloudSyncGuards.js`, `transcriptionAuth.js`, `enterprise*.js`,
  `workspacePolicy*.js`, `corti*.js`

**The 4 remaining `*.openwhispr.com` references are all here.**

### B. BYOK secrets (3e, unfinished)

- `src/config/secretKeys.js` — empty `BYOK_API_KEYS`; cascades to
  `environment.js`, `ipcHandlers.js`, settings store
- `preload.js` mirrors them inline as `BYOK_KEY_BRIDGES` — keep in sync,
  guarded by `test/helpers/secretKeys.test.js`
- `src/models/modelRegistryData.json` → `cloudProviders: []`
- delete `src/config/retiredCloudModels.ts`

### C. Finish the policy system (3a)

Delete `policyStore.ts`, `policyRules.ts`, `hooks/usePolicy.ts`,
`usePolicyModeOptions`, `workspacePolicyManager.js`, `workspacePolicyCache.js`.
Callers assume allowed (`isAgentAllowed` → true, `isModeAllowedByPolicy` → true,
`isScreenContextAllowed` → the user setting alone). ~40 importers, but most just
call one predicate.

### D. The 5 inert `isSignedIn` survivors

`policyRules.ts:416`, `TranscriptionModelPicker.tsx:391/606/622`. They are
hard-coded `false` locals; they disappear with C.

### E. i18n, then docs

10 locales in `src/locales/*/translation.json`. Whole top-level blocks to drop:
`auth`, `workspaces`, `referral`, `upgradePrompt`. Plus cloud keys under
`settingsPage.*`, `notes.upload.*`, `onboarding.*`.
`npm run i18n:check` enforces parity across all 10 — run after every pass.

README still advertises team spaces, enterprise controls, public API/MCP and
cloud sync, and links `docs.openwhispr.com` for every doc.

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
