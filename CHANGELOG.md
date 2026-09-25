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
