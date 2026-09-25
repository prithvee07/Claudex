# Changelog

This file records the changes made during the current contribution work. It is
not a reconstruction of earlier project releases.

## Unreleased

### Fixed

- **Missing analytics stub exports** (`src/services/analytics/growthbook.ts`):
  added async `getDynamicConfig_BLOCKS_ON_INIT`, which returns the supplied
  default value, and async `checkSecurityRestrictionGate`, which returns false.
  Both match the existing no-telemetry build-plugin stubs. Direct source imports
  used by the context tests now load successfully without enabling remote
  feature fetching or telemetry.
- **Settings build errors** (`src/components/Settings/Config.tsx`): removed two
  orphaned statements from a deleted teammate-model display helper and its extra
  closing brace, resolving Bun's `Unexpected }` error. Corrected the
  `ThemePicker` import from `../ThemePicker.js` to `../theme/ThemePicker.js`.
- **Router health checks** (`src/utils/smartRouter.ts`): removed HTTP 401 and 403
  from the accepted health-check responses. Providers returning these responses
  are marked unhealthy and excluded from routing. HTTP 200 and 400 retain their
  existing accepted behavior. This fixes the router class; it does not connect
  smart routing to the CLI request path.

### Added

- **Four router regression tests** (`src/utils/smartRouter.test.ts`): for each of
  HTTP 401 and 403, verify that the router selects a healthy alternative even
  when the rejected provider is cheaper, and reports no providers available when
  the rejected provider is the only option. The alternative-provider tests also
  verify the rejected provider's unhealthy status and `N/A` score. Tests mock
  HTTP responses and restore the replaced fetch function after each test.

### Changed

- **Provider test command** (`package.json`): added
  `src/utils/smartRouter.test.ts` to `test:provider`, so the existing PR workflow
  runs the new tests. No workflow file was changed.

### Validation recorded during implementation

- All four new regression tests failed before the router fix and passed after it.
- `bun run test:provider`: initially 52 tests passed and the context test file
  failed to load because of missing analytics exports. After restoring the two
  exports, all 58 tests across nine files passed (107 assertions, zero failures).
- `bun test src/utils/context.test.ts`: reproduced each missing-export error
  before its fix; all six tests passed after both exports were restored.
- `bun run test:provider-recommendation`: all 41 tests passed before pushing
  the contribution branch.
- `bun run smoke`: passed after the fixes, building `dist/cli.mjs` and printing
  `1.1.0 (Cluadex)`.
- `git diff --check`: passed after the code changes.
- `node --test bin/import-specifier.test.mjs`: one test passed during the initial
  repository review.

### Local development setup

These are workstation setup actions, not source-code changes:

- Installed and verified Bun 1.3.11, matching the repository's CI version.
- Added `%USERPROFILE%\.bun\bin` to the Windows user PATH and provided a
  PowerShell command to refresh PATH in an already-open terminal.
- Ran `bun install --frozen-lockfile` successfully: 439 packages installed,
  with no tracked lockfile changes.

The package version remains 1.1.0. These changes are unreleased.

## Windows CI coverage

Status: implemented locally on `ci/windows-checks`; GitHub Actions validation is
pending. This branch builds on the earlier build and router fixes.

- Updated `.github/workflows/pr-checks.yml` with an Ubuntu/Windows matrix and
  `fail-fast: false`, so a failing platform does not cancel the other job.
  Both jobs run the existing build, smoke, provider, and recommendation checks.
- Replaced the hardcoded Windows-only fixture in
  `bin/import-specifier.test.mjs` with platform-native paths. Two cases verify
  file-URL round trips for ordinary directories and names containing spaces,
  `#`, and `%`, including a check that `#` does not become a URL fragment.
- Added the import-specifier test to CI with
  `node --test bin/import-specifier.test.mjs`.
