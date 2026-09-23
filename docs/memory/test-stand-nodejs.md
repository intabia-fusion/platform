# Test stand setup in node (dev/test-base)

Область: [Getting started](../getting-started.md)

`tests/`, `ws-tests/` and `qms-tests/` no longer seed their stands from shell. `dev/test-base` (`@hcengineering/test-base`) owns docker compose, health checks, seeding and verification; the `prepare*.sh` scripts are thin shims around `dev/test-base/run.sh <stand> [prepare|restore]`.

Stands (`dev/test-base/src/stands.ts`): `sanity` (tests/, accounts admin/user1-4, workspaces sanity-ws + meetings-ws), `ws` (ws-tests/, needs a second "europe" region), `qms` (qms-tests/, a compose subset of tests/ with no payment/tbank/aibot/print/preview), `full` = `mergeStands(sanity, qms)`.

## Why the tool runs in-process

`dev/tool` used to be re-launched per command (`./tool-pg.sh create-account ...`). `devTool` was split (`dev/tool/src/index.ts`):

- `buildToolProgram(prepareTools)` (`index.ts`) returns a **fresh** commander tree; `devTool` (`index.ts`) is a thin wrapper around it. Commander stores parsed options on the command objects, so concurrent runs need separate programs.
- `initToolRuntime` (adapters, server plugins, process handlers) is guarded and runs once.
- `registerToolLocations` and `prepareTools` live in `dev/tool/src/setup.ts`; `runToolCommand(args)` (`index.ts`) is a separate entry point in `index.ts` that calls both and re-reads env per call. `prepareTools` caches the built model (`builder().getTxes()`); `prepareToolsRaw` still clones the txes per call, and `ACCOUNT_DB_URL`/`DB_URL` are re-read every time so regions can be switched.

`@hcengineering/tool` cannot be required from `lib/` in plain node: model packages import `@hcengineering/presentation/src/plugin`, which only resolves through esbuild. `dev/test-base` is therefore bundled too, and `run.sh` rebuilds `bundle/bundle.js` when a source file is newer.

## Constraints found the hard way

- **Restores must be serial.** `fillAccountUuids` (`models/contact/src/migration.ts`) holds a `traverse` cursor while issuing further queries; concurrent `backup-restore --upgrade` runs deadlock on pgbouncer (`pool_mode = transaction`) with no error - the process just stops at `filling account uuids...`. Everything else per workspace runs in parallel.
- **One env per phase.** The tool reads config from `process.env` at command time, so workspaces are grouped by region and `applyEnv` (`dev/test-base/src/tool.ts`) deletes keys the new env does not define (`REGION_INFO` would otherwise leak from the europe phase) via `Reflect.deleteProperty` - assigning `undefined` would set the string `'undefined'`.
- `docker compose up -d` blocks on container healthchecks in its own process, so the model warmup runs alongside it.

## Timings (local, macOS)

Legacy `prepare-pg.sh`: 42s wall / 16s CPU. New: ~41s wall / 3.3s CPU. Wall clock is dominated by `docker compose down+up` (~21s), not by seeding. `full` (4 workspaces, 6 accounts): ~56s.

`api-tests` needs a worker cap locally: `pnpm run api-test` (`ws-tests/api-tests/package.json`) lets jest use its default `cpus-1` workers, and 11 suites connecting at once starve the transactor into 60s `connect()` timeouts. `-w 3` (what a CI runner ends up with) is green. Unrelated to the stand.

## Merging stands

`mergeStands(base, ...others)` takes containers/env/regions from `base` and adds accounts, workspaces, post steps and cleanup paths from the others. Paths that belong to another stand (backups, `.auth` directories) are made absolute - they live next to the stand that defined them.

Two things to know about merging tests/ with qms-tests/:

- **`.auth` must be cleaned per suite.** Leaving `qms-tests/sanity/.auth` from a previous stand sends every QMS test straight back to the login screen (the setup skips login when the storage file exists). That is why `cleanup: ['sanity/.auth']` is merged, not taken from `base`.
- **An account's name is global, not per workspace.** `assign-workspace` materialises the Employee from the account's person, so a workspace backup does not override it. `user3` cannot be `Muffin Muram` for tests/ and a different person for qms-tests/ at the same time; QMS uses its own `user_cain` login (`PLATFORM_USER_THIRD='user_cain'` in `qms-tests/sanity/.env`).

`ws-tests` cannot join `full`: it needs a second (europe) region - `transactor-europe`, `workspace_europe`, `fulltext-europe` (`ws-tests/docker-compose.yaml`) - which the tests/ compose does not have.

The QMS suite is not idempotent - `TESTS-205` (`qms-tests/sanity/tests/documents/documents.spec.ts`) fails when run against a stand that has already had a full suite run against it, and passes on a fresh one. Not a stand regression.
