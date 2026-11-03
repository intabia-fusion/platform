#!/usr/bin/env bash
# Shared helpers for the stand scripts. Sourced, not executed directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

# shellcheck source=../cluster/versions.env
source "$K8S_DIR/cluster/versions.env"

# ------------------------------------------------------ saved configuration --
# Optional config written by configure.sh (pnpm -w stand:configure). Loaded
# before the runtime defaults below so plain `stand:deploy` uses the configured
# target; explicit env/CLI values always win over the saved file.
STAND_CONFIG_DIR="${STAND_CONFIG_DIR:-$K8S_DIR/.stand}"
STAND_CONFIG_FILE="$STAND_CONFIG_DIR/config"
if [ -f "$STAND_CONFIG_FILE" ]; then
  _stand_keep=()
  _stand_ns_explicit=0
  for _stand_var in STAND_RUNTIME KUBECONFIG KUBE_CONTEXT STAND_NAMESPACE STAND_PUSH_IMAGES; do
    if [ -n "${!_stand_var+x}" ]; then
      _stand_keep+=("${_stand_var}=${!_stand_var}")
      [ "$_stand_var" = KUBECONFIG ] && _stand_kubeconfig_explicit=1
      [ "$_stand_var" = STAND_NAMESPACE ] && _stand_ns_explicit=1
    fi
  done
  # shellcheck source=/dev/null
  source "$STAND_CONFIG_FILE"
  for _stand_kv in "${_stand_keep[@]}"; do
    export "${_stand_kv%%=*}=${_stand_kv#*=}"
  done
  unset _stand_keep _stand_var _stand_kv
fi
# Distinguish an intentional STAND_NAMESPACE (set in the environment, kept
# across the config load above) from one merely saved in .stand/config: the
# saved one targets deploys, and must not silently redirect a destructive down.
# Resolved only on the first source of lib.sh in a process tree: once exported,
# the marker survives repeated sourcing and subprocesses, where STAND_NAMESPACE
# is already set from the earlier load and would otherwise look explicit.
if [ -z "${STAND_NAMESPACE_FROM_CONFIG+x}" ]; then
  STAND_NAMESPACE_FROM_CONFIG=0
  if [ "${_stand_ns_explicit:-0}" != 1 ] && grep -q '^STAND_NAMESPACE=' "$STAND_CONFIG_FILE" 2>/dev/null; then
    STAND_NAMESPACE_FROM_CONFIG=1
  fi
fi
unset _stand_ns_explicit
export STAND_NAMESPACE_FROM_CONFIG
export STAND_CONFIG_DIR STAND_CONFIG_FILE
if [ -n "${KUBECONFIG:-}" ]; then
  export KUBECONFIG
fi

# ---------------------------------------------------------------- runtime ----
# Runtime: k3d (default) | kind | existing.
#   k3d      - k3d cluster "fusion" created by base-up.sh
#   kind     - kind cluster "fusion-kind" created by base-up.sh
#   existing - a kubeconfig/context (from stand:configure, else the current
#              kubectl context); base-up installs only platform-base into it,
#              images are expected to be pullable as-is
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
    : "${KUBE_CONTEXT:=$(kubectl config current-context 2>/dev/null || true)}"
    REGISTRY_PULL="${STAND_REGISTRY:-}"        # optional, set when pushing images
    REGISTRY_PUSH="${STAND_REGISTRY:-}"
    TRAEFIK_NS="${STAND_TRAEFIK_NS:-kube-system}"
    ;;
  *)
    echo "unknown STAND_RUNTIME '$STAND_RUNTIME' (expected k3d|kind|existing)" >&2
    exit 2
    ;;
esac
# A kubeconfig saved by configure.sh only applies to the existing runtime;
# local clusters use the ambient kubectl config unless KUBECONFIG was set
# explicitly in the environment.
if [ "$STAND_RUNTIME" != existing ] && [ "${_stand_kubeconfig_explicit:-0}" != 1 ]; then
  unset KUBECONFIG
fi
unset _stand_kubeconfig_explicit
export KUBE_CONTEXT REGISTRY_PULL REGISTRY_PUSH TRAEFIK_NS

# Stand registry used as global.imageRegistry by stands/*/values.yaml (via env).
: "${STAND_IMAGE_REGISTRY:=$REGISTRY_PULL}"
export STAND_IMAGE_REGISTRY
# Image namespace inside the registry: <registry>/<imageNamespace>/<svc>:<version>.
# CI maps it from DOCKER_NAMESPACE; local builds and the chart default keep
# "intabiafusion".
: "${STAND_IMAGE_NAMESPACE:=intabiafusion}"
export STAND_IMAGE_NAMESPACE

