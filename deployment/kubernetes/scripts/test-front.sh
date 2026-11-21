#!/usr/bin/env bash
# Start webpack dev-server against a test stand (default sanity).
set -euo pipefail
TEST="${1:-sanity}"
[ $# -gt 0 ] && shift
case "$TEST" in sanity|ws|api) ;; *) echo "usage: test-front.sh [sanity|ws|api] [runtime]" >&2; exit 2 ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PORT="${STAND_FRONT_PORT:-8081}"
exec "$SCRIPT_DIR/dev-front.sh" "$TEST" "$@"
