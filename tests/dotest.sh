#!/bin/bash

# Build, bring the stand up, run the sanity suite with telemetry.
#
#   ./dotest.sh        # one run
#   ./dotest.sh 10     # ten runs in a row
#   ./dotest.sh 1 swc,esbuild,terser   # the front rebuilt with each MINIFIER in turn, one run each
#
# Iterations restore the workspaces between runs (./restore-pg.sh) and leave the containers up:
# accounts and workspaces pile up in the account DB run after run, which is the point - the load
# grows and flakes that only show up on a used stand get their chance. Look at the summary the
# script prints at the end, or later: cd sanity && node telemetry/stability.js

set -euo pipefail

ITERATIONS="${1:-1}"
MINIFIERS="${2:-}"
if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ]; then
    echo "usage: $0 [iterations] [minifier,...]" >&2
    exit 1
fi

pnpm install --frozen-lockfile
pnpm -w build

FAILED=0
SUMMARY=()
run_suite() {
    local label="$1" failed=0
    local stamps=()
    ./prepare-pg.sh
    ./tool-pg.sh sync-indexes indexes.yaml --apply
    for ((i = 1; i <= ITERATIONS; i++)); do
        if [ "$i" -gt 1 ]; then
            echo "=== restore before run $i/$ITERATIONS ($label)"
            ./restore-pg.sh
        fi
        echo "=== run $i/$ITERATIONS ($label)"
        # A red run is data, not a reason to stop: the whole point is to collect several in a row.
        (cd sanity && pnpm run uitest:telemetry --workers 5) || failed=$((failed + 1))
        stamps+=("$(ls -1t sanity/runs | head -1)")
    done
    if [ "$ITERATIONS" -gt 1 ]; then
        echo
        (cd sanity && node telemetry/stability.js "${stamps[@]}")
    fi
    SUMMARY+=("$label: $failed of $ITERATIONS runs failed, runs: ${stamps[*]}")
    FAILED=$((FAILED + failed))
}

if [ -z "$MINIFIERS" ]; then
    pnpm -w docker
    run_suite default
else
    for m in ${MINIFIERS//,/ }; do
        echo "=== minifier $m"
        # The build cache does not see MINIFIER: drop the front's entries so the bundle and the image are rebuilt.
        rm -f ../dev/prod/.fast-build-cache.json ../pods/front/.fast-build-cache.json
        MINIFIER="$m" pnpm -w docker
        run_suite "$m"
    done
fi

echo
printf '%s\n' "${SUMMARY[@]}"
exit "$FAILED"
