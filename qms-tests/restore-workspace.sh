#!/usr/bin/env bash

# Restores the QMS workspace contents on the configured Kubernetes stand
# (qms-tests/prepare-qms.sh) back to the clean baseline: re-runs the qms stand
# restore (backup restore, membership, the change-field post hook) through the
# local dev/test-base tool against the stand.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec bash "$SCRIPT_DIR/with-stand-env.sh" qms \
  env STAND_BACKEND=k3s K8S_STAND=qms \
  "$SCRIPT_DIR/../dev/test-base/run.sh" qms restore
