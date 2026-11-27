#!/usr/bin/env bash
#
# with-stand-env.sh for the qms stand: the shared script whitelists qms, this wrapper keeps the
# qms suite path and pins the stand name. Usage: ./with-stand-env.sh [k3d|kind|existing] <cmd...>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/../deployment/kubernetes/scripts/with-stand-env.sh" qms "$@"