log()  { printf '\033[1m>> %s\033[0m\n' "$*"; }
warn() { printf '\033[33m!! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$STAND_RUNTIME" = existing ] && [ -z "${KUBE_CONTEXT:-}" ]; then
  die "STAND_RUNTIME=existing has no context - run: pnpm -w stand:configure (or set KUBE_CONTEXT)"
fi

have() { command -v "$1" >/dev/null 2>&1; }

require_tools() {
  local missing=() tools=(kubectl helm)
  case "$STAND_RUNTIME" in
    k3d|kind) tools+=(docker) ;;
  esac
  for t in "${tools[@]}"; do
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
#
# Polls one `kubectl get deployments` listing per iteration instead of
# `kubectl wait --for=condition=Available deployment --all`: kubectl wait lists
# once and then relies on watch events, so a condition flip between the list and
# the watch establishment (wider under API-server load) is missed and the wait
# hangs until the timeout even though everything is long Available.
wait_deployments() {
  local ns="$1" timeout="${2:-600}"
  local deadline=$((SECONDS + timeout)) out
  while true; do
    # spec/observed/updated/available replicas as plain integers; empty fields
    # (status not yet populated) become empty columns, handled as not-ready.
    out="$(kc -n "$ns" get deployments -o jsonpath='{range .items[*]}{.metadata.name} {.metadata.generation} {.status.observedGeneration} {.spec.replicas} {.status.updatedReplicas} {.status.availableReplicas}{"\n"}{end}' 2>/dev/null)"
    if [ -n "$out" ] && ! echo "$out" | awk '
      {
        gen=$2; obs=($3=="" ? 0 : $3); rep=($4=="" ? 1 : $4); upd=($5=="" ? 0 : $5); avail=($6=="" ? 0 : $6)
        if (obs < gen || (rep > 0 && (upd != rep || avail != rep))) bad=1
      }
      END { exit (NR > 0 && !bad) ? 0 : 1 }
    '; then
      [ $SECONDS -lt $deadline ] || break
      sleep 2
      continue
    fi
    [ -n "$out" ] && return 0
    [ $SECONDS -ge $deadline ] && break
    sleep 2
  done
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
  if [ "${STAND_LIVEKIT:-local}" = embedded ]; then
    [ -f "$K8S_DIR/stands/$stand/values.livekit.yaml" ] || \
      die "STAND_LIVEKIT=embedded is supported only for the dev stand"
    files+=("$K8S_DIR/stands/$stand/values.livekit.yaml")
  elif [ -f "$K8S_DIR/stands/$stand/values.local-livekit.yaml" ]; then
    files+=("$K8S_DIR/stands/$stand/values.local-livekit.yaml")
  fi
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || die "values file not found: $f"
    printf '%s\n' "$f"
  done
}

# Single source of the deploy target for a stand. STAND_NAMESPACE applies only
# when it is intentional: set explicitly in the environment (any stand), or
# saved in .stand/config - the saved value is the dev namespace, so it applies
# to the dev stand only and never redirects a test stand (sanity/ws/api/qms)
# away from its chart default. Everything else resolves the namespace from
# values; host and stand data name come from values too. deploy, down and
# tests/prepare all resolve through this helper, so a saved fusion-dev can
# never make a test prepare wipe or install into the dev namespace.
stand_namespace() {
  local stand="$1"
  if [ -n "${STAND_NAMESPACE:-}" ]; then
    if [ "${STAND_NAMESPACE_FROM_CONFIG:-0}" != 1 ] || [ "$stand" = dev ]; then
      printf '%s\n' "$STAND_NAMESPACE"
      return 0
    fi
  fi
  local files=()
  mapfile -t files < <(stand_values_files "$stand")
  grep -h '^  namespace:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"'
}

# Refuse a destructive stand down that would hit a namespace this stand does
# not own: platform-base is never a stand. Any other namespace mismatch can
# only come from an explicit STAND_NAMESPACE in the environment - a value that
# merely came from the saved .stand/config never leaves stand_namespace() for
# a stand that is not dev, so there is nothing left to prompt about.
#   $1 - stand name, $2 - resolved namespace, $3 - 1 when the caller already
#        asked for confirmation (down.sh --yes)
guard_down_namespace() {
  local stand="$1" ns="$2"
  [ "$ns" != "$BASE_NAMESPACE" ] || \
    die "refusing to remove '$ns': that is the platform-base namespace, not a stand (use base-down.sh to remove base)"
  local files=() default_ns=""
  mapfile -t files < <(stand_values_files "$stand")
  default_ns="$(grep -h '^  namespace:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
  [ -n "$default_ns" ] && [ "$ns" = "$default_ns" ] && return 0
  warn "STAND_NAMESPACE=$ns overrides the chart default ($default_ns) for stand '$stand'; deleting namespace $ns"
}

# Refuse to install a stand into a namespace this stand does not own: the
# platform-base namespace is never a stand target. Any other mismatch can only
# come from an explicit STAND_NAMESPACE in the environment - a saved-config
# value never leaves stand_namespace() for a stand that is not dev - and is
# honored with a warning.
guard_deploy_namespace() {
  local stand="$1" ns="$2"
  [ "$ns" != "$BASE_NAMESPACE" ] || \
    die "refusing to install stand '$stand' into '$ns': that is the platform-base namespace"
  local files=() default_ns=""
  mapfile -t files < <(stand_values_files "$stand")
  default_ns="$(grep -h '^  namespace:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
  [ -n "$default_ns" ] && [ "$ns" = "$default_ns" ] && return 0
  warn "STAND_NAMESPACE=$ns overrides the chart default ($default_ns) for stand '$stand'; installing into namespace $ns"
}

stand_host() {
  local stand="$1"
  local files=()
  mapfile -t files < <(stand_values_files "$stand")
  grep -h '^  hostUrl:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"'
}

stand_data() {
  local stand="$1"
  local files=()
  mapfile -t files < <(stand_values_files "$stand")
  grep -h '^  stand:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"'
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
