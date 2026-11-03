#!/usr/bin/env bash
# Remove a test stand. Forwards to down.sh; same data-retention behavior.
#
#   test-down.sh [sanity|ws|api] [k3d|kind|existing] [--yes]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST=
case "${1:-sanity}" in
  sanity|ws|api) TEST="$1"; shift ;;
  *) echo "usage: test-down.sh [sanity|ws|api] [runtime] [--yes]" >&2; exit 2 ;;
esac
exec "$SCRIPT_DIR/down.sh" "$TEST" "$@"
