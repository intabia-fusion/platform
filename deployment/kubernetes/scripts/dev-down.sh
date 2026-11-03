#!/usr/bin/env bash
# Remove the local dev stand (namespace fusion-dev only). Forwards to down.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/down.sh" dev "$@"