- Local Windows validation passed: two launcher tests, 58 provider tests,
  41 provider recommendation tests, and `bun run smoke` (101 tests total).
  Local validation used Node 24.19.0 and Bun 1.3.11; CI uses Node 22 and Bun
  1.3.11. Ubuntu and hosted Windows runs have not yet been verified.

Intended delivery: a separate contribution branch and pull request.

## Development and promotion workflow

- Established `dev` from the completed build/router and Windows CI contribution
  commits. Further contribution work belongs on `dev`.
- Added `dev` and `test` to the PR Checks workflow's push triggers, alongside
  `main`. Both operating-system jobs run for these pushes.
- Added `CONTRIBUTING.md` documenting owner approval before promotion to `test`
  and passing required checks on the tested revision before promotion to `main`.
- No promotion to `test` or `main` was performed. Server-side branch protection
  was not configured as part of these changes.

## Security and correctness fixes (Telegram access, credential handling, shim streaming, CI)

Findings from a codebase-improvement review, fixed and covered with regression
tests; a follow-up security-focused diff review found no new vulnerabilities
introduced by these changes.

### Fixed

- **Telegram gateway open by default** (`telegram-gateway/bot.ts`): the bot
  previously granted shell/file access to every Telegram user when no
  `TELEGRAM_ALLOWED_IDS` was configured. It now refuses to start with an empty
  allowlist unless `TELEGRAM_ALLOW_OPEN_ACCESS=1` is explicitly set, and the
  startup status line now calls out open access instead of describing it as
  "open (no whitelist)".
- **Telegram gateway `dist/cli.mjs` resolution** (`telegram-gateway/bot.ts`):
  `CLAUDEX_ARGS` resolved the CLI entrypoint relative to `process.cwd()`,
  which breaks when the gateway runs as a service (pm2, systemd) from a
  different working directory. It now resolves relative to the script's own
  location via `import.meta.url`.
- **NVIDIA API key cross-provider leak** (`src/utils/nvidiaProvider.ts`,
  `src/utils/providerProfile.ts`): both copies of `buildNvidiaProfileEnv`
  fell back to `OPENAI_API_KEY` when `NVIDIA_API_KEY` was unset, silently
  sending an OpenAI key as the Bearer token to NVIDIA's API. Removed the
  fallback in both places.
- **Malformed Anthropic stream on provider safety filters**
  (`src/services/api/openaiShim.ts`): closing a content block on
  `finish_reason` never reset `hasEmittedContentStart` or advanced
  `contentBlockIndex`, so a `content_filter`/`safety` finish reason emitted a
  `content_block_delta` against an already-closed block index, and the
  substitute "blocked by safety filter" text block was never closed with
  `content_block_stop` before `message_stop`. Both are now closed/reopened
  correctly.
- **Smart router latency and error-rate drift** (`src/utils/smartRouter.ts`):
  `_pingProvider` unconditionally overwrote the request-derived
  `avgLatencyMs` EMA with a single raw ping latency, and a provider's
  `requestCount`/`errorCount` were never reset after its 60s recovery
  re-check, so a recovered provider could trip unhealthy again almost
  immediately on stale history. Recovery re-checks now blend into the
  existing EMA and reset both counters on success.
- **npm registry scope mismatch** (`.npmrc`,
  `.github/workflows/publish-github-packages.yml`): both referenced scope
  `@l3tchupkt`, which does not match this package's actual name,
  `@letchu_pkt/claudex`. The publish workflow would authenticate against the
  wrong registry. Corrected both to `@letchu_pkt`.
- **Broken VS Code extension path** (`.github/workflows/deploy-all.yml`): the
  `deploy-vscode` job's `working-directory` and the `upload-artifact` step's
  `path` both referenced `vscode-extension/claudex-vscode`, but the actual
  directory is `vscode-extension/openclaude-vscode`. Both references fixed.

### Changed

