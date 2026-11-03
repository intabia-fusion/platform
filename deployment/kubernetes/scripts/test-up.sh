#!/usr/bin/env bash
# Bring a test stand up: sanity (default), ws or api.
#
#   test-up.sh [sanity|ws|api|qms] [k3d|kind|existing] [--no-push|--dry-run]
#
#   sanity - namespace fusion-sanity, host sanity.fusion.localhost
#   ws     - namespace fusion-ws, host ws.fusion.localhost, two regions
#            (main database wstest and europe database wstesteurope)
#   api    - namespace fusion-api, host api.fusion.localhost
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST=
case "${1:-sanity}" in
  sanity|ws|api|qms) TEST="$1"; shift ;;
  *) echo "usage: test-up.sh [sanity|ws|api|qms] [runtime] [--no-push|--dry-run]" >&2; exit 2 ;;
esac
exec "$SCRIPT_DIR/deploy.sh" "$TEST" "$@"
