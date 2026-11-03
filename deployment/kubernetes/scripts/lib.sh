#!/usr/bin/env bash
# Shared helpers for the stand scripts. Sourced, not executed directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

# shellcheck source=../cluster/versions.env
source "$K8S_DIR/cluster/versions.env"

# ---------------------------------------------------------------- runtime ----
# Runtime: k3d (default) | kind | existing.
#   k3d      - k3d cluster "fusion" created by base-up.sh
#   kind     - kind cluster "fusion-kind" created by base-up.sh
#   existing - the current kubectl context; base-up installs only platform-base
#              into it, images are expected to be pullable as-is
: "${STAND_RUNTIME:=k3d}"
export STAND_RUNTIME

K3D_CLUSTER="fusion"
KIND_CLUSTER="fusion-kind"
BASE_NAMESPACE="platform-base"

case "$STAND_RUNTIME" in
  k3d)
    KUBE_CONTEXT="k3d-$K3D_CLUSTER"
    REGISTRY_PULL="k3d-fusion-registry:5000"   # from inside the cluster
    REGISTRY_PUSH="localhost:5111"             # from the host
    TRAEFIK_NS="kube-system"
    ;;
  kind)
    KUBE_CONTEXT="kind-$KIND_CLUSTER"
    REGISTRY_PULL="localhost:5001"             # containerd rewrites to kind-registry:5000
    REGISTRY_PUSH="localhost:5001"
    TRAEFIK_NS="traefik"
    ;;
  existing)
    KUBE_CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
    REGISTRY_PULL="${STAND_REGISTRY:-}"        # optional, set when pushing images
    REGISTRY_PUSH="${STAND_REGISTRY:-}"
    TRAEFIK_NS="${STAND_TRAEFIK_NS:-kube-system}"
    ;;
  *)
    echo "unknown STAND_RUNTIME '$STAND_RUNTIME' (expected k3d|kind|existing)" >&2
    exit 2
    ;;
esac
export KUBE_CONTEXT REGISTRY_PULL REGISTRY_PUSH TRAEFIK_NS

# Stand registry used as global.imageRegistry by stands/*/values.yaml (via env).
: "${STAND_IMAGE_REGISTRY:=$REGISTRY_PULL}"
export STAND_IMAGE_REGISTRY

log()  { printf '\033[1m>> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

require_tools() {
  local missing=()
  for t in kubectl helm docker; do
    have "$t" || missing+=("$t")
  done
  case "$STAND_RUNTIME" in
    k3d) have k3d || missing+=("k3d") ;;
    kind)
      have kind || missing+=("kind")
      if [ "${KIND_EXPERIMENTAL_PROVIDER:-}" = podman ]; then
        have podman || missing+=("podman")
      fi
      ;;
  esac
  [ ${#missing[@]} -eq 0 ] || die "missing tools: ${missing[*]}"
  local helm_major
  helm_major="$(helm version --short 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/')"
  [ "$helm_major" = "$HELM_MAJOR" ] || \
    warn "helm major is v$helm_major, versions.env pins $HELM_MAJOR (rendering is checked with $HELM_MAJOR)"
}

# Run kubectl/helm against the runtime's context. kubeconfig stays whatever the
# user has; we only pin the context so an existing default context is never touched.
kc()  { kubectl --context "$KUBE_CONTEXT" "$@"; }
helmc() { helm --kube-context "$KUBE_CONTEXT" "$@"; }

published_https_port() {
  if [ -n "${STAND_HTTPS_PORT:-}" ]; then
    printf '%s\n' "$STAND_HTTPS_PORT"
    return
  fi
  local port=""
  case "$STAND_RUNTIME" in
    k3d)
      port="$(docker port "k3d-$K3D_CLUSTER-serverlb" 443/tcp 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/' || true)"
      ;;
    kind)
      port="$(docker port "$KIND_CLUSTER-control-plane" 30443/tcp 2>/dev/null | head -1 | sed -E 's/.*:([0-9]+)$/\1/' || true)"
      ;;
  esac
  printf '%s\n' "${port:-443}"
}

ensure_traefik_https_port() {
  local port="$1" current
  [ "$port" = 443 ] && return 0
  case "$STAND_RUNTIME" in k3d|kind) ;; *) return 0 ;; esac
  current="$(kc -n "$TRAEFIK_NS" get service traefik -o jsonpath="{.spec.ports[?(@.port==$port)].port}" 2>/dev/null || true)"
  [ "$current" = "$port" ] && return 0
  log "exposing internal traefik port $port for public stand URLs"
  kc -n "$TRAEFIK_NS" patch service traefik --type=json \
    -p="[{\"op\":\"add\",\"path\":\"/spec/ports/-\",\"value\":{\"name\":\"https-$port\",\"protocol\":\"TCP\",\"port\":$port,\"targetPort\":\"websecure\"}}]" >/dev/null
}