- **Inconsistent Actions pinning** (`.github/workflows/publish-cli.yml`,
  `.github/workflows/publish-github-packages.yml`,
  `.github/workflows/deploy-all.yml`): these three workflows hold
  `NPM_TOKEN`/`VSCE_PAT` secrets but used floating `@v4`/`@v2` tags for
  `actions/checkout`, `actions/setup-node`, and `oven-sh/setup-bun`, while
  `pr-checks.yml` already pinned them to commit SHAs. Pinned all three to the
  same SHAs already verified in this repo's own CI
  (`actions/checkout@11bd719...` `# v4.2.2`,
  `actions/setup-node@49933ea...` `# v4.4.0`,
  `oven-sh/setup-bun@4bc047a...` `# v2.0.1`). `actions/upload-artifact@v4` in
  `deploy-all.yml` was left unpinned — no verified SHA for it exists
  elsewhere in this repo.
- **Duplicate CLI publish workflow** (`.github/workflows/publish-cli.yml`,
  `.github/workflows/deploy-all.yml`): `deploy-all.yml`'s `deploy-cli` job
  duplicated `publish-cli.yml`'s steps. `publish-cli.yml` gained a
  `workflow_call` trigger and `deploy-all.yml` now calls it with
  `secrets: inherit` instead of repeating the steps. Existing tag triggers
  (`v*`, `cli-v*`, `release-v*`) and `workflow_dispatch` are unchanged.

### Added

- **Regression test** (`src/services/api/openaiShim.test.ts`): streams text
  then a `content_filter` finish reason and asserts every `content_block_*`
  event pairs correctly (no delta/stop against an unopened or already-closed
  index, no block left open at `message_stop`).
- **Regression tests** (`src/utils/providerProfile.test.ts`): confirms
  `buildNvidiaProfileEnv` returns `null` when only `OPENAI_API_KEY` is set,
  and uses `NVIDIA_API_KEY` when present even if `OPENAI_API_KEY` is also set.
- **Regression test** (`src/utils/smartRouter.test.ts`): trips a provider
  unhealthy via three failing requests at a 100% error rate, triggers its
  recovery re-check, and asserts `requestCount`/`errorCount` reset to 0 and
  `healthy` returns to `true`.

### Not fixed (investigated, not a bug)

- The OpenAI shim's inline 429 retry loop only applies to the GitHub Models
  provider. Initially flagged as a gap for other providers, but
  `src/services/api/client.ts` routes every OpenAI-shim provider (OpenAI,
  Azure, Gemini, NVIDIA, GitHub) through the generic `withRetry()` wrapper in
  `src/services/api/claude.ts`, which already retries 429/5xx for all of them
  (up to `CLAUDE_CODE_MAX_RETRIES`, default 10, with backoff). Adding a
  second retry layer inside the shim would only double up retries.
- Removing `// @ts-nocheck` from `scripts/provider-bootstrap.ts`,
  `scripts/provider-launch.ts`, `scripts/provider-recommend.ts`, and
  `scripts/system-check.ts` was attempted and reverted: these files fall
  outside `tsconfig.json`'s `include` (`src/**/*`), so the pragma is already a
  no-op for `bun run typecheck`, and type-checking them directly pulls in the
  full upstream source tree's pre-existing, unrelated type errors.

### Deliberately not attempted

- Wiring `ROUTER_MODE=smart`/`ROUTER_STRATEGY` into the live CLI request
  path. `SmartRouter` is currently dead code — nothing outside
  `smartRouter.ts` and its test imports it — but connecting it means
  reworking how the CLI picks a provider (currently one provider via env
  vars at process startup, not a per-message decision), which is a design
  change, not a bug fix.

### Validation recorded during implementation

- `bun test src/services/api/openaiShim.test.ts`: 5/5 pass (4 pre-existing +
  1 new).
- `bun test src/utils/providerProfile.test.ts`: 34/34 pass (32 pre-existing +
  2 new).
