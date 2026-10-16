#!/bin/bash

# Build, bring the QMS stand up, run the QMS suite. Same flow as tests/dotest.sh, without the
# telemetry and minifier modes: qms-tests/sanity has no telemetry runner.
#
#   ./dotest.sh        # one run
#   ./dotest.sh 10     # ten runs in a row
#
# Iterations restore the workspace between runs (./restore-workspace.sh) and leave the containers up,
# so flakes that only show up on a used stand get their chance.

set -euo pipefail

ITERATIONS="${1:-1}"
if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ]; then
    echo "usage: $0 [iterations]" >&2
    exit 1
fi

pnpm install --frozen-lockfile
pnpm -w build
pnpm -w docker

./prepare-qms.sh

FAILED=0
for ((i = 1; i <= ITERATIONS; i++)); do
    if [ "$i" -gt 1 ]; then
        echo "=== restore before run $i/$ITERATIONS"
        ./restore-workspace.sh
    fi
    echo "=== run $i/$ITERATIONS"
    # A red run is data, not a reason to stop: the whole point is to collect several in a row.
    (cd sanity && pnpm run uitest) || FAILED=$((FAILED + 1))
done

echo
echo "$FAILED of $ITERATIONS runs failed"
exit "$FAILED"
