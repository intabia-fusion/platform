# Testing

[← README](../README.md)

## Three groups, told apart by file name

| group | files | needs | runs |
|---|---|---|---|
| unit | `*.test.ts`, `*.spec.ts` | nothing | build phase, `pnpm test` |
| integration | `*.itest.ts` | the stand from `tests/prepare-tests.sh` | `pnpm integration` |
| bench | `*.bench.ts` | nothing (some are env-gated) | `pnpm bench`, by hand |

`*.itest.ts` and `*.bench.ts` do not match a package's default `testMatch`, so a rename is
all it takes to move a file between groups - no config and no `package.json` field lists them.

## Unit tests

```bash
pnpm test          # All tests, from the repository root
pnpm run test      # A single package, from inside its directory
pnpm test --to @hcengineering/core   # Scope to a package and its dependencies
```

Jest is configured at the root (`jest.config.js`); `pnpm jest` runs the shared runner
directly. The group runs without Docker; if a unit test needs a service, it is in the
wrong group.

## Integration tests (`pnpm integration`)

```bash
pnpm integration             # needs a running Docker, and nothing else
pnpm integration -t 'name'   # jest flags pass through
```

Each suite starts the services it needs itself, through `@hcengineering/test-containers`
(testcontainers): `postgresUrl()`, `elasticUrl()`, `kafkaBrokers()`, `minioConfig()`. One container
per kind per jest worker, started on first use, removed when the process ends - a suite that needs
only postgres never starts elasticsearch. `tests/prepare-tests.sh` is for the Playwright stand now;
the integration group does not use it.

An address already in the environment wins and no container is started for it, so a prepared stand
still works: `DB_URL`, `ELASTIC_URL`, `QUEUE_CONFIG`, `MINIO_ENDPOINT`.

Nine packages have `*.itest.ts` files: `postgres`, `elastic`, `minio`, `s3`, `kafka`,
`pod-fulltext`, `account`, `pod-ai-bot`, `pod-telegram-bot`. Two suites still skip themselves:
`s3` wants a real S3 (`S3_ENDPOINT`), and the `pod-ai-bot` LLM suites want a local model server
(`AI_BOT_E2E=1`). `kafka` and `pod-fulltext` carry `testIsolated` and run one at a time.

## Benchmarks (`pnpm bench`)

Never part of a CI phase. jest packages run through their own `jest.config.js` with the
`*.bench.ts` matcher and a 600s timeout; `packages/ui` runs its own `bench` script
(`vitest bench`).

## Coverage (`pnpm coverage`)

```bash
pnpm coverage                    # unit only
pnpm coverage --integration      # unit + integration, starts its own containers
pnpm coverage --allow-failures   # report even when a test failed (exit 0)
pnpm coverage --server           # server code only: what is untested, worst first
```

Prints a per-package table worst-first and one total, and writes into `coverage/`:

| file | for |
|---|---|
| `coverage-final.json` | merged istanbul, input to any other reporter |
| `lcov.info` | Codecov, SonarQube, editors |
| `cobertura-coverage.xml` | GitLab's `artifacts:reports:coverage_report` |
| `html/index.html` | reading it by hand |

The last line is `Coverage: NN.NN% of statements`, which is what GitLab's `coverage:` regex
reads. A failing test fails the command unless `--allow-failures` is passed.

Two runners feed it: jest for everything with a `jest.config.js`, vitest (istanbul provider) for
`packages/ui`. Packages that jest cannot run together - `desktop` and `presentation` declare
their own `projects`, which jest will not nest - get their own invocation; flattened into the
shared run they lose their preset and babel then fails to parse TypeScript.

Two things the number does not include, both reported as separate lines:

- packages with a `src/` and no test at all - they are in neither report, so they cannot be
  told apart from 0% any other way
- `.svelte` outside `packages/ui`, which no runner mounts

### Stand coverage (`pnpm coverage:stand`)

`ws-tests/api-tests` (26 files, 301 cases) and the Playwright suites drive a live stand, so the
server code they exercise runs inside containers where istanbul cannot see it. V8 can: each pod is
started with `NODE_V8_COVERAGE` and drops a profile of its bundle when it exits, and the pods'
external sourcemaps map that back onto `src/`.

```bash
cd ws-tests
STAND_EXTRA_COMPOSE=docker-compose.coverage.yaml ./prepare.sh
cd api-tests && pnpm run api-test && cd ..
docker compose -f docker-compose.yaml -f docker-compose.coverage.yaml -p sanity stop -t 60
cd .. && pnpm coverage:stand              # writes coverage-stand.json
pnpm coverage --integration --stand        # folds it into the whole-repo number
```

Two rules, both of which silently produce nothing when broken:

- **Stop the stand, never kill it.** V8 writes the profile as the process exits; `down`, `kill` and
  a stop that runs past its grace period lose everything that pod collected.
- **The images must be built from the checkout.** The profile carries ranges of the bundle in the
  image, and the sourcemap used to decode it is the one on disk - a stale image maps its ranges
  onto whatever lines that file has now.

`docker-compose.coverage.yaml` mounts one directory per image name, which is how
`stand-coverage.js` finds each pod's bundle. Adding a pod to the collection is one more block there.

