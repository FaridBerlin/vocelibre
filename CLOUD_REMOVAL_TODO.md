# Cloud & account removal — complete

**Written for: whoever picks this branch up next.**
Branch `feat/remove-cloud-and-accounts`, **not pushed**. Delete this file once
the branch merges.

---

## What was asked

> "no account, no cloud, and also in the code without any connection to
> OpenWhispr… the user doesn't have to sign in or log in or anything, nothing
> complicated"

Scope chosen: **cut all cloud entirely**, including BYOK provider keys.

**Kept:** local Whisper/Parakeet/Cohere, local llama.cpp, `lan`/self-hosted
(the user's own OpenAI-compatible server — no account, no internet), local
notes + FTS5 + Qdrant semantic search, local diarization, meeting
transcription, and Google/Microsoft/Apple calendars.

---

## Result

`main...HEAD`: **289 files changed, +3,699 / −53,433**.

| Check | Before | After |
| --- | --- | --- |
| `*.openwhispr.com` in live code | 22 | **0** |
| `isSignedIn` references | 115 | **0** |
| `ipcHandlers.js` | 11,653 lines | ~8,400 |
| `main.js` | 1,947 lines | ~1,640 |
| translation keys | 2,851 | 2,408 |

Gates: typecheck, lint, format, `i18n:check` and `build:renderer` all clean.

---

## Things worth knowing

**`tsc` does not typecheck plain `.js`/`.jsx`.** Twice a green typecheck hid
dead imports that only `npm run build:renderer` caught (`audioManager.js`,
`App.jsx`, the dictation-inference helpers). Run the build after any deletion
pass — it is part of the gate list for a reason.

**Calendars nearly lost their UI.** Deleting `IntegrationsView` took the
post-onboarding calendar connect/disconnect screen with it. Its calendar half
is now `CalendarsView` with its own sidebar entry. If you delete more UI, check
whether a kept feature was renting space in it.

**Spaces kept rename/delete.** `spaceActions` was a cloud wrapper, but the
local SQLite mirror it wrote through already existed, so `renameSpace` /
`deleteSpace` were reimplemented on top of it rather than dropped.

**Before running tests:** `npm run rebuild:node`. Before running the app:
`npm run rebuild:electron`. The two ABIs are mutually exclusive.

---

## Known loose ends

0. **Two regressions the tests caught**, both now fixed and worth knowing about
   if you touch self-hosted routing: `custom` lost its provider registry entry
   when the OpenAI provider was deleted, and the ambient `cleanupRemoteUrl`
   fallback could override an endpoint passed on the call (which would have
   sent another scope's request, plus the shared cleanup key, to the cleanup
   endpoint). `test/services/reasoningServiceEnforcement.test.js` is what
   guards this — keep it.

1. **The suite got slower** during this work (~10 min vs ~45s before), even
   though it now runs fewer tests. Not investigated. The pre-existing
   `uiLanguageStartup` Vite-harness failure stopped reproducing somewhere along
   the way, which may be related.

3. **Native helper releases** — `FaridBerlin/vocelibre` still has 0 releases,
   so the six repointed `scripts/download-*.js` find nothing and fail soft.
   Run each `build-*` workflow once from the Actions tab. Until then:
   push-to-talk falls back to tap mode, mic detection to polling, system audio
   to the Chromium loopback.

4. **whisper.cpp still points upstream** on purpose: `ggml-org/whisper.cpp`
   publishes no binary assets, so repointing breaks local transcription
   everywhere. Cutting that tie needs a whisper.cpp fork of its own.

5. **~117 translation keys** still read as unreferenced by a source grep. The
   `models.descriptions.*` ones are false positives (they are named from
   `modelRegistryData.json`, which the scanner does not read). The rest are
   small leftovers under `sidebar`, `common`, `controlPanel`, `settingsModal`.

6. **Identifiers keep the `openwhispr` spelling** — D-Bus name, gsettings
   paths, `~/.cache/openwhispr/`, `openwhispr://`, `OPENWHISPR_LOG_LEVEL`. See
   the rename policy in CLAUDE.md. Do not "finish the rename".
