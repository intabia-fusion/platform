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

# One stand per host: the compose stand and a k3d cluster share the Docker VM. The lock also
# checks that the VM has the memory/disk the backend needs.
STAND_BACKEND="${STAND_BACKEND:-compose}"
LOCK_BACKEND="$([ "$STAND_BACKEND" = k3s ] && echo k3s || echo compose)"

# Children pick the stand by these: dev/test-base/run.sh chooses compose unless STAND_BACKEND says
# k3s (the host restore is Compose only), and with-stand-env.sh forwards to the runtime it is given.
export STAND_BACKEND
[ -z "${STAND_RUNTIME:-}" ] || export STAND_RUNTIME

# The claim covers the whole run and is dropped on any exit, so a failed build or suite does not
# leave the host claimed. Only this script's own record goes; nested claims from
# dev/test-base/run.sh are separate records.
release_lock() {
    local rc=$?
    ../common/scripts/stand-lock.sh release "$LOCK_BACKEND" dotest || true
    exit "$rc"
}
../common/scripts/stand-lock.sh acquire "$LOCK_BACKEND" dotest
trap release_lock EXIT

# `pnpm -w docker` rewrites the images the stand will run. A k3d stand pulls them from the
# registry, but the push belongs to the prepare: deploy.sh pushes after base-up has created the
# registry, so at build time a cold host has nowhere to push yet. A compose stand runs the local
# images as built.
build_images() {
    pnpm -w docker
}

FAILED=0
SUMMARY=()
# k3s reuses by default: in-place upgrade + pod restart beats a full namespace round-trip;
# CLEAN=1 forces uninstall, deploy, seed. Compose always does a full prepare: the images are
# rebuilt right before the runs, and a restore on the running stand would keep the previous
# build's containers, so the suite would test stale code.
CLEAN="${CLEAN:-0}"
prepare_stand() {
    if [ "$STAND_BACKEND" != k3s ]; then
        ./prepare-pg.sh
        return
    fi
    if [ "$CLEAN" = 1 ]; then
        bash ../deployment/kubernetes/scripts/prepare-test-stand.sh sanity ${STAND_RUNTIME:+"$STAND_RUNTIME"}
    else
        STAND_REUSE=1 bash ../deployment/kubernetes/scripts/prepare-test-stand.sh sanity ${STAND_RUNTIME:+"$STAND_RUNTIME"}
    fi
}
run_suite() {
    local label="$1" failed=0
    local stamps=()
    prepare_stand
    for ((i = 1; i <= ITERATIONS; i++)); do
        if [ "$i" -gt 1 ]; then
            if [ "$STAND_BACKEND" = k3s ]; then
                # A k3s stand cannot be restored from the host: Strimzi and Redpanda advertise
                # in-cluster DNS, so KafkaJS connects to an address the host cannot resolve.
                # Reseed in-cluster through the prepare instead.
                echo "=== reseed before run $i/$ITERATIONS ($label)"
                prepare_stand
            else
                echo "=== restore before run $i/$ITERATIONS ($label)"
                ./restore-pg.sh
            fi
        fi
        echo "=== run $i/$ITERATIONS ($label)"
        # A red run is data, not a reason to stop: collect several in a row. A k3d stand needs
        # with-stand-env.sh for PLATFORM_URI/BILLING_URL and the Kafka forward; a compose stand
        # already listens on :8083 and telemetry/run.sh defaults to it.
        if [ "$STAND_BACKEND" = k3s ]; then
            # The .auth files hold cookies for one origin: a state saved against the compose stand
            # silently logs the browser out on the stand's own HTTPS host.
            rm -rf sanity/.auth
            (cd sanity && bash ../../deployment/kubernetes/scripts/with-stand-env.sh sanity pnpm run uitest:telemetry --workers 5) || failed=$((failed + 1))
        else
            (cd sanity && pnpm run uitest:telemetry --workers 5) || failed=$((failed + 1))
        fi
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
