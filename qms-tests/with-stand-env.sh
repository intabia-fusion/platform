#!/usr/bin/env bash
#
# with-stand-env.sh for the qms stand: resolves STAND_URL/ACCOUNTS_URL/... for
# https://qms.fusion.localhost (see deployment/kubernetes/scripts/with-stand-env.sh)
# and runs the command with the stand's postgres port-forward. Runtime-patched
# copy of the shared script for the same reason as prepare-qms.sh - it still
# whitelists sanity|ws|api; drop this wrapper once it knows qms.
#
#   ./with-stand-env.sh [k3d|kind|existing] <cmd...>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_SCRIPTS="$(cd "$SCRIPT_DIR/../deployment/kubernetes/scripts" && pwd)"

PATCHED="$(mktemp -t with-stand-env-qms.XXXXXX.sh)"
trap 'rm -f "$PATCHED"' EXIT

awk '
  {
    gsub(/\|ws\|api/, "|ws|api|qms")
    if ($0 ~ /^SCRIPT_DIR="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)"$/)
      print "SCRIPT_DIR=\"'"$K8S_SCRIPTS"'\""
    else
      print
  }
' "$K8S_SCRIPTS/with-stand-env.sh" > "$PATCHED"

grep -q 'sanity|ws|api|qms' "$PATCHED" || \
  { echo "with-stand-env.sh: stand whitelist anchor lost in with-stand-env.sh" >&2; exit 1; }
grep -q "SCRIPT_DIR=\"$K8S_SCRIPTS\"" "$PATCHED" || \
  { echo "with-stand-env.sh: SCRIPT_DIR anchor lost in with-stand-env.sh" >&2; exit 1; }

exec bash "$PATCHED" qms "$@"
