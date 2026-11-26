#!/usr/bin/env bash
# Shared helpers for the stand scripts. Sourced, not executed directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

# shellcheck source=../cluster/versions.env
source "$K8S_DIR/cluster/versions.env"

# ------------------------------------------------------ saved configuration --
# Optional config written by configure.sh (pnpm -w stand:configure), loaded before the runtime
# defaults so plain `stand:deploy` uses the configured target; explicit env/CLI always wins.
STAND_CONFIG_DIR="${STAND_CONFIG_DIR:-$K8S_DIR/.stand}"
STAND_CONFIG_FILE="$STAND_CONFIG_DIR/config"
_stand_kubeconfig_explicit=0
if [ -n "${KUBECONFIG+x}" ]; then
  _stand_kubeconfig_explicit=1
fi
if [ -f "$STAND_CONFIG_FILE" ]; then
  _stand_keep=()
  _stand_ns_explicit=0
  for _stand_var in STAND_RUNTIME KUBECONFIG KUBE_CONTEXT STAND_NAMESPACE STAND_PUSH_IMAGES; do
    if [ -n "${!_stand_var+x}" ]; then
      _stand_keep+=("${_stand_var}=${!_stand_var}")
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
# Per-developer settings: deployment/kubernetes/.env (see .env.example). Explicit env wins.
if [ -f "$K8S_DIR/.env" ]; then
  _stand_env_keep=()
  for _stand_env_var in STAND_MODE STAND_MEMORY_BUDGET; do
    [ -n "${!_stand_env_var+x}" ] && _stand_env_keep+=("${_stand_env_var}=${!_stand_env_var}")
  done
  set -a
  # shellcheck source=/dev/null
  source "$K8S_DIR/.env"
  set +a
  for _stand_env_kv in "${_stand_env_keep[@]}"; do
    export "${_stand_env_kv%%=*}=${_stand_env_kv#*=}"
  done
  unset _stand_env_keep _stand_env_var _stand_env_kv
fi

# Only an env STAND_NAMESPACE may redirect a destructive down; the saved one targets deploys
# only. Resolved once per process tree - after the config load it would look explicit.
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
# Runtime: k3d (default) | kind | existing (kubeconfig/context from stand:configure or the
# current kubectl context - base-up installs only platform-base, images must be pullable).
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
# A kubeconfig saved by configure.sh applies to the existing runtime only; local clusters
# use the ambient kubectl config unless KUBECONFIG came from the environment.
if [ "$STAND_RUNTIME" != existing ] && [ "${_stand_kubeconfig_explicit:-0}" != 1 ]; then
  unset KUBECONFIG
fi
unset _stand_kubeconfig_explicit
export KUBE_CONTEXT REGISTRY_PULL REGISTRY_PUSH TRAEFIK_NS

# Stand registry used as global.imageRegistry by stands/*/values.yaml (via env).
: "${STAND_IMAGE_REGISTRY:=$REGISTRY_PULL}"
export STAND_IMAGE_REGISTRY
# Image namespace inside the registry: CI maps it from DOCKER_NAMESPACE, local builds
# and the chart default keep "intabiafusion".
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

# Run kubectl/helm against the runtime's context; only the context is pinned, the user's
# kubeconfig default is never touched.
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
  if [ -z "$current" ] && ! kc -n "$TRAEFIK_NS" get service traefik >/dev/null 2>&1; then
    # k3d installs its traefik chart right after the cluster is created, asynchronously: patch
    # only once the Service exists, otherwise a cold start dies with "services traefik not found".
    local i
    for i in $(seq 1 60); do
      kc -n "$TRAEFIK_NS" get service traefik >/dev/null 2>&1 && break
      sleep 2
    done
    kc -n "$TRAEFIK_NS" get service traefik >/dev/null 2>&1 || die "traefik service did not appear in namespace $TRAEFIK_NS"
    current="$(kc -n "$TRAEFIK_NS" get service traefik -o jsonpath="{.spec.ports[?(@.port==$port)].port}" 2>/dev/null || true)"
  fi
  [ "$current" = "$port" ] && return 0
  log "exposing internal traefik port $port for public stand URLs"
  kc -n "$TRAEFIK_NS" patch service traefik --type=json \
    -p="[{\"op\":\"add\",\"path\":\"/spec/ports/-\",\"value\":{\"name\":\"https-$port\",\"protocol\":\"TCP\",\"port\":$port,\"targetPort\":\"websecure\"}}]" >/dev/null
}

