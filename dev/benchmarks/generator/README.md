# Data generator (load provisioning)

Tools to build and move prod-shaped dataset for load/stress testing.

## dev/stand-snapshot.sh

Single dump/restore for any stand: Postgres + MinIO (blobs live there, not in
the SQL dump). Restore drops+recreates objects, then restarts platform services
so they drop cached workspace/model state (nginx last, it caches upstream IPs).

```
./stand-snapshot.sh dump    ~/Develop/private/bench-backups big-db   # STAND=sanity (default)
STAND=dev ./stand-snapshot.sh restore ~/Develop/private/bench-backups
SNAPSHOT_DB_URL=postgres://user:pass@host:5432/db ./stand-snapshot.sh dump big.dump   # remote, DB only
```

Local sanity stand: `BENCH_DUMP=<file> tests/prepare-pg.sh` restores
snapshot instead of seeding from scratch.

## generate-big / generate-data (dev/tool)

Data generator runs through full server pipeline (triggers,
activity, notifications, indexing), so lives in `dev/tool` (`gendata.ts`), not
here - needs server build, not light api-client this package uses.

- `generate-big <workspace>` - realistic mixed dataset (issues across projects,
  channels/threads, meetings, comments). Idempotent top-up: re-run to grow.
- `generate-data` - bulk tracker Issues only (fast fill path).

Run via tool wrapper so env (DB_URL, ACCOUNTS_URL, storage) set:
```
cd ws-tests && ./tool-europe.sh generate-big <ws-uuid> --projects 50 --tasks 100000
```

Full flag list and SQL-analysis commands: `dev/tool/BENCH.md`.
Plan and findings: `docs/perf-load-emulation.md`.