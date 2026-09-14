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
cd tests && ./prepare-tests.sh    # postgres, elastic, redpanda + migrations
cd .. && pnpm integration
pnpm integration -t 'name'        # jest flags pass through
```

Nine packages have `*.itest.ts` files: `postgres`, `elastic`, `minio`, `s3`, `kafka`,
`pod-fulltext`, `account`, `pod-ai-bot`, `pod-telegram-bot`. `minio`/`s3` and the `pod-ai-bot`
e2e suites skip themselves unless their env is configured (`AI_BOT_E2E=1`,
`AI_BOT_QUEUE_E2E=1`). `kafka` and `pod-fulltext` carry `testIsolated` and run one at a time -
together they exhaust the test redpanda's partition budget.

## Benchmarks (`pnpm bench`)

Never part of a CI phase. jest packages run through their own `jest.config.js` with the
`*.bench.ts` matcher and a 600s timeout; `packages/ui` runs its own `bench` script
(`vitest bench`).

## Coverage (`pnpm coverage`)

```bash
pnpm coverage                    # unit only
pnpm coverage --integration      # unit + integration, needs the stand
pnpm coverage --allow-failures   # report even when a test failed (exit 0)
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

## UI tests (Playwright)

UI tests run against a full Docker stand, not against sources - build the images first.

```bash
pnpm install --frozen-lockfile
pnpm docker

cd ./tests
./prepare-pg.sh          # create test containers and set up the test database

cd sanity
pnpm run uitest --workers 2
```

`prepare-cockroach.sh` is the CockroachDB variant of the same stand.

Useful variants inside `tests/sanity`:

```bash
pnpm run uitest -- -g 'test title'   # run a single test by title
pnpm run debug                       # headed run with the Playwright inspector
pnpm run codegen                     # record a new test
```

After changing application code, rebuild the images (`pnpm docker`) and re-run
`./prepare-pg.sh` - Playwright tests exercise the built bundle, not the source tree.

## Integration tests

- `ws-tests/` - workspace, API and backup integration tests. `ws-tests/prepare.sh` sets up
  the stand, `prepare_data.sh` seeds it.
- `qms-tests/` - controlled-documents (QMS) suite.

## Additional testing

This project is also tested with [BrowserStack](https://www.browserstack.com/).

## CI

Both pipelines run the unit group and then the coverage run, which repeats it together with the
integration group and is also that group's gate:

```bash
pnpm test --verbose        # unit, fails fast with a per-package report
pnpm coverage --integration
```

- GitHub - the `test` job in `.github/workflows/main.yml`. The tail of the run goes into the job
  summary and `coverage/` goes up as the `coverage` artifact.
- GitLab - the `test` job in `.gitlab-ci.yml`, which runs `ci_test.sh` on a shell runner that
  already has Docker. The job reads the percentage off the last line with its `coverage:` regex and
  publishes `cobertura-coverage.xml` as the merge-request coverage report; `html/` and `lcov.info`
  go up as artifacts.

The GitLab `test` job holds the per-host stand lock (`.lock_stand`), so it cannot overlap a
`uitest:*` job on the same runner.

The Playwright suites (`tests/sanity`, `qms-tests`, `ws-tests`) are their own `uitest:*` jobs in
GitLab and `uitest-*` jobs in GitHub; neither the unit nor the integration group touches them.

`wait-elastic.sh` takes its host from `ELASTIC_HOST` (default `localhost`) and now exits non-zero
when elasticsearch never answers, instead of reporting a healthy stand.
