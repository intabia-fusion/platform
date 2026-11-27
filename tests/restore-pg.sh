#!/usr/bin/env bash

# Resets the sanity stand workspaces to their backup baseline without touching the containers.

set -e

STAND="${STAND:-sanity}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${STAND_BACKEND:-compose}" = k3s ]; then
    # The broker advertises in-cluster DNS, so a host restore must not touch the queue. The
    # restore tool runs with --noqueue under dev/test-base; with-stand-env forwards Postgres and
    # the HTTPS URLs only.
    export STAND_BACKEND=k3s STAND_KAFKA_FORWARD=0
    exec bash "$SCRIPT_DIR/../deployment/kubernetes/scripts/with-stand-env.sh" \
        "$STAND" ${STAND_RUNTIME:+"$STAND_RUNTIME"} \
        bash "$SCRIPT_DIR/../dev/test-base/run.sh" "$STAND" restore
fi

exec "$SCRIPT_DIR/../dev/test-base/run.sh" "$STAND" restore
