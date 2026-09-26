# CockroachDB dropped from the test lane (possible, not supported for now)

Область: [Architecture](../architecture.md)

Decision (2026-09-08): the unit test phase runs against pure PostgreSQL only. CockroachDB stays a *possible* backend - the adapter code and the cockroach stand are untouched - but nothing verifies it, so treat it as dropped until someone re-enables it.

`DB_URL` defaults to `postgresql://postgres:postgres@localhost:5433/postgres` everywhere it used to point at cockroach on 26258: `@hcengineering/postgres` (`integration.itest.ts`, `storage.itest.ts`, `storage-coverage.test.ts`), `pods/fulltext` (`src/__tests__/utils.ts`), `services/telegram-bot/pod-telegram-bot` (`postgres-real.itest.ts`, which used to run both flavors side by side and compare them - now 10 postgres-only tests). `POSTGRES_URL` is gone, only the telegram test used it. `tests/prepare-tests.sh` no longer starts or migrates cockroach; CI's `test` job env points `DB_URL` at postgres and no longer sets `POSTGRES_URL`.

Untouched and still cockroach: `tests/prepare-cockroach.sh`, `tests/docker-compose.cockroach.yaml`, `tests/tool-cockroach.sh`, the `uitest-cockroach` CI job (gated behind the `run-cockroach` dispatch input, default false), `foundations/server/tests/`. `server/account/src/__tests__/realDbFlavors.ts` is a separate, still-live opt-in cockroach overlay for the account migration suite (`ACCOUNT_TEST_CR_URL`), unrelated to this `DB_URL` change.

Speed: `@hcengineering/postgres` went 57.3s -> 10.5s, `pod-telegram-bot` 7.6s -> 0.8s. `pod-fulltext` unchanged at ~22s - it waits on kafka, not the database.

## Two bugs this uncovered

`baseDbUri.replace('defaultdb', dbUuid)` built the per-test database URI; a pg URL has no `defaultdb` segment, so the replace silently no-op'd and every test shared one database while `CREATE DATABASE` still created an orphan per test. Fixed by `withDatabase()` in `__tests__/utils.ts`, which rewrites the URI path segment instead.

`integration.itest.ts` dropped its database with `DROP DATABASE ... CASCADE` - cockroach syntax that postgres rejects, silently swallowed by the surrounding try/catch. `CASCADE` removed from the `DROP DATABASE IF EXISTS` call.

Still open: `storage.itest.ts` leaks a database per test. Its `afterEach` calls `serverStorage?.close()` on the outer `let serverStorage`, but `initDb()` declares its own `const serverStorage` and shadows it, so the outer variable stays `undefined` and `DROP DATABASE` never runs - every next attempt hits "database is being accessed by other users" and stalls ~5s. Fixing it means untangling the shadowed variable.
