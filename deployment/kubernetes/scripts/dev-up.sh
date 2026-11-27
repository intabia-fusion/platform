#!/usr/bin/env bash
# Bring the local dev stand up (base is verified/used, not modified).
# Forwards all arguments to deploy.sh dev.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/deploy.sh" dev "$@"