context_reachable() {
  kc get nodes >/dev/null 2>&1
}

# LiveKit media ports (api/rtc-tcp/rtc-udp) have to reach the host: the shared server in
# platform-base binds the node network, and the browser on the host needs the published ports. A
# cluster created before this existed gets the mappings retrofitted - k3d has no other way to add them.
# kind cannot gain port mappings after creation, so there the host livekit-server stays.
ensure_livekit_ports() {
  [ "$STAND_RUNTIME" = k3d ] || return 0
  cluster_exists || return 0
  local spec port published
  published="$(docker port "k3d-$K3D_CLUSTER-serverlb" 2>/dev/null || true)"
  for spec in 7880/tcp 7881/tcp 7882/udp; do
    case "$published" in *"$spec ->"*) continue ;; esac
    port="${spec%%/*}"
    log "publishing LiveKit port $port (existing k3d cluster)"
    if ! k3d cluster edit "$K3D_CLUSTER" --port-add "${port}:${port}/${spec##*/}@server:0" >/dev/null; then
      warn "could not publish $port: LiveKit RTC is unreachable from the host"
    fi
  done
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

# The contract ConfigMap is what the platform chart resolves via lookup: its presence
# means base is installed and ready to serve stands.
base_contract_ready() {
  kc get configmap platform-base -n "$BASE_NAMESPACE" >/dev/null 2>&1
}

ensure_base() {
  ensure_cluster
  base_contract_ready || \
    die "platform-base is not installed in context '$KUBE_CONTEXT' - run: pnpm -w stand:base:up (STAND_RUNTIME=$STAND_RUNTIME)"
}

# Effective postgres.mode of the installed base (internal|external), read from the
# release values so base-up waits for a Cluster only when one is rendered.
base_postgres_mode() {
  helmc -n "$BASE_NAMESPACE" get values platform-base -a -o yaml 2>/dev/null | \
    awk '/^postgres:/{p=1;next} p&&/^[a-z]/{p=0} p&&$1=="mode:"{print $2;exit}'
}

# Effective kafka.mode of the installed base (strimzi|redpanda|external), read the same way:
# tooling must target the broker this base actually runs.
base_kafka_mode() {
  helmc -n "$BASE_NAMESPACE" get values platform-base -a -o yaml 2>/dev/null | \
    awk '/^kafka:/{p=1;next} p&&/^[a-z]/{p=0} p&&$1=="mode:"{print $2;exit}'
}

# mode a component declares in the stand values overlay base-up renders; empty when the overlay
# leaves it to the chart default.
base_values_mode() {
  local key="$1"
  [ -f "$K8S_DIR/stands/base/values.yaml" ] || return 0
  awk -v key="$key:" '$0==key{p=1;next} p&&/^[a-z]/{p=0} p&&$1=="mode:"{print $2;exit}' \
    "$K8S_DIR/stands/base/values.yaml"
}

# Kafka Service of the installed base behind the kafka:9092 contract. Empty for external: the
# broker lives outside the cluster and there is nothing to forward.
base_kafka_service() {
  case "$(base_kafka_mode)" in
    redpanda) printf 'redpanda\n' ;;
    external) ;;
    *) printf 'my-cluster-kafka-bootstrap\n' ;;
  esac
}

# In-cluster bootstrap host:port of the installed base; for external it comes from
# kafka.external.bootstrap in the release values.
base_kafka_bootstrap() {
  local mode external
  mode="$(base_kafka_mode)"
  case "$mode" in
    external)
      external="$(helmc -n "$BASE_NAMESPACE" get values platform-base -a -o yaml 2>/dev/null | \
        awk '/^kafka:/{p=1;next} p&&/^[a-z]/{p=0} p&&$1=="bootstrap:"{print $2;exit}')"
      [ -n "$external" ] || \
        die "kafka.mode=external without kafka.external.bootstrap in $BASE_NAMESPACE/platform-base"
      printf '%s\n' "$external"
      ;;
    redpanda) printf 'redpanda.%s.svc.cluster.local:9092\n' "$BASE_NAMESPACE" ;;
    *) printf 'my-cluster-kafka-bootstrap.%s.svc.cluster.local:9092\n' "$BASE_NAMESPACE" ;;
  esac
}

