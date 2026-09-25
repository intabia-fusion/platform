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

Two more were found only by that check, after the first split: `elastic/src/__tests__/search.test.ts`
(real bulk index) and `postgres/src/__tests__/storage-coverage.test.ts` (`CREATE DATABASE`). CI hid
them - `ci_test.sh` raises the stand before `pnpm test` - so they passed there and failed on any
machine without it. Both are `*.itest.ts` now.

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

`pnpm coverage` reports 36.7% (unit, 1557 files in 173 packages) / 37.4% (+integration, 1583 files
in 178 packages, 341s), plus a line for the 290 packages that have a `src/` and no test at all -
they appear in no istanbul report, so there is no other way to tell them from 0%.

The integration group moves the repository total by less than a point, and that is the wrong place
to read it: per package it is most of what `postgres` (27.0% -> 81.2%) and `kafka` (56.8% -> 82.1%)
have, some of `account` (55.6% -> 58.3%), and the only report at all for `elastic` (55.3%),
`minio` (59.4%), `pod-fulltext` (40.8%) and `pod-telegram-bot` (5.2%).

Playwright (`tests/sanity`,
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

## Integration group runs on testcontainers (2026-09-24)

`tests/prepare-tests.sh` is no longer part of the integration group: every `*.itest.ts` gets its
services from `@hcengineering/test-containers` (`foundations/server/packages/test-containers`),
which wraps `testcontainers` 12. `postgresUrl()` / `elasticUrl()` / `kafkaBrokers()` /
`minioConfig()` start one container per kind per process, and return an address from the
environment (`DB_URL`, `ELASTIC_URL`, `QUEUE_CONFIG`, `MINIO_ENDPOINT`) without starting anything
when one is set - that is how a prepared stand still works. Whole group: 232 tests, ~157s, no stand.

What that cost, each found by a failing run:

- **Elasticsearch needs the analysis-icu plugin.** `adapter.ts` maps `icu_transform` and
  `icu_folding`, so a bare `elasticsearch:8.19.1` fails `initMapping`. The helper builds
  `docker/elastic/Dockerfile` (`FROM elasticsearch:8.19.1` + plugin install) once with
  `deleteOnExit: false`; the first build downloads the plugin for ~90s, later runs hit the cache.
- **The fulltext pipeline needs a migrated database.** A fresh postgres has no schema version and
  `waitForSchemaVersion` in the platform adapter never returns, so indexing silently never happens
  and every test times out with no error in the log. `pods/fulltext/src/__tests__/utils.ts` runs
  `@hcengineering/pod-db-migrator` as a child process against the container url. The migrator has
  no migration files yet - on an empty database it only writes schema version 10, which is exactly
  what the adapter waits for. The postgres package's own itests mock `EXPECTED_SCHEMA_VERSION`
  instead, which is why they never needed the stand's migration.
- **The helper cannot depend on the migrator.** `pod-db-migrator` -> `@hcengineering/postgres` ->
  (dev) `test-containers` is a cycle the build phase refuses. The migrator call lives in the one
  suite that needs it.
- **Hook timeouts.** Jest gives a hook the file's `testTimeout`, 5s by default, and starting a
  container is well past that. `GROUPS.integration` in `libs/test-groups.js` now carries
  `testTimeout: 300000`; a file with its own `jest.setTimeout` (fulltext: 30s) overrides that, so
  those `beforeAll`s take an explicit third argument.
- **testcontainers pulls ssh2**, whose native build pnpm 10+ refuses to run unattended. Both it and
  `cpu-features` are denied in `allowBuilds:` in `pnpm-workspace.yaml`; the JS fallback is fine.

Still skipped, and not worth a container: `s3.itest.ts` (wants a real S3; its rootBucket is even
hardcoded to a personal bucket) and the three `pod-ai-bot` LLM suites (want a local model server).
`kafka-clisr-e2e.itest.ts` lost its `AI_BOT_QUEUE_E2E` gate - the gate existed because it needed
the stand's redpanda, and it now starts its own.

## `pnpm coverage --server` (2026-09-24)

Replaces the per-package table with what to attack first over `foundations/net`,
`foundations/server`, `pods`, `server`, `server-plugins`, `services` (minus `-assets` and
`model-*`, which are declarations):

1. server packages with no istanbul report at all - no test ever runs there, so they cannot be told
   from 0% any other way; sized by counting `src/` lines, biggest first
2. server files at 0% inside packages that do run tests - they are in the report only because of
   `--collectCoverageFrom`, and no test ever reached them
3. server packages by coverage, worst first, plus a SERVER total

First reading (unit + integration): **SERVER 37.3%, 19003/50964 statements in 60 packages with a
report**, and 84 packages with 31583 lines that no test touches. Largest untested packages:
`pod-calendar` (3939 lines), `pod-notifications` (3328), `server-process-resources` (2942),
`pod-telegram` (2239). Largest 0% files: `pod-github/src/worker.ts` (793 statements),
`pod-github/src/platform.ts` (542), `services/love/src/main.ts` (414),
`server/indexer/src/indexer/indexer.ts` (393).

`network-backrpc`'s zmq suite fails under a loaded coverage run (two tests, `check diff order` and
`check multiple requests from same client`) and passes on its own - the 30s timeout the coverage run
gives it is not the whole story, the sockets themselves are timing-sensitive.

