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
