#!/bin/bash
# Two-scenario perf gate: few-space vs many-space workspace.
# Runs the hot cross-space reads against each, asserts p95 budgets, and dumps
# the per-scenario slow-SQL so a regression (missing ordered index) is visible.
# Exits non-zero if any budget is breached -> usable as a CI gate.
#
#   STATS_URL=http://localhost:8083/_stats ./scenario-perf.sh
set -uo pipefail
cd "$(dirname "$0")"

STATS_URL="${STATS_URL:-http://localhost:8083/_stats}"
ITERS="${ITERS:-30}"
# few-space (small install) first, then many-space (thousands of spaces).
WORKSPACES=("$@")
[ ${#WORKSPACES[@]} -eq 0 ] && WORKSPACES=(meetings-ws sanity-ws)

fail=0
for WS in "${WORKSPACES[@]}"; do
  ./tool-europe.sh stats-wipe --url "$STATS_URL" >/dev/null 2>&1
  ( node ../dev/benchmarks/harness/scenario-perf.mjs "$WS" "$ITERS" ) || fail=1
  echo "  --- slow-SQL (find, top 6 by max) ---"
  ./tool-europe.sh stats-slow-sql --url "$STATS_URL" --kind find -n 6 -s max 2>&1 \
    | grep -ivE "no document" | grep -E "^\s+[0-9]+\s" || true
done

if [ "$fail" -ne 0 ]; then
  echo "PERF GATE: FAIL (budget breach above)"
  exit 1
fi
echo "PERF GATE: PASS"