# Pod name of the CNPG primary: writes and database resets go here, never to a replica.
postgres_primary_pod() {
  local pod
  pod="$(kc -n "$BASE_NAMESPACE" get pod \
    -l cnpg.io/cluster=postgres,cnpg.io/instanceRole=primary \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  [ -n "$pod" ] || die "no CloudNativePG primary for cluster postgres in $BASE_NAMESPACE"
  printf '%s\n' "$pod"
}

# ------------------------------------------------------------- diagnostics ----

# wait_deployments <namespace> [timeout] - all deployments available, else pod states, events
# and failing pod logs. Polls `get deployments` per iteration: `kubectl wait --all` misses the flip.
wait_deployments() {
  local ns="$1" timeout="${2:-600}"
  local deadline=$((SECONDS + timeout)) out
  while true; do
    # spec/observed/updated/available replicas as integers; empty (status not yet populated)
    # become empty columns, handled as not-ready.
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

# render_stand_values <stand>: prints -f flags for helm, common file first, then the
# runtime overlay when present.
stand_values_files() {
  local stand="$1"
  local files=("$K8S_DIR/stands/$stand/values.yaml")
  case "$STAND_RUNTIME" in
    kind) files+=("$K8S_DIR/stands/$stand/values.kind.yaml") ;;
    existing) [ -f "$K8S_DIR/stands/$stand/values.existing.yaml" ] && \
      files+=("$K8S_DIR/stands/$stand/values.existing.yaml") ;;
  esac
  # k3d always shares the cluster LiveKit in platform-base; kind and existing clusters cannot
  # publish RTC ports after creation and keep the host server.
  if [ "$STAND_RUNTIME" != k3d ]; then
    [ -f "$K8S_DIR/stands/$stand/values.local-livekit.yaml" ] && \
      files+=("$K8S_DIR/stands/$stand/values.local-livekit.yaml")
  fi
  # Sealed secrets generated by `stand:seal` for this cluster; sets sealedSecrets.enabled.
  [ -f "$K8S_DIR/stands/$stand/sealed.yaml" ] && files+=("$K8S_DIR/stands/$stand/sealed.yaml")
  local f
  for f in "${files[@]}"; do
    [ -f "$f" ] || die "values file not found: $f"
    printf '%s\n' "$f"
  done
}

# Single source of the deploy target for a stand: STAND_NAMESPACE wins only from the environment,
# or from .stand/config (the dev namespace) - never for a test stand, which keeps its chart default.
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

# Refuse a destructive down that would hit a namespace this stand does not own: platform-base is
# never a stand. $1 stand, $2 resolved namespace, $3 = 1 when the caller already asked (--yes).
guard_down_namespace() {
  local stand="$1" ns="$2"
  [ "$ns" != "$BASE_NAMESPACE" ] || \
    die "refusing to remove '$ns': that is the platform-base namespace, not a stand (use base-down.sh to remove base)"
  local files=() default_ns=""
  mapfile -t files < <(stand_values_files "$stand")
  default_ns="$(grep -h '^  namespace:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
  [ -n "$default_ns" ] && [ "$ns" = "$default_ns" ] && return 0
  if [ "${STAND_NAMESPACE_FROM_CONFIG:-0}" != 1 ]; then
    warn "explicit STAND_NAMESPACE=$ns overrides chart namespace $default_ns"
    return 0
  fi
  die "refusing to remove stand '$stand' in context '$KUBE_CONTEXT': namespace '$ns' differs from expected '$default_ns'"
}

# Refuse to install a stand into a namespace it does not own: platform-base is never a stand
# target; any other mismatch comes from an env STAND_NAMESPACE and is honored with a warning.
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

# shellcheck source=stand-lock.sh
source "$SCRIPT_DIR/stand-lock.sh"