## Stand coverage from V8 profiles (2026-09-24)

`ws-tests/api-tests` is 26 files and 301 cases against a live stand, and none of it was in any
coverage number: the server code runs inside containers, jest runs on the host. `bin/stand-coverage.js`
closes that gap - `NODE_V8_COVERAGE` per pod (`ws-tests/docker-compose.coverage.yaml`,
opt-in through the runner's existing `STAND_EXTRA_COMPOSE`), then `v8-to-istanbul` over each
profile, then a merge into the same istanbul shape everything else uses (`pnpm coverage --stand`).

Measured while wiring it up:

- A **cold transactor that never finished booting** already reports 56.8% (60954/107388 statements
  over 566 repository files). Bundle top-level code counts as executed the moment a module is
  imported, exactly as it does under istanbul - so stand numbers are not a different currency, but
  a large part of that 56.8% is import-time code, not behaviour under test.
- **esbuild's `--sourcemap=external` writes no `sourceMappingURL` comment**, so `v8-to-istanbul`
  finds no map on its own and returns a single entry for `bundle.js` (371153 statements, useless).
  The map has to be handed over explicitly: `v8toIstanbul(bundle, 0, { source, sourceMap: { sourcemap } })`.
  With it, one profile decodes into 3220 files, 566 of them in the repository, in under a second.
- **`pods/account` shipped no sourcemap** - its Dockerfile copied `bundle.js` alone. Fixed; every
  other pod already copies the `.map`.
- The V8 profile is written **as the process exits**, so the stand must be stopped
  (`docker compose stop -t 60`), not `down`ed or killed. A pod that hits the grace period loses
  everything it collected, with no error anywhere.
- The bundle on disk has to be the one in the image. The profile addresses ranges in the image's
  bundle; the sourcemap that decodes them is read from the checkout.
- Image name is the join key: `docker-compose.coverage.yaml` mounts `./coverage/<image>`, and
  `stand-coverage.js` finds the package by grepping each `package.json` for `docker_build.sh <name>`
  (so `pods/server` is `transactor`, `services/datalake/pod-datalake` is `datalake`).

## First full stand run (2026-09-25)

`pnpm docker` (283s) -> stand with the coverage overlay (26s) -> `pnpm run api-test` (33s, 316
passed / 1 failed / 2 skipped) -> `docker compose stop -t 60` (66s) -> `pnpm coverage:stand` (11s).
17 profiles from 14 pods; `stream` is skipped because `foundations/stream` has no `bundle/`.

| number | unit + integration | + stand |
|---|---|---|
| TOTAL | 37.4% | 68.7% |
| SERVER | 37.3% | 61.0% |
| server packages with no report at all | 84 (31583 lines) | 18 (15941 lines) |
| `server-core` | 23.8% | 92.2% |
| `account-service` | 3.2% | 63.1% |
| `pod-datalake` | 18.7% | 55.6% |
| `pods/server` | 31.7% | 51.1% |

**The two reports cannot be merged file by file.** A V8 profile decoded through a sourcemap has a
coarser map than istanbul's instrumentation for the same file - `pods/server/src/rpc.ts` is 828
statements and 8 functions from the stand against 1077 and 68 from jest - and istanbul merges
counters by index, so merging both maps for one file adds one structure's counts into another's
slots. The first attempt did exactly that and read 70.2%, which is meaningless. `coverage.js` now
merges whole files only: a file jest never saw comes from the stand, a file jest loaded but never
executed (0 statements hit) is *replaced* by the stand's version, and anything jest actually
measured stays as jest measured it. For this run: 1106 + 221 + 357 files.

Stand-only numbers, for the record: 76.6% of statements but 45.4% of functions (3464/7634). The gap
is import-time code - a pod's bundle executes every module's top level at boot, so statements look
generous while functions say how much was actually called. Read the function column when judging
what the api-tests really exercise.

**Collecting coverage breaks performance assertions.** `rest.test.ts`'s `find avg` expects < 10ms
and measured 10.2ms under `NODE_V8_COVERAGE`. Either skip that test in a coverage run or raise its
bound there; it is the only one of the 319 that failed.

What the stand does not reach, and what is therefore worth a test of its own: `pod-github` (5.5%,
3914 statements - `worker.ts` 793 and `platform.ts` 542 are still flat zero), `pod-rating` (0%),
`pod-preview` (1.5%), `mongo` (2.9%), `pod-telegram-bot` (5.2%).