- `bun test src/utils/smartRouter.test.ts`: 5/5 pass (4 pre-existing + 1 new).
- `bun run test:provider`: 60/60 pass across 9 files.
- `bun run test:provider-recommendation`: 43/43 pass across 2 files.
- `node --test bin/import-specifier.test.mjs`: 2/2 pass.
- `bun run smoke`: passed, building `dist/cli.mjs` and printing
  `1.1.0 (Cluadex)`.
- `git diff --check`: passed (no whitespace errors).
- `bun build telegram-gateway/bot.ts --target node`: bundled cleanly after
  the `CLAUDEX_ARGS` path fix.
- `python3 -c "import yaml; yaml.safe_load(...)"`: validated syntax of all
  edited workflow YAML files.

## README-vs-reality audit, Smart Router startup wiring, and credential-switch fixes

A follow-up improvement pass: audited README.md's checkable claims against
the code, wired the previously-dead Smart Router into a real (session-scoped)
startup path, and reviewed the provider/credential code that hadn't been
looked at yet (`credentialManager.ts`, `codexShim.ts`, `provider.tsx`) for
the same class of cross-provider credential bug found earlier.

### Fixed

- **`claudex telegram ...` had no implementation** (`bin/claudex`): the
  command is documented in README.md, telegram-gateway/README.md, and the
  gateway's own runtime error messages, but the main `claudex` binary/CLI
  program never registered a `telegram` subcommand — only the separate
  `claudex-telegram` bin did. `bin/claudex` now detects `argv[2] ===
  'telegram'` and delegates (spawns `claudex-telegram` with the remaining
  args, inherits stdio), so every existing doc string and message is now
  correct instead of needing to be rewritten to a smaller reality.
- **Credential accumulation across `/provider` switches**
  (`src/utils/credentialManager.ts`): `applyStoredCredentials()` applied the
  flag/key for *every* provider ever configured via `/provider` (entries
  accumulate in global config and are never removed), so two different
  `CLAUDE_CODE_USE_*` flags could end up set simultaneously. Now applies
  only the most-recently-stored provider via a new
  `selectMostRecentCredentials()` helper.
- **Stale provider env on mid-session switch**
  (`src/utils/credentialManager.ts`): `storeProviderCredentials()` wrote the
  newly selected provider's env vars into `process.env` but never cleared
  the *previous* provider's flag/key/base-url/model. Switching OpenAI ->
  NVIDIA mid-session left `OPENAI_API_KEY`/`OPENAI_BASE_URL` set; since the
  shim's provider-detection in `client.ts` uses `??=` (fill-if-unset) when
  translating NVIDIA's env into OpenAI's, the stale values silently won and
  the next request went out with the old provider's key and endpoint. Now
  clears every other provider's env vars before applying the new one.
- **Truncated Codex stream reported as a successful turn**
  (`src/services/api/codexShim.ts`): if the Codex SSE stream ended (dropped
  connection, proxy timeout) without ever emitting
  `response.completed`/`incomplete`/`failed`, `codexStreamToAnthropic()`
  fell through to a normal-looking `message_delta` with `stop_reason:
  'end_turn'` and zero usage — a silently truncated response looked
  identical to a real, successful, empty turn. Now throws the same error
  its non-streaming sibling `collectCodexCompletedResponse()` already used
  for this exact case.
- **`readSseEvents()` silently dropped the final SSE event**
  (`src/services/api/codexShim.ts`): the parser only yielded events found
  via `buffer.split('\n\n')` per chunk read; whatever remained in `buffer`
  when the stream closed (`done`) was discarded without being parsed. Since
  an SSE stream doesn't always send a trailing blank-line separator before
  closing, this could drop the *last* event of any stream — including a
  normal `response.completed`, which would otherwise make a real completion
  look identical to the truncated-stream case above. Found via the
  regression test for the previous fix (the existing fixture's
  `response.completed` was silently being dropped, and the resulting event
  types happened to look the same as the fixed error case). Now flushes any
  remaining non-empty buffer after the read loop exits.
