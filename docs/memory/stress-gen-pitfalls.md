# Bulk-generation & local-stand pitfalls (2026-07-08)

## generate-big hangs through pgbouncer

`dev/tool` bulk fill (`generate-big`) run in-process server pipeline with triggers.
`USE_RESERVE_CTX` (default true) pin ONE pg connection for duration of tx's trigger
processing. pgbouncer `pool_mode = transaction` return server connection to pool after
each transaction, so reserved connection cannot hold across trigger reads → fill
**hangs** (no output, process alive) after some volume (~258k issues observed).

Fix: run tool **direct to postgres** (session connections), not via pgbouncer.
`tests/tool-pg-direct.sh` copy of `tool-pg.sh` with `DB_URL`/`ACCOUNT_DB_URL` point at
`localhost:5433` (host-mapped postgres) not `:6433` (pgbouncer). Keep `USE_RESERVE_CTX`
ON — work correct on direct session connections.

NOT broadcast O(n^2) bug — `wrapPipeline` already drain `broadcast.txes`
(`foundations/server/packages/core/src/utils.ts:335`).

## pgbouncer restart leaves a stale pidfile

`docker compose ... restart pgbouncer` can leave `/var/run/pgbouncer/pgbouncer.pid`,
then new process die with `FATAL pidfile ... exists, another instance running?` in
crash loop. Use `up -d --force-recreate pgbouncer` (fresh container) not `restart`.

## Pool sizing (local stand)

- postgres `max_connections` default 100 (shared across all services). Raised to 300
  via `ALTER SYSTEM SET max_connections` + restart for headroom.
- pgbouncer `default_pool_size` 30 → 100 (`tests/pgbouncer/pgbouncer.ini`).
- Tool pool via `POSTGRES_OPTIONS='{"max":80}'`.

## Generator cohorts

`generate-big --cohorts count:size,...` (e.g. `900:500,90:5000,10:50000`) fill exact
size cohorts (added to `gendata.ts` BigGenOptions + CLI). Idempotent top-up;
process-level `unhandledRejection` guard + per-project try/catch keep long run alive.
Fill rate ~95-130/s issue-only (comments/updates ~30/s).