#!/usr/bin/env bash

# Resets the sanity stand workspaces to their backup baseline without touching the containers.
# Compose only: a k3s stand is restored in-cluster (see the check below), not from the host.

set -e

STAND="${STAND:-sanity}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${STAND_BACKEND:-compose}" = k3s ]; then
    echo "ERROR: cannot restore a k3s stand from the host: Strimzi and Redpanda advertise in-cluster DNS, so the restore's KafkaJS client cannot reach the broker. Reseed in-cluster instead: STAND_REUSE=1 bash deployment/kubernetes/scripts/prepare-test-stand.sh $STAND" >&2
    exit 1
fi

exec "$SCRIPT_DIR/../dev/test-base/run.sh" "$STAND" restore
