#!/usr/bin/env bash
set -euo pipefail

DUR=${1:-60}
export BENCH_DURATION="$DUR"
TMP=$(mktemp)

echo "Running TMGR benchmark for ${DUR}s..."
# Run only the benchmark test by name
npx jest --runInBand --testNamePattern='TMGR benchmark' 2>&1 | tee "${TMP}"

# Extract lines
# Extract last well-formed benchmark lines using strict regex
DURATION_LINE=$(grep -Eo 'duration: [0-9]+ms, ops: [0-9]+, ops/s: [0-9]+' "${TMP}" | tail -n1 || true)
MEM_HEAP_LINE=$(grep -Eo 'memory delta \(heapUsed\): *-?[0-9]+' "${TMP}" | tail -n1 || true)
MEM_RSS_LINE=$(grep -Eo 'memory \(rss\) delta: *-?[0-9]+' "${TMP}" | tail -n1 || true)

if [[ -n "${DURATION_LINE}" ]]; then
  DURATION_MS=$(echo "${DURATION_LINE}" | sed -E 's/duration: ([0-9]+)ms, .*/\1/')
  OPS=$(echo "${DURATION_LINE}" | sed -E 's/.*ops: ([0-9]+),.*/\1/')
  OPS_S=$(echo "${DURATION_LINE}" | sed -E 's/.*ops\/s: ([0-9]+).*/\1/')
else
  echo "Benchmark output not found. Dumping test output for debugging:" >&2
  sed -n '1,200p' "${TMP}" >&2
  exit 1
fi

HEAP_DELTA=$(echo "${MEM_HEAP_LINE}" | sed -E 's/.*memory delta \(heapUsed\): *(-?[0-9]+).*/\1/' || true)
RSS_DELTA=$(echo "${MEM_RSS_LINE}" | sed -E 's/.*memory \(rss\) delta: *(-?[0-9]+).*/\1/' || true)

HEAP_DELTA=${HEAP_DELTA:-0}
RSS_DELTA=${RSS_DELTA:-0}

if [[ -n "${OPS}" && "${OPS}" -gt 0 ]]; then
  HEAP_PER_OP=$((HEAP_DELTA / OPS))
  RSS_PER_OP=$((RSS_DELTA / OPS))
else
  HEAP_PER_OP=0
  RSS_PER_OP=0
fi

cat <<EOF
BENCHMARK SUMMARY
-----------------
duration_ms: ${DURATION_MS}
ops: ${OPS}
ops_per_sec: ${OPS_S}
heap_delta: ${HEAP_DELTA}
rss_delta: ${RSS_DELTA}
heap_per_op: ${HEAP_PER_OP}
rss_per_op: ${RSS_PER_OP}
EOF

rm -f "${TMP}"
