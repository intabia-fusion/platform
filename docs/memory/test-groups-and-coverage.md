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


## Coverage in CI

`pnpm coverage` writes `lcov.info`, `cobertura-coverage.xml` and `html/` next to the merged JSON,
built with `istanbul-lib-report` / `istanbul-reports` declared on `platform-rig`. They were already
in the store as jest transitives, so this cost nothing over adding `nyc`, which drags in a whole
instrumenter the run does not need.

The last line is `Coverage: NN.NN% of statements` - GitLab's `coverage:` regex reads it, so the
wording is load-bearing and `.gitlab-ci.yml` has to move with it.

Both pipelines run `pnpm test --verbose` (unit, fails fast with a per-package report) and then
`pnpm coverage --integration`, which repeats the unit group under istanbul and is the gate for the
integration group. On GitLab both live in `ci_test.sh`, which the `test` job calls on a shell
runner that already has Docker - there is no docker-in-docker anywhere in this pipeline.

`MONGO_URL` was still being exported by both pipelines and echoed by `ci_test.sh` although no
compose file has had a mongo service for some time; removed. What still mentions mongo and was left
alone: `tests/.env` (`DB_URL`/`MONGO_URL` pointing at a `mongodb` host that does not exist),
`tests/tool.sh`, `tests/tool-cockroach.sh`, `tests/update-snapshot.sh`, the `MONGO_URL` entry in the
rig's `TEST_ENV_VARS` cache key, and `common/scripts/mongo_dump.sh` / `mongo_restore.sh`, which are
for migrating old production data rather than for the stand. `foundations/server/packages/mongo`
still has a test file, but its whole suite is `describe.skip`.

## Packages that cannot be flattened into the shared run

`desktop` and `presentation` declare their own `projects`. jest does not nest, so spreading such a
config into a project entry drops its `preset` - the run then falls back to babel-jest, which
cannot parse TypeScript and fails with `SyntaxError: Unexpected token, expected ","` on a `type`
import. `classify()` already refused them; the coverage run initially bypassed it and hit exactly
this. It now takes `planTestRun`'s verdict and gives every isolated package its own jest
invocation against its own config file.

## wait-elastic.sh returned 0 on failure

It looped 30 times and fell off the end, so `prepare-tests.sh` reported a healthy stand whether or
not elasticsearch answered. It now exits 1, and takes the host from `ELASTIC_HOST` (default
`localhost`) so a docker-in-docker runner can point it at the service alias.


## What only CI caught

- **An isolated package has to run through its own npm script, not a jest binary.** Spawning jest
  directly made `desktop`'s jsdom project fail to compile its own test files (`Cannot find name
  'describe'`, `Cannot find namespace 'jest'`) while `pnpm run test` on the same config passed. The
  first suspect was the binary: `findJestBin()` returned the first workspace package that had one,
  and a sibling's jest does bring a ts-jest that cannot see the package's `@types` - that
  reproduces locally with
  `cd desktop && ../plugins/training-resources/node_modules/.bin/jest -c jest.config.js`. Using the
  package's own binary fixed the `node` project but not the `jsdom` one, and nothing about
  `--coverage` reproduces it on a developer machine. `coverage.js` now runs `pnpm run <script>` with
  the coverage flags appended, which is exactly the invocation the green `pnpm test` phase uses.
  `test-group.js` still picks `findJestBin([pkg])` for a single-package run.
- **Never append a flag the script already carries.** `network-backrpc`'s `test` is
  `jest --coverage --coverageDirectory=./coverage ...`; appending our own turned the value into an
  array and jest died in config normalization with
  `TypeError: The "paths[1]" argument must be of type string`. The flags in the script text are
  parsed out first, and a script that names its own coverage directory keeps it - the merged report
  is read from there instead.
- **Instrumentation is slower than the timeouts these tests were written against.**
  `network-backrpc`'s zmq suite binds a real socket and blew the 5s default under coverage on a CI
  runner. Own-package coverage runs get `--testTimeout=30000`.
- **Adding a catalog entry can break `check-catalog`.** `foundations/server/common/scripts` already
  depended on the three istanbul packages by literal version; putting them in the catalog made those
  literals a failure. `pnpm check-catalog --fix` rewrites them to `catalog:`.
- **svelte-check type-checks the test files, and it is stricter than tsc here.**
  `new Comp({ target, props })` with `props: Record<string, unknown>` passes tsc and fails
  svelte-check with "Property X is missing". The mount helpers now take
  `Partial<ComponentProps<Comp>>` and assert at the construction site - which also catches a
  misspelled prop name, something `Record<string, unknown>` never did. eslint refuses an assertion on
  an object literal, so a helper that merges defaults assigns to a named const first.
  `ModeSelector` is the one component svelte-check sees as generic and tsc does not; its test spells
  its props out by hand instead of naming the component type.
