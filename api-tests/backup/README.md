# backup-tests

Backup/restore tests against a live stand. They go through the server-side
backup pipeline (same path `pods/backup` uses), not through a client API.

## Run

The suite manages the `api` Kubernetes stand itself (reset + seed + teardown via
`api-tests/api/src/stand.ts`); `API_STAND` picks what a run does with it. To run
against a stand you prepared yourself instead, take the lifecycle out of the run:

```
cd api-tests/backup
API_STAND=external pnpm run backup-test
```

Defaults target the Kubernetes api stand: `https://api.fusion.localhost` for the
platform URLs and, for the duration of a managed run, postgres/s3/mailpit of
`platform-base` port-forwarded to `localhost:5533` / `localhost:9102` /
`localhost:8126`.

Overridable: `DB_URL`, `ACCOUNT_DB_URL`, `ACCOUNTS_URL`, `STORAGE_CONFIG`,
`SERVER_SECRET`, `FRONT_URL`, `BACKUP_TEST_WS` (default `api-tests`),
`BACKUP_STORAGE_CONFIG`, `BACKUP_BUCKET_NAME`.

## Suites

- `backup-incremental` -- backup/restore through the server-side pipeline.
- `backup-retention` -- archives of deleted workspaces. The grace period is configured in days, so
  the tests move `last_processing_time` back in the account DB rather than waiting; they call the
  cleanup directly and need no running pod.
- `backup-service` -- the `backup` pod itself: it must pick a freshly created workspace up on its
  own within a few minutes. Needs the pod up (it is part of the `api` stand chart).

The archive bucket lives in the platform-base S3, port-forwarded to
`localhost:9102` for these tests (`BACKUP_STORAGE_CONFIG`).

Not part of `_phase:test` -- these need the full environment, so CI must run
them explicitly.
