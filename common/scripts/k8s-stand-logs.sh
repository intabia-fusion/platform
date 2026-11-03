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
# Collect Kubernetes diagnostics for a stand into a directory, for CI
# artifacts: pod list, events and per-pod logs (current + previous container).
# This replaces the compose-era `docker logs` collection - nothing here reads
# docker directly: host containers are not the stand, and container-level
# telemetry must not be reported as pod telemetry.
#
#   common/scripts/k8s-stand-logs.sh <stand> <out-dir>   (stand: sanity|ws|api|qms)
#
# Best-effort: a missing cluster or kubectl never fails the caller.
set -uo pipefail

stand="${1:?usage: k8s-stand-logs.sh <stand> <out-dir>}"
out="${2:?usage: k8s-stand-logs.sh <stand> <out-dir>}"

K8S_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../deployment/kubernetes" && pwd)"

if ! command -v kubectl >/dev/null 2>&1; then
  mkdir -p "$out"
  echo "kubectl not on PATH - no Kubernetes logs collected" > "$out/k8s-logs-unavailable.txt"
  exit 0
fi

# Namespace via the canonical helper (explicit STAND_NAMESPACE wins, else the
# stand's values), same as .github/actions/ui-test/action.yml. In a subshell:
# lib.sh resolves the runtime config without touching this script's env.
ns="$(
  # shellcheck source=../../deployment/kubernetes/scripts/lib.sh
  source "$K8S_DIR/scripts/lib.sh" 2>/dev/null
  stand_namespace "$stand"
)"
ns="${ns:-fusion-$stand}"

ctx=""
case "${STAND_RUNTIME:-k3d}" in
  k3d)      ctx="k3d-fusion" ;;
  kind)     ctx="kind-fusion-kind" ;;
  existing) ctx="${KUBE_CONTEXT:-$(kubectl config current-context 2>/dev/null || true)}" ;;
esac
if [ -z "$ctx" ]; then
  mkdir -p "$out"
  echo "no kubectl context - no Kubernetes logs collected" > "$out/k8s-logs-unavailable.txt"
  exit 0
fi

dir="$out/k8s-$ns"
mkdir -p "$dir"

kubectl --context "$ctx" get pods -n "$ns" -o wide > "$dir/pods.txt" 2>&1 || true
kubectl --context "$ctx" get events -n "$ns" --sort-by=.lastTimestamp > "$dir/events.txt" 2>&1 || true

pods="$(kubectl --context "$ctx" get pods -n "$ns" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
for pod in $pods; do
  kubectl --context "$ctx" logs -n "$ns" "$pod" --tail=200 > "$dir/${pod}.log" 2>&1 || true
  kubectl --context "$ctx" logs -n "$ns" "$pod" --tail=200 -p > "$dir/${pod}-previous.log" 2>&1 || true
done

echo "Kubernetes logs for namespace $ns collected into $dir"
