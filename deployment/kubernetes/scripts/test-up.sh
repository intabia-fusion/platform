#!/usr/bin/env bash
# Bring a test stand up: sanity (default), ws or api.
#
#   test-up.sh [sanity|ws|api] [k3d|kind|existing] [--no-push|--dry-run]
#
#   sanity - namespace fusion-sanity, host sanity.fusion.localhost
#   ws     - namespace fusion-ws, host ws.fusion.localhost, two regions
#            (region-config: main + europe over one database - per-region
#            databases need the chart extension, see README)
#   api    - namespace fusion-api, host api.fusion.localhost
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST=
case "${1:-sanity}" in
  sanity|ws|api) TEST="$1"; shift ;;
  *) echo "usage: test-up.sh [sanity|ws|api] [runtime] [--no-push|--dry-run]" >&2; exit 2 ;;
esac
exec "$SCRIPT_DIR/deploy.sh" "$TEST" "$@"
