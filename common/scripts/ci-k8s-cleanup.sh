#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Predictable CI cleanup for the Kubernetes test stands. Touches only what the
# stand scripts own - never other jobs' containers:
#   - the stand namespace/release (via the repo's own test-down.sh)
#   - the local LiveKit compose project (sanity-livekit, started by prepare)
#   - on `cluster`: the local k3d/kind cluster and its registry container,
#     named `fusion` / `k3d-fusion-registry` by deployment/kubernetes/cluster/*
#
#   STAND_CLEANUP=none|stand|cluster common/scripts/ci-k8s-cleanup.sh [stand]
#
#   none    - do nothing (default; right for one-shot CI VMs)
#   stand   - remove the stand namespace + local LiveKit
#   cluster - additionally delete the local k3d/kind cluster + registry;
#             STAND_RUNTIME=existing degrades to `stand` - a remote cluster is
#             never torn down, only the stand namespace is removed.
# Best-effort by design (run from traps): individual failures do not abort it.
set -uo pipefail

mode="${STAND_CLEANUP:-none}"
[ "$mode" = "none" ] && exit 0
stand="${1:-sanity}"
case "$mode" in
  stand|cluster) ;;
  *) echo "ci-k8s-cleanup: unknown STAND_CLEANUP '$mode' (none|stand|cluster)" >&2; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/../../deployment/kubernetes" && pwd)"
runtime="${STAND_RUNTIME:-k3d}"

# The local LiveKit prepare starts (compose project sanity-livekit) - ours.
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose -f "$K8S_DIR/../../tests/docker-compose.livekit.yaml" -p sanity-livekit \
    down --remove-orphans >/dev/null 2>&1 || true
fi

# Stand namespace/release through the repo's own script - on a remote runtime
# this is the only part that runs, and it deletes just the stand namespace.
# down.sh (not test-down.sh) takes any stand name: qms is not in test-down's
# sanity|ws|api whitelist yet.
"$K8S_DIR/scripts/down.sh" "$stand" "$runtime" --yes >/dev/null 2>&1 || true

if [ "$mode" = "cluster" ] && [ "$runtime" != "existing" ]; then
  case "$runtime" in
    k3d)
      k3d cluster delete fusion >/dev/null 2>&1 || true
      k3d registry delete k3d-fusion-registry >/dev/null 2>&1 || true
      ;;
    kind)
      kind delete cluster --name fusion-kind >/dev/null 2>&1 || true
      docker rm -f kind-registry >/dev/null 2>&1 || true
      ;;
  esac
fi
