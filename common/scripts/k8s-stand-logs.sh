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
# Collect Kubernetes diagnostics for a stand into a directory for CI artifacts: stand pods,
# events and logs, the shared platform-base namespace (pods, CNPG clusters) and cluster nodes.
# Best-effort - a missing cluster or namespace never fails the caller.
set -uo pipefail

# Lines kept per pod and container. A 200-line tail cut off the start of the last incident.
LOG_TAIL=1000

stand="${1:?usage: k8s-stand-logs.sh <stand> <out-dir>}"
out="${2:?usage: k8s-stand-logs.sh <stand> <out-dir>}"

K8S_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../deployment/kubernetes" && pwd)"

if ! command -v kubectl >/dev/null 2>&1; then
  mkdir -p "$out"
  echo "kubectl not on PATH - no Kubernetes logs collected" > "$out/k8s-logs-unavailable.txt"
  exit 0
fi

# Namespace via the canonical helper (explicit STAND_NAMESPACE wins, else the
# stand's values). Subshell: lib.sh must not leak its runtime config into our env.
ns="$(
  # shellcheck source=../../deployment/kubernetes/scripts/lib.sh
  source "$K8S_DIR/scripts/lib.sh" 2>/dev/null
  stand_namespace "$stand"
)"
ns="${ns:-fusion-$stand}"

# platform-base holds the shared postgres and pgbouncer a stand fails without. An explicit
# env BASE_NAMESPACE is read before lib.sh, which assigns the variable unconditionally.
base_env="${BASE_NAMESPACE:-}"
base_ns="$(
  # shellcheck source=../../deployment/kubernetes/scripts/lib.sh
  source "$K8S_DIR/scripts/lib.sh" 2>/dev/null
  printf '%s\n' "${BASE_NAMESPACE:-platform-base}"
)"
base_ns="${base_env:-${base_ns:-platform-base}}"

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

ns_exists() {
  kubectl --context "$ctx" get namespace "$1" -o name >/dev/null 2>&1
}

# collect_ns <namespace> <out-dir> - pods, events, logs of every pod, and a describe for pods
# that are not Running or have restarted. Uses the global context $ctx.
collect_ns() {
  local ns="$1" dir="$2" status pod phase restarts
  mkdir -p "$dir"

  kubectl --context "$ctx" get pods -n "$ns" -o wide > "$dir/pods.txt" 2>&1 || true
  kubectl --context "$ctx" get events -n "$ns" --sort-by=.lastTimestamp > "$dir/events.txt" 2>&1 || true

  status="$(kubectl --context "$ctx" get pods -n "$ns" \
    -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.phase}{" "}{.status.containerStatuses[*].restartCount}{"\n"}{end}' \
    2>/dev/null || true)"
  while read -r pod phase restarts; do
    [ -n "$pod" ] || continue
    kubectl --context "$ctx" logs -n "$ns" "$pod" --tail="$LOG_TAIL" > "$dir/$pod.log" 2>&1 || true
    kubectl --context "$ctx" logs -n "$ns" "$pod" --tail="$LOG_TAIL" --previous > "$dir/$pod-previous.log" 2>&1 || true
    if [ "$phase" != Running ] || [[ "$restarts" == *[1-9]* ]]; then
      kubectl --context "$ctx" describe pod "$pod" -n "$ns" > "$dir/$pod-describe.txt" 2>&1 || true
    fi
  done <<< "$status"
}

# collect_postgres <namespace> <out-dir> - CNPG Cluster objects: status, conditions and instance
# restart counters. A cluster without the CRD gets a note file instead of a failed script.
collect_postgres() {
  local ns="$1" dir="$2" yaml rc=0
  yaml="$(kubectl --context "$ctx" get clusters.postgresql.cnpg.io -n "$ns" -o yaml 2>&1)" || rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '%s\n' "$yaml" > "$dir/cnpg-clusters.yaml"
  else
    {
      echo "clusters.postgresql.cnpg.io is not readable in $ns (CRD absent or no access):"
      printf '%s\n' "$yaml"
    } > "$dir/cnpg-unavailable.txt"
  fi
}

# collect_cluster <out-dir> - node state and cluster-wide events. Evictions and OOM kills are
# visible only here, never in a stand namespace.
collect_cluster() {
  local dir="$1" rc=0
  mkdir -p "$dir"

  kubectl --context "$ctx" get nodes -o wide > "$dir/nodes.txt" 2>&1 || rc=$?
  if [ "$rc" -ne 0 ]; then
    {
      echo "cluster is not reachable through context $ctx - node state not collected:"
      cat "$dir/nodes.txt"
    } > "$dir/cluster-unreachable.txt"
    return 0
  fi

  kubectl --context "$ctx" get nodes -o json > "$dir/nodes.json" 2>&1 || true
  kubectl --context "$ctx" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{range .status.conditions[*]} {.type}={.status}{end}{"\n"}{end}' \
    > "$dir/node-conditions.txt" 2>&1 || true
  kubectl --context "$ctx" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" cpu="}{.status.allocatable.cpu}{" memory="}{.status.allocatable.memory}{" pods="}{.status.allocatable.pods}{"\n"}{end}' \
    > "$dir/node-allocatable.txt" 2>&1 || true
  kubectl --context "$ctx" get events -A --sort-by=.lastTimestamp 2>&1 | tail -n 300 > "$dir/events-all.txt" || true
}

dir="$out/k8s-$ns"
if ns_exists "$ns"; then
  collect_ns "$ns" "$dir"
  echo "Kubernetes logs for namespace $ns collected into $dir"
else
  mkdir -p "$dir"
  echo "namespace $ns does not exist in context $ctx - stand logs not collected" > "$dir/namespace-missing.txt"
  echo "stand namespace $ns not found - note written into $dir"
fi

base_dir="$out/k8s-$base_ns"
if [ "$base_ns" = "$ns" ]; then
  # Single-namespace stand: pods and logs above are the base ones, only postgres state is extra.
  collect_postgres "$base_ns" "$dir"
  echo "platform-base is the stand namespace - postgres state collected into $dir"
elif ns_exists "$base_ns"; then
  collect_ns "$base_ns" "$base_dir"
  collect_postgres "$base_ns" "$base_dir"
  echo "Kubernetes logs for base namespace $base_ns collected into $base_dir"
else
  mkdir -p "$base_dir"
  echo "namespace $base_ns does not exist in context $ctx - base logs not collected" > "$base_dir/namespace-missing.txt"
  echo "base namespace $base_ns not found - note written into $base_dir"
fi

collect_cluster "$out/k8s-cluster"
echo "Node state and cluster-wide events collected into $out/k8s-cluster"
