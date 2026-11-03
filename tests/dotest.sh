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

# The Kubernetes stand pulls the images the build just made from the cluster
# registry; pushing them is what a fresh front bundle reaching the pods takes.
bash ../deployment/kubernetes/scripts/push-images.sh sanity

# The suite drives the browser through the webpack dev-server proxy into the
# stand (same wiring as uitest:k8s); it must be up before the telemetry run.
FRONT_PORT="${STAND_FRONT_PORT:-8081}"
bash ../deployment/kubernetes/scripts/test-front.sh > /tmp/sanity-stand-front.log 2>&1 &
FRONT_PID=$!
trap 'kill "$FRONT_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
    if curl -fsS "http://localhost:${FRONT_PORT}/" >/dev/null 2>&1; then break; fi
    sleep 5
done
if ! curl -fsS "http://localhost:${FRONT_PORT}/" >/dev/null 2>&1; then
    echo "stand front proxy did not come up on :${FRONT_PORT}; log follows" >&2
    cat /tmp/sanity-stand-front.log >&2 || true
    exit 1
fi
export LOCAL_URL="http://localhost:${FRONT_PORT}/_account/"
export PLATFORM_URI="http://localhost:${FRONT_PORT}"

FAILED=0
SUMMARY=()
run_suite() {
    local label="$1" failed=0
    local stamps=()
    ./prepare-pg.sh
    for ((i = 1; i <= ITERATIONS; i++)); do
        if [ "$i" -gt 1 ]; then
            echo "=== restore before run $i/$ITERATIONS ($label)"
            ./restore-pg.sh
        fi
        echo "=== run $i/$ITERATIONS ($label)"
        # A red run is data, not a reason to stop: the whole point is to collect several in a row.
        # with-stand-env resolves the canonical k8s env (BILLING_URL via the front proxy origin,
        # MAILBOX_KAFKA_BROKER over its managed Kafka port-forward) around the telemetry run.
        (cd sanity && bash ../../deployment/kubernetes/scripts/with-stand-env.sh sanity pnpm run uitest:telemetry --workers 5) || failed=$((failed + 1))
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
