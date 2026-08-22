# Load / bench tooling (dev/tool)

Entry points to provision prod-like dataset on **any** platform instance, plus SQL analysis. See `docs/perf-load-emulation.md` for plan + findings.

## Generate data

- `generate-big <workspace>` — realistic mixed dataset through full server pipeline (triggers, activity, notifications). Flags:
  - `--projects N` — spread issues across N tracker projects (long-tailed)
  - `--tasks N` — total issues (split across projects)
  - `--status-dist "done=60,cancelled=15,inprogress=15,todo=7,backlog=3"` — status mix
  - `--channels N --threads <pct>` — channels + threaded messages
  - `--meetings N`, `--comments N`, `--updates N`, `--users N`, `--batch N`
  - `--scale <pct>` — scale all volumes off 1% defaults
  - `--json <file>` — write result + slow-SQL
  Idempotent top-up per project/channel: re-run to resume / grow.
- `generate-data` — bulk tracker Issues only (fast path, batch sweep for fill-rate).

Run via tool wrapper so env (DB_URL, ACCOUNTS_URL, storage) set:
`cd ws-tests && ./tool-europe.sh generate-big <ws-uuid> --projects 50 --tasks 100000 ...`

## Fast dump / restore (large volume, any instance)

`dev/stand-snapshot.sh` — Postgres + MinIO snapshot of a stand (`STAND=dev|sanity`), or DB-only against a remote `SNAPSHOT_DB_URL`:
```
./stand-snapshot.sh dump    ~/Develop/private/bench-backups big-db
./stand-snapshot.sh restore ~/Develop/private/bench-backups
SNAPSHOT_DB_URL=postgres://user:pass@host:5432/db ./stand-snapshot.sh dump big.dump
```
Restore drops+recreates objects then loads, and restarts platform services so they drop cached workspace/model state. In `SNAPSHOT_DB_URL` mode blobs are not included (they live in object storage).

Local sanity stand: `BENCH_DUMP=<file> tests/prepare-pg.sh` restores snapshot instead of seeding from scratch, restarts services auto. Snapshots live in `~/Develop/private/bench-backups/`.

## SQL analysis

- `stats-slow-sql --url <platform> --kind both -s p95` — slowest SQL shapes from server-side top-N registry (find + tx), with `--indexes <yaml>` coverage.
- `stats-wipe --url <platform>` — reset stats before measured scenario.
- `dump-indexes <file>` / `apply-indexes <file>` / `drop-indexes` — inspect / sync DB index set against prod `indexes.yaml`.