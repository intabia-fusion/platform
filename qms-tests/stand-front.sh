#!/usr/bin/env bash
#
# QMS counterpart of `pnpm -w stand:test:front qms`: runtime-patched dev-front.sh, which still
# whitelists dev|sanity|ws|api. Serves on STAND_FRONT_PORT. Usage: ./stand-front.sh [runtime]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_SCRIPTS="$(cd "$SCRIPT_DIR/../deployment/kubernetes/scripts" && pwd)"

PATCHED="$(mktemp -t dev-front-qms.XXXXXX.sh)"
trap 'rm -f "$PATCHED"' EXIT

awk '
  {
    gsub(/\|ws\|api/, "|ws|api|qms")
    if ($0 ~ /^SCRIPT_DIR="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)"$/)
      print "SCRIPT_DIR=\"'"$K8S_SCRIPTS"'\""
    else
      print
  }
' "$K8S_SCRIPTS/dev-front.sh" > "$PATCHED"

grep -q 'dev|sanity|ws|api|qms' "$PATCHED" || \
  { echo "stand-front.sh: stand whitelist anchor lost in dev-front.sh" >&2; exit 1; }
grep -q "SCRIPT_DIR=\"$K8S_SCRIPTS\"" "$PATCHED" || \
  { echo "stand-front.sh: SCRIPT_DIR anchor lost in dev-front.sh" >&2; exit 1; }

export PORT="${STAND_FRONT_PORT:-8081}"
exec bash "$PATCHED" qms "$@"
