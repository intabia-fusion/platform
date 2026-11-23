# backup-tests

Backup/restore tests against a live stand. They go through the server-side
backup pipeline (same path `pods/backup` uses), not through a client API.

## Run

The api-tests compose stand is the default: `api-tests/api` brings it up and
leaves it for this package, which takes it down. Run both after
`common/scripts/docker-api.sh`:

```
pnpm run backup-test
```

To run against a stand you prepared yourself instead, take the lifecycle out of
the run:

```
cd api-tests/backup
API_STAND=external pnpm run backup-test
```

Defaults target that stand: `http://localhost:8183` for the platform URLs and
`localhost:5533` / `localhost:9102` for postgres / minio.

A local k3d/k3s stand is the other variant: `pnpm run backup-test:k8s` sets its
own defaults (`https://api.fusion.localhost`, `api` databases, `api-backups`
bucket) and drives the stand through `with-stand-env.sh` - see
[`deployment/kubernetes/README.md`](../../deployment/kubernetes/README.md).

Overridable: `DB_URL`, `ACCOUNT_DB_URL`, `ACCOUNTS_URL`, `STORAGE_CONFIG`,
`SERVER_SECRET`, `FRONT_URL`, `BACKUP_TEST_WS` (default `api-tests`),
`BACKUP_STORAGE_CONFIG`, `BACKUP_BUCKET_NAME`.

## Suites

- `backup-incremental` -- backup/restore through the server-side pipeline.
- `backup-retention` -- archives of deleted workspaces. The grace period is configured in days, so
  the tests move `last_processing_time` back in the account DB rather than waiting; they call the
  cleanup directly and need no running pod.
- `backup-service` -- the `backup` pod itself: it must pick a freshly created workspace up on its
  own within a few minutes. Needs the pod up (it is part of `docker-compose.yaml`).

The archive bucket lives in minio, published on `localhost:9102` for these tests.

Not part of `_phase:test` -- these need the full environment, so CI must run
`backup-test` explicitly.
