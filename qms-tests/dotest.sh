#!/usr/bin/env bash

# Build, bring the QMS Kubernetes stand up, run the QMS suite through the webpack
# front proxy. Same flow as tests/dotest.sh, without the telemetry and minifier
# modes: qms-tests/sanity has no telemetry runner.
#
#   ./dotest.sh        # one run
#   ./dotest.sh 10     # ten runs in a row
#
# Iterations restore the workspace between runs (./restore-workspace.sh) and leave
# the stand up, so flakes that only show up on a used stand get their chance.

set -euo pipefail

ITERATIONS="${1:-1}"
if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ]; then
    echo "usage: $0 [iterations]" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pnpm install --frozen-lockfile
pnpm -w build
# The webpack dev-server bundle (uitest:k8s drives the browser through it).
pnpm build --to @hcengineering/prod --esbuild-emit

./prepare-qms.sh

# The webpack dev-server the uitest:k8s browser runs against; it proxies to the
# stand over https with the mkcert CA. :8081 is the sanity proxy's port - set
# STAND_FRONT_PORT to run both at once.
FRONT_PORT="${STAND_FRONT_PORT:-8081}"
./stand-front.sh > /tmp/qms-stand-front.log 2>&1 &
FRONT_PID=$!
trap 'kill "$FRONT_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:${FRONT_PORT}/" >/dev/null 2>&1; then break; fi
    sleep 5
done
if ! curl -fsS "http://localhost:${FRONT_PORT}/" >/dev/null 2>&1; then
    echo "stand front proxy did not come up on :${FRONT_PORT}; log follows" >&2
    cat /tmp/qms-stand-front.log >&2 || true
    exit 1
fi

FAILED=0
for ((i = 1; i <= ITERATIONS; i++)); do
    if [ "$i" -gt 1 ]; then
        echo "=== restore before run $i/$ITERATIONS"
        ./restore-workspace.sh
    fi
    echo "=== run $i/$ITERATIONS"
    # A red run is data, not a reason to stop: the whole point is to collect several in a row.
    (cd sanity && pnpm run uitest:k8s) || FAILED=$((FAILED + 1))
done

echo
echo "$FAILED of $ITERATIONS runs failed"
exit "$FAILED"
