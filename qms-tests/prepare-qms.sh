#!/usr/bin/env bash
#
# QMS stand on the configured cluster: a runtime-patched prepare-test-stand.sh qms (the shared
# one whitelists sanity|ws|api), seeded from qms-tests/sanity-ws-qms. Usage: ./prepare-qms.sh [runtime]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_SCRIPTS="$(cd "$SCRIPT_DIR/../deployment/kubernetes/scripts" && pwd)"

PATCHED="$(mktemp -t prepare-test-stand-qms.XXXXXX.sh)"
trap 'rm -f "$PATCHED"' EXIT

awk '
  # the tool pod works from /workspace; put the QMS dump next to the other dumps
  /^if \[ "\$STAND_NAME" = sanity \]; then$/ {
    print "if [ \"$STAND_NAME\" = qms ]; then"
    print "  kc cp \"$REPO_ROOT/qms-tests/sanity-ws-qms\" \"$STAND_NS/stand-tool:/workspace/qms-tests/sanity-ws-qms\""
    print "fi"
    print ""
  }
  {
    # accept qms everywhere the stand whitelist is spelled out
    gsub(/\|ws\|api/, "|ws|api|qms")
    # the copy lives outside the scripts dir, so its SCRIPT_DIR must be pinned to the original
    if ($0 ~ /^SCRIPT_DIR="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)"$/)
      print "SCRIPT_DIR=\"'"$K8S_SCRIPTS"'\""
    else
      print
  }
' "$K8S_SCRIPTS/prepare-test-stand.sh" > "$PATCHED"

grep -q 'qms-tests/sanity-ws-qms' "$PATCHED" || \
  { echo "prepare-qms.sh: qms dump-copy anchor lost in prepare-test-stand.sh" >&2; exit 1; }
grep -q 'sanity|ws|api|qms' "$PATCHED" || \
  { echo "prepare-qms.sh: stand whitelist anchor lost in prepare-test-stand.sh" >&2; exit 1; }
grep -q "SCRIPT_DIR=\"$K8S_SCRIPTS\"" "$PATCHED" || \
  { echo "prepare-qms.sh: SCRIPT_DIR anchor lost in prepare-test-stand.sh" >&2; exit 1; }

# Stale Playwright storage state sends the suite back to the login screen; the patched copy
# clears tests/sanity/.auth and ws-tests/sanity/.auth, not this suite's one.
rm -rf "$SCRIPT_DIR/sanity/.auth"

exec bash "$PATCHED" qms "$@"