- **Broken error headers on three `codexShim.ts` throw sites**: `throw
  APIError.generate(..., {} as Record<string, string>)` passed a plain
  object where the Anthropic SDK's error constructor calls `.get()` on it —
  crashing with `headers?.get is not a function` instead of raising the
  intended error, masking the real failure behind an unrelated `TypeError`.
  Two of the three predate this session (`collectCodexCompletedResponse`'s
  `response.failed` and empty-payload throws); the third was introduced by
  this session's own fix above and inherited the same broken pattern from
  its neighbors. All three now pass a real `Headers()` instance.
- **Fragile provider-key selection in `/provider`**
  (`src/commands/provider/provider.tsx`, `finishProfileSave()`): picked the
  API key/base-url/model to persist via an OR-chain over every provider's
  env field (`env.OPENAI_API_KEY || env.GEMINI_API_KEY || ...`) instead of
  switching on the `profile` type already being saved. Currently safe only
  because each `buildXProfileEnv()` builder happens to populate exclusively
  its own provider's fields — same fragile shape as the NVIDIA/OpenAI
  fallback bug fixed earlier this session. Now switches explicitly on
  `profile`.

### Added

- **Smart Router startup wiring** (`src/entrypoints/cli.tsx`,
  `src/utils/smartRouter.ts`): `ROUTER_MODE=smart` was previously
  documented in README.md but never connected to anything — `smartRouter.ts`
  was imported by nothing outside itself and its test file. `cli.tsx` now
  pings every configured provider once at startup (after profile/credential
  resolution, before provider validation) and applies the winning
  provider's env via a new exported `applyRouteDecisionToEnv()` helper,
  which also clears conflicting provider flags a prior profile might have
  left set. Deliberately scoped to session-level (not per-request) routing
  — the module doc in `smartRouter.ts` explains why (env vars are read from
  mutable global `process.env` throughout the shim, and Claudex can run
  sub-agents concurrently in-process via `src/utils/swarm/`, so per-request
  re-routing by mutating `process.env` would let one in-flight request's
  provider choice leak into another's) and what a concurrency-safe
  per-request version would need (AsyncLocalStorage or explicit param
  threading instead of global env mutation). Verified live: with
  `ROUTER_MODE=smart` set and a local Ollama server reachable, the CLI
  correctly pinged it, selected it as the zero-cost/no-key-needed option,
  and the normal request pipeline picked up the routed env vars.
- **Regression tests**: `src/utils/smartRouter.test.ts`
  (`applyRouteDecisionToEnv` clears a conflicting flag),
  `src/utils/credentialManager.test.ts` (new file —
  `selectMostRecentCredentials` picks the latest `storedAt` entry and skips
  empty keys; `storeProviderCredentials` clears the previous provider's env
  on switch), `src/services/api/codexShim.test.ts` (errors instead of
  reporting a truncated stream as a successful turn — this test is what
  surfaced the `readSseEvents` buffer-flush bug above).

### Changed

- **Provider test command** (`package.json`): added
  `src/utils/credentialManager.test.ts` to `test:provider`.

### Not fixed (investigated, decided against or out of scope)

- `provider.tsx`: no inline validation on user-entered base URLs before
  they're persisted — malformed values only surface as a raw `fetch()`
  error later. Low severity, UX polish rather than a bug; not addressed
  this pass.
- `providerProfile.ts`'s `looksLikeSecretValue()` only recognizes `sk-`/
  `AIza`-shaped keys for its heuristic redaction fallback, not NVIDIA's
  `nvapi-` or Codex's JWT shape. The exact-match `collectSecretValues` path
  is the real protection for those two; this heuristic is a secondary
  fallback. Low severity, not addressed this pass.

### Validation recorded during implementation

- `bun test src/services/api/codexShim.test.ts`: 10/10 pass (8 pre-existing
  + 2 new).
- `bun test src/utils/credentialManager.test.ts`: 4/4 pass (new file).
- `bun test src/utils/smartRouter.test.ts`: 6/6 pass (5 pre-existing + 1
  new).
- `bun run test:provider`: 66/66 pass across 10 files.
- `bun run test:provider-recommendation`: 43/43 pass across 2 files.
- `node --test bin/import-specifier.test.mjs`: 2/2 pass.
- `bun run smoke`: passed, building `dist/cli.mjs` and printing
  `1.1.0 (Cluadex)`.
- `git diff --check`: passed (no whitespace errors).
- `node bin/claudex telegram` / `node bin/claudex telegram status` / `node
  bin/claudex --version`: manually verified the telegram delegation works
  and normal invocation is unaffected.
- `ROUTER_MODE=smart node dist/cli.mjs --print "test"`: manually verified
  live end-to-end (see Smart Router entry above).

## QA pass: live end-to-end testing surfaced one real Smart Router bug

Live-ran the built CLI (not just unit tests) against a real local Ollama
instance and a real saved NVIDIA profile on the dev machine, per the `run`
skill's "drive it, don't just launch it" guidance. This caught a bug the
unit tests for the previous entry's Smart Router wiring had missed.

### Fixed

- **Stale model surviving a Smart Router provider switch**
  (`src/utils/smartRouter.ts`): `applyRouteDecisionToEnv()`'s clear-list
  only cleared the `CLAUDE_CODE_USE_*` flags, not the per-provider
  `*_API_KEY`/`*_BASE_URL`/`*_MODEL` vars. Reproduced live: with a saved
  NVIDIA profile on disk and `ROUTER_MODE=smart` routing the session to
  Ollama instead, the provider switch correctly changed the endpoint/key,
  but `getUserSpecifiedModelSetting()` (`src/utils/model/model.ts:82`)
  checks `NVIDIA_MODEL` before `OPENAI_MODEL` — the leftover
  `NVIDIA_MODEL=moonshotai/kimi-k2-instruct` from the profile won over the
  router's `llama3.1:8b` choice, so the request went to Ollama's endpoint
  asking for NVIDIA's model name. Same bug class, same root cause
  (incomplete env-clearing) as the two `credentialManager.ts` fixes in the
  previous entry — just missed in this file specifically because its unit
  test only checked the flag/key fields, not the model field. Expanded the
  clear-list to match `credentialManager.ts`'s `OTHER_PROVIDER_ENV_VARS`,
  added a regression test that reproduces the exact live scenario, and
  re-verified the real repro is fixed (error now correctly references
  `llama3.1:8b`, not the stale NVIDIA model).

### Investigated, not a regression

- An intermittent `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
  file src\win\async.c, line 94` after certain API errors on Windows.
  Reproduced 2-3 times out of 3 runs both on this session's build and on a
  clean worktree checkout of the pre-session commit (`f02c9a4`), confirming
  it predates every change made in this contribution — a native
  libuv/Node async-handle-cleanup race on process exit, specific to
  Windows, unrelated to application code. Not fixed as part of this pass;
  noting it for whoever next touches process-exit handling on Windows.

### Validation recorded during implementation

- `bun test src/utils/smartRouter.test.ts`: 7/7 pass (6 pre-existing + 1
  new).
- `bun run test:provider`: 67/67 pass across 10 files.
- `bun run test:provider-recommendation`: 43/43 pass across 2 files.
- `node --test bin/import-specifier.test.mjs`: 2/2 pass.
- `bun run smoke`: passed.
- `git diff --check`: passed (no whitespace errors).
- `ROUTER_MODE=smart node dist/cli.mjs --print "test"` (real local Ollama +
  real saved NVIDIA profile on the dev machine): reproduced the stale-model
  bug live, then re-ran after the fix and confirmed the error now
  references the router's actual chosen model instead of the stale one.
- `claudex telegram permit`/`revoke` with no config present: confirmed
  clean error messages and exit code 1, no stray files created.
- Baseline comparison via an isolated `git worktree` at commit `f02c9a4`
  (removed after use) to confirm the libuv crash above predates this
  session's changes.
