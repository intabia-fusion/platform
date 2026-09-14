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
pnpm coverage                 # unit only
pnpm coverage --integration   # unit + integration, needs the stand
pnpm coverage --html          # also an HTML report (needs nyc)
```

Prints a per-package table worst-first and one total, and leaves a merged istanbul report in
`coverage/coverage-final.json`. Two runners feed it: jest for everything with a
`jest.config.js`, vitest (istanbul provider) for `packages/ui`.

Two things the number does not include, both reported as separate lines:

- packages with a `src/` and no test at all - they are in neither report, so they cannot be
  told apart from 0% any other way
- `.svelte` outside `packages/ui`, which no runner mounts

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
