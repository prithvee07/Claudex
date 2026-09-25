# Contributing

## Branch workflow

1. Make changes on `dev` and run the local checks below.
2. Obtain the repository owner's approval before promoting changes from `dev`
   to `test`.
3. Run all required checks on `test`, including the Ubuntu and Windows CI jobs.
   Promote the tested changes to `main` only after every required check passes.
   If changes are needed, make them on `dev` and repeat the approval and testing
   process.

Do not promote directly from `dev` to `main`. Pending, skipped, cancelled, or
failed required checks do not count as passing. Test results must apply to the
exact revision being promoted.

The workflow runs on pull requests and pushes to `dev`, `test`, and `main`.
This document describes the contribution policy; GitHub branch protection and
required status checks must be configured separately to enforce it on the server.

## Local checks

Use Bun 1.3.11 and Node.js 22 to match CI. From the repository root, run:

```sh
bun install --frozen-lockfile
node --test bin/import-specifier.test.mjs
bun run test:provider
bun run test:provider-recommendation
bun run smoke
git diff --check
```

Update `CHANGELOG.md` with the changes and actual verification results. Keep
unrelated local edits out of contribution commits.
