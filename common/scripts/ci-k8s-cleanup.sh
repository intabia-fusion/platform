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
# CI cleanup for the k8s test stands: STAND_CLEANUP=none|stand|cluster ci-k8s-cleanup.sh [stand]
# Best-effort (run from traps). `cluster` degrades to `stand` when STAND_RUNTIME=existing.
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

# The local LiveKit started by prepare (compose project sanity-livekit).
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  docker compose -f "$K8S_DIR/../../tests/docker-compose.livekit.yaml" -p sanity-livekit \
    down --remove-orphans >/dev/null 2>&1 || true
fi

# down.sh, not test-down.sh: the latter only accepts sanity|ws|api.
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
