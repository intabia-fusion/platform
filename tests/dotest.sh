#!/bin/bash

# Build, prepare the stand, run the sanity suite with telemetry against the stand's own front
# (no dev front). Usage: ./dotest.sh [iterations] [minifier,...]; workspaces restore between runs.

set -euo pipefail

ITERATIONS="${1:-1}"
MINIFIERS="${2:-}"
if ! [[ "$ITERATIONS" =~ ^[0-9]+$ ]] || [ "$ITERATIONS" -lt 1 ]; then
    echo "usage: $0 [iterations] [minifier,...]" >&2
    exit 1
fi

pnpm install --frozen-lockfile
pnpm -w build

# Push after `pnpm -w docker`: it rewrites the images the stand will run.
build_images() {
    pnpm -w docker
    bash ../deployment/kubernetes/scripts/push-images.sh sanity
}

FAILED=0
SUMMARY=()
# Reuse by default: in-place upgrade + pod restart beats a full namespace round-trip.
# CLEAN=1 forces uninstall, deploy, seed.
CLEAN="${CLEAN:-0}"
run_suite() {
    local label="$1" failed=0
    local stamps=()
    if [ "$CLEAN" = 1 ]; then
        ./prepare-pg.sh
    else
        ./prepare-pg.sh --reuse
    fi
    for ((i = 1; i <= ITERATIONS; i++)); do
        if [ "$i" -gt 1 ]; then
            echo "=== restore before run $i/$ITERATIONS ($label)"
            ./restore-pg.sh
        fi
        echo "=== run $i/$ITERATIONS ($label)"
        # A red run is data, not a reason to stop: collect several in a row. with-stand-env.sh
        # resolves the stand env (PLATFORM_URI/LOCAL_URL, BILLING_URL, MAILBOX_KAFKA_BROKER).
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
    build_images
    run_suite default
else
    for m in ${MINIFIERS//,/ }; do
        echo "=== minifier $m"
        # MINIFIER is not part of the build cache key: drop the front's entries to force a rebuild.
        rm -f ../dev/prod/.fast-build-cache.json ../pods/front/.fast-build-cache.json
        MINIFIER="$m" build_images
        run_suite "$m"
    done
fi

echo
printf '%s\n' "${SUMMARY[@]}"
exit "$FAILED"
