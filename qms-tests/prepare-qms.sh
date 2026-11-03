#!/usr/bin/env bash
#
# QMS test stand on the configured Kubernetes cluster. Same prepare path as the
# sanity/ws/api stands (deployment/kubernetes/scripts/prepare-test-stand.sh):
# wipes only the qms stand data (database, buckets, elastic index, Kafka topics),
# redeploys deployment/kubernetes/stands/qms and seeds accounts + workspaces
# (init-ws-qms, the sanity-ws-qms dump, the change-field post hook) through an
# in-cluster stand-tool pod. Target cluster - from pnpm -w stand:configure
# (STAND_RUNTIME/KUBECONFIG/KUBE_CONTEXT/STAND_NAMESPACE), no implicit fusion-dev.
#
#   ./prepare-qms.sh [k3d|kind|existing]
#
# prepare-test-stand.sh is shared with the other suites and still whitelists
# sanity|ws|api, so this script runs a runtime-patched copy of it for qms: the
# whitelist accepts qms and the tool pod receives qms-tests/sanity-ws-qms (the
# workspace dump the seed restores from). The anchors are verified after the
# patch - a drift in the shared script fails loudly here instead of silently
# running an unpatched copy. Once prepare-test-stand.sh knows qms itself, this
# wrapper reduces to: exec bash "$K8S_SCRIPTS/prepare-test-stand.sh" qms "$@".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_SCRIPTS="$(cd "$SCRIPT_DIR/../deployment/kubernetes/scripts" && pwd)"

PATCHED="$(mktemp -t prepare-test-stand-qms.XXXXXX.sh)"
trap 'rm -f "$PATCHED"' EXIT

awk '
  # the pod works from /workspace of the tool image; give it the QMS dump next
  # to the sanity/meetings dumps
  /^if \[ "\$STAND_NAME" = sanity \]; then$/ {
    print "if [ \"$STAND_NAME\" = qms ]; then"
    print "  kc cp \"$REPO_ROOT/qms-tests/sanity-ws-qms\" \"$STAND_NS/stand-tool:/workspace/qms-tests/sanity-ws-qms\""
    print "fi"
    print ""
  }
  {
    # accept qms everywhere the stand whitelist is spelled out
    gsub(/\|ws\|api/, "|ws|api|qms")
    # the copy lives outside the scripts dir; keep its internal paths intact
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

# Stale Playwright storage state sends the suite back to the login screen; the
# fresh stand re-authenticates in the setup project (the patched copy removes
# tests/sanity/.auth and ws-tests/sanity/.auth, not this suite's one).
rm -rf "$SCRIPT_DIR/sanity/.auth"

exec bash "$PATCHED" qms "$@"
