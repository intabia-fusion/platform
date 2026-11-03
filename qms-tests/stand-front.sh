#!/usr/bin/env bash
#
# Webpack dev-server against the qms Kubernetes stand - the qms counterpart of
# `pnpm -w stand:test:front qms` (deployment/kubernetes/scripts/dev-front.sh,
# still limited to dev|sanity|ws|api; runtime-patched copy, same as
# prepare-qms.sh). Serves on http://localhost:${STAND_FRONT_PORT:-8081} and
# proxies to https://qms.fusion.localhost; set STAND_FRONT_PORT to run it next
# to the sanity front proxy (:8081).
#
#   ./stand-front.sh [k3d|kind|existing]
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
