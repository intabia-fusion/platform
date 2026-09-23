# Testing

[← README](../README.md)

## Unit tests

```bash
pnpm test          # All tests, from the repository root
pnpm run test      # A single package, from inside its directory
pnpm test --to @hcengineering/core   # Scope to a package and its dependencies
```

Jest is configured at the root (`jest.config.js`); `pnpm jest` runs the shared runner directly.

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