### `--server`: where to write the next test

`pnpm coverage --integration --server` replaces the per-package table with three lists over
`foundations/net`, `foundations/server`, `pods`, `server`, `server-plugins` and `services`
(`-assets` and `model-*` packages are left out - they are declarations):

1. **Server packages with no coverage report at all.** No test ever runs there, so they are in no
   istanbul report; size is counted from `src/` in lines, biggest gap first.
2. **Server files at 0%, inside packages that do run tests.** These are in the report only because
   of `--collectCoverageFrom`; no test ever reached them.
3. **Server packages by coverage, worst first**, plus a SERVER total over the packages that have a
   report.

## UI tests (Playwright)

UI tests run against a full Docker stand, not against sources - build the images first. Full setup (version-override variant, AI bot `@llm` suite, allure, debug/codegen) is in [`tests/readme.md`](../tests/readme.md).

```bash
pnpm install --frozen-lockfile
pnpm docker:build

cd tests
./prepare-pg.sh          # create test containers and set up the test database

cd sanity
pnpm run uitest
```

`prepare-cockroach.sh` is the CockroachDB variant of the same stand. After changing application code, rebuild (`pnpm docker:build`) and re-run `./prepare-pg.sh` - Playwright tests exercise the built bundle, not the source tree.

Flags (`-g "<title>"`, `--workers=1` for love/meetings), tracing, flake diagnosis (`analyze_failures.js`) and the whole-run profiling harness (`do-test.sh`) are in the "Sanity tests (Playwright)" section of [`AGENTS.md`](../AGENTS.md).

## Integration tests

- `ws-tests/` - workspace, API and backup integration tests. `ws-tests/prepare.sh` sets up the stand, `prepare_data.sh` seeds it. Run with `cd ws-tests/api-tests && pnpm run api-test` and `cd ws-tests/backup-tests && pnpm run backup-test`.
- `qms-tests/` - controlled-documents (QMS) suite, its own stand (`./prepare-qms.sh`, same ports as `tests/` - run one at a time). UI tests: `cd qms-tests/sanity && pnpm run uitest`.

## CI

All server-side checks run in one job, `ci_test.sh`, right after `pnpm bundle`:

1. `common/scripts/docker-api.sh` builds the images of the services in `ws-tests/docker-compose.yaml` from the bundles on disk. No web UI: `front` is built with an empty `dist/`, since the api-tests only need its `/config.json`, and the webpack bundle is most of a full image build.
2. The ws-tests stand comes up with `docker-compose.coverage.yaml`, `ws-tests/api-tests` and `ws-tests/backup-tests` run against it, the stand is stopped (not downed) and `pnpm coverage:stand` turns the pods' V8 profiles into `coverage-stand.json`.
3. `pnpm coverage --integration --stand` runs the unit and integration groups under istanbul, folds the stand run in and is the gate for both jest groups.

`STAND_COVERAGE=true` is set for the api-tests; `rest.test.ts`'s `find avg` timing check returns early under it, since pods under `NODE_V8_COVERAGE` answer 2-3x slower.

- GitHub - the `build` job in `.github/workflows/main.yml` (bundle, then `ci_test.sh`); `docker-build` and `dist-build` hang off it. The job summary carries the TOTAL/STAND lines and the per-package table, `coverage/` goes up as the `coverage` artifact.
- GitLab - the `test` job in `.gitlab-ci.yml`, which runs `ci_test.sh` on a shell runner under the per-host stand lock (`.lock_stand`). The job reads the percentage off the last line with its `coverage:` regex and publishes `cobertura-coverage.xml` as the merge-request coverage report. `DOCKER_REGISTRY` is cleared for the stand: the images are local and tagged without one.

The Playwright suites (`tests/sanity`, `qms-tests`, `ws-tests/sanity`) stay in their own `uitest:*` jobs in GitLab and `uitest-*` jobs in GitHub, on full images including the web UI.

`wait-elastic.sh` takes its host from `ELASTIC_HOST` (default `localhost`) and now exits non-zero
when elasticsearch never answers, instead of reporting a healthy stand.

## Связанные документы

- [AGENTS.md](../AGENTS.md) - "Sanity tests (Playwright)" section: run flags, tracing, flake diagnosis, whole-run profiling.
- [tests/readme.md](../tests/readme.md) - full Playwright setup, AI bot tests, allure.
- [memory/sanity-flaky-tests.md](memory/sanity-flaky-tests.md) - recurring flake causes and fixes.
- [memory/sanity_love_wall_time.md](memory/sanity_love_wall_time.md) - where the love lane spends time.
- [memory/sanity_run_comparability.md](memory/sanity_run_comparability.md) - what makes two runs comparable.
- [memory/sanity_shared_workspace.md](memory/sanity_shared_workspace.md) - shared workspace per worker.
- [memory/test-phase-single-jest.md](memory/test-phase-single-jest.md) - unit test phase internals.
- [memory/test-run-telemetry.md](memory/test-run-telemetry.md) - sanity run telemetry tooling.
- [memory/ui-component-tests-vitest.md](memory/ui-component-tests-vitest.md) - Component tests in packages/ui (vitest)
