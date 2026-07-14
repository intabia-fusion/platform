#!/usr/bin/env bash
set -euo pipefail

# SQL-load benchmark runner.
# Drives the mixed-domain load (sql-load.benchmark) across two axes:
#   - number of workspaces (BENCH_WORKSPACES)
#   - index coverage: with-indexes vs without-indexes (drop secondary indexes)
# Between runs it wipes the server-side stats (top-N SQL registry) so each
# slow-SQL report reflects only that run, then collects stats-slow-sql --json
# with index-coverage annotations.
#
# Prereqs: a running PG test stand (cd tests && ./prepare-pg.sh) with the
# stats host port exposed (4901) and the transactor reachable on 8083.
#
# Tunables (env): BENCH_WORKSPACES, BENCH_PERSONS, BENCH_CHANNELS,
#   BENCH_MSGS_PER_CHANNEL, BENCH_ISSUES, BENCH_MEETINGS, BENCH_QUERY_ITERS.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WS_DIR="$ROOT/ws-tests"
OUT_DIR="${BENCH_STATS_DIR:-/tmp/bench-stats}"

# Index dump used for coverage checks and for restoring indexes after a drop run.
# Default points at the deployment dump; override with INDEXES_YAML.
INDEXES_YAML="${INDEXES_YAML:-$ROOT/../fusion-deployment/deployments/indexes.yaml}"

# Host endpoints of the test stand.
export BENCH_URL="${BENCH_URL:-http://localhost:8083}"
STATS_URL="${STATS_URL:-http://localhost:4901}"
# Direct postgres (not pgbouncer) for DDL - transaction pooling breaks some DDL.
export DB_URL="${DB_URL:-postgresql://postgres:postgres@localhost:5433/postgres}"
export SERVER_SECRET="${SERVER_SECRET:-secret}"

export BENCH_SQL_LOAD=1
export BENCH_STATS_DIR="$OUT_DIR"
export BENCH_WORKSPACES="${BENCH_WORKSPACES:-sanity-ws}"

export ACCOUNTS_URL=http://localhost:8083/_account

# How long to wait after the load for services to flush stats to the stats pod.
# Services push every METRICS_UPDATE_INTERVAL; give it a couple of cycles.
STATS_SETTLE_SECS="${STATS_SETTLE_SECS:-15}"

mkdir -p "$OUT_DIR"

if [ ! -f "$INDEXES_YAML" ]; then
  echo "WARN: indexes YAML not found at $INDEXES_YAML"
  echo "      coverage checks and index restore will be skipped/limited."
  echo "      Set INDEXES_YAML=<path> to enable. Generate via: rushx run -- dump-indexes <file>"
fi

# tool-europe.sh uses paths relative to ws-tests/ (../common, ../dev, ./region-config.yaml),
# so it must be invoked with ws-tests/ as cwd - not from ws-tests/api-tests/.
run_tool () {
  ( cd "$WS_DIR" && ./tool-europe.sh "$@" )
}

# Admin token wipe of stats: PUT /api/v1/manage?operation=wipe-statistics.
# The tool mints the token; we reach the stats pod directly on the host port.
wipe_stats () {
  echo "==> Wiping server stats"
  run_tool stats-wipe --url "$STATS_URL" || echo "   stats-wipe failed (continuing)"
}

collect_slow_sql () {
  local tag="$1"
  echo "==> Collecting slow-SQL [$tag]"
  local idxArg=""
  if [ -f "$INDEXES_YAML" ]; then
    idxArg="--indexes $INDEXES_YAML"
  fi
  # both registries (find + tx), sorted by p95, full JSON with coverage.
  run_tool stats-slow-sql --url "$BENCH_URL" --kind both --sort p95 -n 100 \
    $idxArg --json "$OUT_DIR/slowsql-${tag}.json" \
    | tee "$OUT_DIR/slowsql-${tag}.log" || echo "   slow-sql collection failed for $tag"
}

run_bench () {
  local tag="$1"
  echo "==> Bench run [$tag] workspaces=$BENCH_WORKSPACES"
  BENCH_LABEL="$tag" rushx api-test --testPathPattern sql-load.benchmark \
    | tee "$OUT_DIR/bench-${tag}.log"
}

one_pass () {
  local tag="$1"
  wipe_stats
  run_bench "$tag"
  echo "==> Settling ${STATS_SETTLE_SECS}s for stats flush"
  sleep "$STATS_SETTLE_SECS"
  collect_slow_sql "$tag"
}

echo "==> Pass 1: WITH indexes"
one_pass "with-indexes"

echo "==> Dropping secondary indexes"
run_tool drop-indexes --apply | tee "$OUT_DIR/drop-indexes.log"

echo "==> Pass 2: WITHOUT indexes"
one_pass "without-indexes"

if [ -f "$INDEXES_YAML" ]; then
  echo "==> Restoring indexes from $INDEXES_YAML"
  run_tool apply-indexes "$INDEXES_YAML" --apply | tee "$OUT_DIR/apply-indexes.log"
else
  echo "WARN: no indexes YAML - indexes NOT restored. Re-create via sync-indexes/apply-indexes."
fi

echo
echo "==> Done. Artifacts in $OUT_DIR:"
ls -1 "$OUT_DIR"/slowsql-*.json "$OUT_DIR"/sqlload-*.json 2>/dev/null || true
echo
echo "==> Compare p95 of top FIND queries with vs without indexes:"
for tag in with-indexes without-indexes; do
  f="$OUT_DIR/slowsql-${tag}.json"
  [ -f "$f" ] || continue
  echo "--- $tag (top 5 by p95) ---"
  node -e '
    const g = require(process.argv[1]);
    g.sort((a,b)=>b.p95-a.p95).slice(0,5).forEach(x=>
      console.log(`  p95=${x.p95?.toFixed(1)}ms max=${x.maxMs?.toFixed(0)} cnt=${x.count} ${x.index?.covered===false?"[MISSING IDX]":""} ${x.table}: ${x.normalized?.slice(0,80)}`));
  ' "$f" 2>/dev/null || echo "  (could not parse $f)"
done
