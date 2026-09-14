# Test groups and how coverage is measured

Three groups, told apart by file name alone (`libs/test-groups.js` -> `GROUPS`):
`*.test.ts`/`*.spec.ts` unit, `*.itest.ts` integration, `*.bench.ts` bench.

The naming is not cosmetic: a package's default `testMatch` is
`**/?(*.)+(spec|test).[jt]s?(x)`, and `+(spec|test)` cannot decompose `itest` or `bench`.
So renaming a file is the whole mechanism - no `package.json` field, no config edit, and no
way for a group to leak into the build phase by accident. `pnpm integration` / `pnpm bench`
(`bin/test-group.js`) replace `testMatch` on every project for the group they run.

Splitting them took the test phase from 70.9s to 22.1s: the two slowest packages in the old
phase (`kafka` 21s, `pod-fulltext` 21s) were slow only because of their integration files.

## Which files actually needed the stand

Twelve, out of 621 test files. A grep for `pg`/`kafkajs`/`@elastic` imports over-reports
badly - most hits are `jest.mock`ed. Files that looked like integration and are not:

- `server/account/postgres.test.ts` - `mockClient = { unsafe: jest.fn() }`
- `foundations/server/packages/postgres/createTables.spec.ts` - `fakeDb()`, an in-memory `Sql`
- `mail-common/queue.test.ts`, `pod-billing/postgres-rounding.test.ts` - mocked
- `foundations/server/packages/collaboration` - its "integration tests" use `MockStorageAdapter`

The decisive check is not the grep, it is running the unit group with the stand stopped.

## collectCoverageFrom is a trap in a multi-project jest run

Without it, coverage only counts files a test happened to load: 500 files, a flattering 56.55%.
With it the same run reports 976 files and 35.3%. But *where* it is declared decides everything:

| where | result |
|---|---|
| in a project's config | silently ignored |
| top level, repo-relative (`plugins/x/src/**`) | 0 files - matched against each project's own `rootDir` |
| top level, package-relative (`src/**/*.ts`) | works, applied to every project |

So one global pattern written as if it were inside a package is the only form that works.

## v8 coverage lies about svelte components

`@vitest/coverage-v8` on `packages/ui`: 87.6% statements. Istanbul on the same run: 7.9%.
v8 counts a module's top-level code, and importing `src/index.ts` pulls in every component,
so 280 svelte files come back "covered" while only their import statements ever ran.
`vitest.config.mts` uses `provider: 'istanbul'` for that reason - it costs ~9s more transform
time and is the only honest number.

## Packages whose tests never run in the phase

`platform-rig`, `presentation`, `ai-bot-resources`, `attachment-resources`, `billing-resources`,
`calendar-resources`, `recorder-resources` have a `jest.config.js` and test files but neither a
`test` nor a `_phase:test` script, so `compile_all --test` skips them entirely. `pnpm jest` and
`pnpm coverage` do run them, which is why their suite counts differ (444 vs 405).

## Two bugs the split surfaced

- `pods/server/src/__tests__/server.test.ts` hard-coded port 10000 and failed against any
  unrelated container holding it ("Parse Error: Expected HTTP/, RTSP/ or ICE/"). It now takes an
  ephemeral port in `beforeAll`.
- `services/ai-bot/love-agent` names its config `jest.config.cjs`; every `existsSync(jest.config.js)`
  check in the rig missed it, so it ran alone. `jestConfigPath()` now accepts both spellings.

## What the total still leaves out

`pnpm coverage` reports 31.8% (unit) / 32.6% (+integration) over ~1350 files in ~155 packages,
plus a line for the 299 packages that have a `src/` and no test at all - they appear in no
istanbul report, so there is no other way to tell them from 0%. Playwright (`tests/sanity`,
`qms-tests`, `ws-tests`) contributes nothing: it drives the built bundle, and collecting from it
needs either an istanbul-instrumented front build or `page.coverage` plus `v8-to-istanbul`.
