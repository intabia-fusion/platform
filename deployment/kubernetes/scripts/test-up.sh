#!/usr/bin/env bash
# Bring a test stand up: sanity (default), ws, api or qms - namespace, host and regions come from
# stands/<stand>/values.yaml. Thin wrapper over deploy.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST=
case "${1:-sanity}" in
  sanity|ws|api|qms) TEST="$1"; shift ;;
  *) echo "usage: test-up.sh [sanity|ws|api|qms] [runtime] [--no-push|--dry-run]" >&2; exit 2 ;;
esac
exec "$SCRIPT_DIR/deploy.sh" "$TEST" "$@"
