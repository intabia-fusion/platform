#!/usr/bin/env bash

# Reset the QMS workspace contents on the configured stand to the clean baseline via the
# dev/test-base restore (backup restore, membership, change-field post hook).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec bash "$SCRIPT_DIR/with-stand-env.sh" qms \
  env STAND_BACKEND=k3s K8S_STAND=qms \
  "$SCRIPT_DIR/../dev/test-base/run.sh" qms restore