context_reachable() {
  kc get nodes >/dev/null 2>&1
}

# --------------------------------------------------------------- cluster ----

cluster_exists() {
  case "$STAND_RUNTIME" in
    k3d) k3d cluster list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$K3D_CLUSTER" ;;
    kind) kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER" ;;
    existing) context_reachable ;;
  esac
}

ensure_cluster() {
  cluster_exists && return 0
  case "$STAND_RUNTIME" in
    k3d)  die "k3d cluster '$K3D_CLUSTER' not found - run: pnpm -w stand:base:up (STAND_RUNTIME=$STAND_RUNTIME)" ;;
    kind) die "kind cluster '$KIND_CLUSTER' not found - run: pnpm -w stand:base:up (STAND_RUNTIME=$STAND_RUNTIME)" ;;
    existing) die "kubectl context '$KUBE_CONTEXT' is not reachable" ;;
  esac
}

# ------------------------------------------------------------- platform-base --

# The contract ConfigMap is what platform chart resolves via lookup; its presence
# is the signal that base is installed and ready to serve stands.
base_contract_ready() {
  kc get configmap platform-base -n "$BASE_NAMESPACE" >/dev/null 2>&1
}

ensure_base() {
  ensure_cluster
  base_contract_ready || \
    die "platform-base is not installed in context '$KUBE_CONTEXT' - run: pnpm -w stand:base:up (STAND_RUNTIME=$STAND_RUNTIME)"
}

# ------------------------------------------------------------- diagnostics ----

# wait_deployments <namespace> [timeout]
# Waits for all deployments to become available; on timeout prints pod states,
# recent events and container logs of failing pods.
wait_deployments() {
  local ns="$1" timeout="${2:-600}"
  if kc -n "$ns" wait --for=condition=Available deployment --all --timeout="${timeout}s" >/dev/null 2>&1; then
    return 0
  fi
  warn "deployments in $ns not ready within ${timeout}s"
  kc -n "$ns" get pods -o wide || true
  echo "--- recent events ---"
  kc -n "$ns" get events --sort-by=.lastTimestamp 2>/dev/null | tail -30 || true
  echo "--- failing pod logs ---"
  local pod
  for pod in $(kc -n "$ns" get pods -o jsonpath='{.items[?(@.status.phase=="Running")].metadata.name}' 2>/dev/null); do
    local state
    state="$(kc -n "$ns" get pod "$pod" -o jsonpath='{.status.containerStatuses[?(@.ready==false)].state}' 2>/dev/null)"
    if echo "$state" | grep -q "waiting\|terminated"; then
      echo "### $pod"
      kc -n "$ns" logs "$pod" --tail=30 2>/dev/null | tail -10 || true
    fi
  done
  return 1
}

wait_statefulset() {
  local ns="$1" name="$2" timeout="${3:-300}"
  kc -n "$ns" rollout status "statefulset/$name" --timeout="${timeout}s" >/dev/null
}

wait_job() {
  local ns="$1" name="$2" timeout="${3:-300}"
  kc -n "$ns" wait --for=condition=Complete "job/$name" --timeout="${timeout}s" >/dev/null 2>&1 || {
    warn "job $name in $ns did not complete"
    kc -n "$ns" logs "job/$name" --tail=50 2>/dev/null || true
    kc -n "$ns" describe "job/$name" 2>/dev/null | tail -20 || true
    return 1
  }
}

# --------------------------------------------------------------- rendering ----

# render_stand_values <stand>: prints -f flags for helm. Common file first,
# then runtime overlay when present.
stand_values_files() {
  local stand="$1"
  local files=("$K8S_DIR/stands/$stand/values.yaml")
  case "$STAND_RUNTIME" in
    kind) files+=("$K8S_DIR/stands/$stand/values.kind.yaml") ;;
    existing) [ -f "$K8S_DIR/stands/$stand/values.existing.yaml" ] && \
      files+=("$K8S_DIR/stands/$stand/values.existing.yaml") ;;
  esac
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || die "values file not found: $f"
    printf '%s\n' "$f"
  done
}

# Host port check for the load balancer ports.
ports_free() {
  local p
  for p in "$@"; do
    if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      return 1
    fi
  done
  return 0
}

usage_runtime() {
  echo "runtime: STAND_RUNTIME=k3d|kind|existing (default k3d), or first argument" >&2
}
