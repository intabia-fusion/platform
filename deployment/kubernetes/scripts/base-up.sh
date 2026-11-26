#!/usr/bin/env bash
# Idempotent bring-up of the shared base for local stands:
#   1. cluster (k3d/kind) with local registry and 80/443 on the load balancer
#   2. CoreDNS rewrite *.fusion.localhost -> traefik, TLS (mkcert + TLSStore default)
#   3. the operators the selected modes need (Strimzi for Kafka, CloudNativePG for Postgres,
#      both pinned) and the platform-base chart: postgres
#      (CNPG, primary + replica), Kafka, silo S3, elastic, redis, mailpit, the shared
#      LiveKit + egress and the platform-base contract
#      (LiveKit and the k3d RTC port maps are k3d-only; kind/existing keep the host server)
#
# Usage: base-up.sh [k3d|kind|existing]   (default: STAND_RUNTIME or k3d)
# Safe to re-run: existing parts are detected and skipped.
set -euo pipefail
[ $# -ge 1 ] && STAND_RUNTIME="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_tools

# Queue implementation for the base: strimzi (Kafka through the operator, production parity) or
# redpanda (one container, starts in seconds - handy to compare a run against Kafka).
KAFKA_MODE="${KAFKA_MODE:-strimzi}"
case "$KAFKA_MODE" in
  strimzi|redpanda|external) ;;
  *) die "KAFKA_MODE must be strimzi, redpanda or external (got '$KAFKA_MODE')" ;;
esac

# PostgreSQL: internal runs the CloudNativePG operator and Cluster here; external points the base
# contract at an existing server. An explicit POSTGRES_MODE overrides the stand values; with
# neither set the chart default (internal) applies, and the operator is installed only when a
# Cluster is rendered.
POSTGRES_MODE="${POSTGRES_MODE:-}"
case "$POSTGRES_MODE" in
  ''|internal|external) ;;
  *) die "POSTGRES_MODE must be internal or external (got '$POSTGRES_MODE')" ;;
esac
POSTGRES_MODE_ARGS=()
[ -z "$POSTGRES_MODE" ] || POSTGRES_MODE_ARGS=(--set "postgres.mode=$POSTGRES_MODE")
PG_MODE="${POSTGRES_MODE:-$(base_values_mode postgres)}"
PG_MODE="${PG_MODE:-internal}"
case "$PG_MODE" in
  internal|external) ;;
  *) die "postgres.mode in $K8S_DIR/stands/base/values.yaml must be internal or external (got '$PG_MODE')" ;;
esac

log "base-up: runtime=$STAND_RUNTIME context=$KUBE_CONTEXT"

# ---------------------------------------------------------------- cluster ----
case "$STAND_RUNTIME" in
  k3d)
    if ! cluster_exists; then
      HTTPS_PORT="${STAND_HTTPS_PORT:-443}"
      ports_free "$HTTPS_PORT" || \
        die "host port $HTTPS_PORT is busy. Free it, or run on an alternative port: STAND_HTTPS_PORT=8443 $0 k3d"
      # The shared LiveKit binds 7880-7882 through the cluster (cluster/k3d.yaml); a host
      # livekit-server from a dev stand would hold them and k3d would fail on a docker port clash.
      ports_free 7880 7881 || \
        die "host ports 7880/7881 are busy: stop the host livekit-server (dev/run_livekit.sh) and retry"
      CFG="$(mktemp -t k3d-fusion.XXXXXX.yaml)"
      sed -E "s/^(- port: )443:443$/\\1${HTTPS_PORT}:443/" \
        "$K8S_DIR/cluster/k3d.yaml" > "$CFG"
      log "creating k3d cluster '$K3D_CLUSTER' (host https=$HTTPS_PORT, HTTPS only)"
      k3d cluster create --config "$CFG"
      rm -f "$CFG"
    else
      log "k3d cluster '$K3D_CLUSTER' already exists"
    fi
    ;;
  kind)
    if ! cluster_exists; then
      HTTPS_PORT="${STAND_HTTPS_PORT:-443}"
      ports_free "$HTTPS_PORT" || \
        die "host port $HTTPS_PORT is busy. kind cannot share it with k3d; free it or use an alternative port: STAND_HTTPS_PORT=8443 $0 kind"
      CFG="$(mktemp -t kind-fusion.XXXXXX.yaml)"
      sed -E "s/(hostPort: )443$/\\1${HTTPS_PORT}/" \
        "$K8S_DIR/cluster/kind.yaml" > "$CFG"
      log "creating kind cluster '$KIND_CLUSTER' (host https=$HTTPS_PORT, HTTPS only)"
      kind create cluster --name "$KIND_CLUSTER" --config "$CFG"
      rm -f "$CFG"
    else
      log "kind cluster '$KIND_CLUSTER' already exists"
    fi
    # Local registry per https://kind.sigs.k8s.io/docs/user/local-registry/
    if ! docker ps -a --format '{{.Names}}' | grep -qx kind-registry; then
      log "creating local registry kind-registry (host localhost:5001)"
      docker run -d --restart=always -p 127.0.0.1:5001:5000 --name kind-registry registry:3
    elif ! docker ps --format '{{.Names}}' | grep -qx kind-registry; then
      log "starting existing kind-registry container"
      docker start kind-registry
    fi
    for node in $(kind get nodes --name "$KIND_CLUSTER"); do
      docker exec "$node" mkdir -p /etc/containerd/certs.d/localhost:5001
      printf '[host."http://kind-registry:5000"]\n' | \
        docker exec -i "$node" cp /dev/stdin /etc/containerd/certs.d/localhost:5001/hosts.toml
    done
    if [ "$(docker inspect -f='{{json .NetworkSettings.Networks.kind}}' kind-registry)" = 'null' ]; then
      docker network connect kind kind-registry
    fi
    # kind ships no ingress: install pinned traefik with NodePort 30443 (HTTPS only).
    if ! kc get namespace traefik >/dev/null 2>&1; then
      log "installing traefik chart v$TRAEFIK_CHART_VERSION"
      helmc repo add traefik https://traefik.github.io/charts >/dev/null
      helmc repo update traefik >/dev/null
      helmc upgrade --install traefik traefik/traefik \
        --namespace traefik --create-namespace \
        --version "$TRAEFIK_CHART_VERSION" \
        -f "$K8S_DIR/stands/kind/traefik.values.yaml" --wait --timeout 300s
    fi
    ;;
  existing)
    log "using existing context '$KUBE_CONTEXT' (cluster itself is not created or modified)"
    context_reachable || die "context '$KUBE_CONTEXT' is not reachable"
    ;;
esac

ensure_livekit_ports
ensure_traefik_https_port "$(published_https_port)"
kc get nodes >/dev/null
log "cluster nodes:"
kc get nodes -o wide | sed 's/^/   /'

# ------------------------------------------------------- coredns rewrite ----
REWRITE_LINE="$(grep -E '^rewrite ' "$K8S_DIR/cluster/coredns-rewrite.txt" | sed "s/TRAEFIK_SVC_PLACEHOLDER/traefik.$TRAEFIK_NS.svc.cluster.local/")"
if [ "$STAND_RUNTIME" = kind ]; then
  # kind's kubeadm Corefile has no import of custom snippets - patch it directly.
  if ! kc get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}' | grep -q 'fusion\.localhost'; then
    log "adding CoreDNS rewrite into the Corefile (kind)"
    kc get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}' > /tmp/fusion-corefile.$$
    awk -v line="$REWRITE_LINE" '/forward \. \/etc\/resolv\.conf/ && !done { print "    " line; done=1 } { print }' \
      /tmp/fusion-corefile.$$ > /tmp/fusion-corefile.$$.new
    mv /tmp/fusion-corefile.$$.new /tmp/fusion-corefile.$$
    kc patch configmap coredns -n kube-system --type=merge \
      -p "$(printf '{"data":{"Corefile":%s}}' "$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1]).read()))' /tmp/fusion-corefile.$$)")"
    rm -f /tmp/fusion-corefile.$$
    kc rollout restart deployment coredns -n kube-system >/dev/null
  else
    log "CoreDNS rewrite already present"
  fi
else
  # k3s Corefile imports /etc/coredns/custom/*.override from the coredns-custom
  # ConfigMap - no Corefile patch needed.
  CM="$(kc get configmap coredns-custom -n kube-system -o jsonpath='{.data}' 2>/dev/null | grep -c 'fusion\.localhost' || true)"
  if [ "$CM" != "1" ]; then
    log "adding CoreDNS rewrite via coredns-custom ConfigMap"
    kc apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns-custom
  namespace: kube-system
data:
  fusion.override: |
    $REWRITE_LINE
EOF
    kc rollout restart deployment coredns -n kube-system >/dev/null
  else
    log "CoreDNS rewrite already present"
  fi
fi

# ------------------------------------------------------------------- TLS ----
log "ensuring TLS material (mkcert wildcard)"
"$K8S_DIR/certs/gen.sh" "$STAND_RUNTIME" || die "TLS setup failed (mkcert installed? network for LE staging not required)"

# ------------------------------------------------------------- crd readiness ----
# `kubectl wait --for=condition=Established` aborts on a CRD whose .status.conditions is not
# written yet (accessor error, not a wait); poll the condition instead.
wait_crd_established() {
  local crd="$1" timeout="${2:-120}"
  local deadline=$((SECONDS + timeout)) status
  while :; do
    status="$(kc get crd "$crd" -o jsonpath='{.status.conditions[?(@.type=="Established")].status}' 2>/dev/null || true)"
    [ "$status" = True ] && return 0
    [ $SECONDS -lt $deadline ] || return 1
    sleep 2
  done
}

# -------------------------------------------------------- strimzi operator ----
# kubectl apply of the pinned release manifest is idempotent: first run installs CRDs + operator,
# later runs keep the operator on the pinned version.
# Cached in TMPDIR: a stalled GitHub download used to hang base-up (and dotest) for hours, and a
# truncated manifest reached kubectl as a YAML parse error. The cache is validated before use.
if [ "$KAFKA_MODE" = strimzi ]; then
STRIMZI_CACHE="${TMPDIR:-/tmp}/fusion-strimzi-$STRIMZI_VERSION.yaml"
strimzi_manifest_ok() { kc apply --dry-run=client -f "$1" >/dev/null 2>&1; }
if [ ! -s "$STRIMZI_CACHE" ] || ! strimzi_manifest_ok "$STRIMZI_CACHE"; then
  log "downloading Strimzi operator $STRIMZI_VERSION manifest"
  TMP="$STRIMZI_CACHE.tmp.$$"
  if curl -fsSL --connect-timeout 10 --max-time 180 \
      --retry 3 --retry-delay 2 --retry-all-errors \
      "https://github.com/strimzi/strimzi-kafka-operator/releases/download/$STRIMZI_VERSION/strimzi-cluster-operator-$STRIMZI_VERSION.yaml" \
      | sed "s/namespace: myproject/namespace: $BASE_NAMESPACE/g" > "$TMP" && strimzi_manifest_ok "$TMP"; then
    mv "$TMP" "$STRIMZI_CACHE"
  else
    rm -f "$TMP"
    if kc get deployment strimzi-cluster-operator -n "$BASE_NAMESPACE" >/dev/null 2>&1; then
      log "Strimzi download failed; the installed operator is kept as is"
    else
      die "cannot download the Strimzi operator manifest and none is installed"
    fi
  fi
fi
kc create namespace "$BASE_NAMESPACE" --dry-run=client -o yaml | kc apply -f -
if [ -s "$STRIMZI_CACHE" ]; then
  if [ "$(kc get crd kafkas.kafka.strimzi.io -o jsonpath='{.status.storedVersions[-1]}' 2>/dev/null || true)" = "" ]; then
    log "installing Strimzi operator $STRIMZI_VERSION"
    kc apply -n "$BASE_NAMESPACE" -f "$STRIMZI_CACHE"
    log "waiting for strimzi CRDs"
    wait_crd_established kafkas.kafka.strimzi.io || \
      die "Strimzi CRD kafkas.kafka.strimzi.io is not established"
  else
    log "Strimzi already installed - re-applying pinned $STRIMZI_VERSION manifest"
    kc apply -n "$BASE_NAMESPACE" -f "$STRIMZI_CACHE"
  fi
fi
fi

# ------------------------------------------------------ cloudnativepg operator ----
# Only when the base renders a Cluster: an external PostgreSQL has no operator here.
if [ "$PG_MODE" != external ]; then
  # Same shape as Strimzi: pinned release manifest, cached in TMPDIR, applied on every run.
  # Server-side apply is required: the CRD manifests exceed the 256KB limit of the
  # last-applied-configuration annotation that client-side apply writes.
  CNPG_VER="${CLOUDNATIVE_PG_VERSION#v}"
  CNPG_CACHE="${TMPDIR:-/tmp}/fusion-cnpg-$CNPG_VER.yaml"
  cnpg_manifest_ok() {
    kc create --dry-run=client -f "$1" >/dev/null 2>&1 && grep -q 'clusters.postgresql.cnpg.io' "$1"
  }
  if [ ! -s "$CNPG_CACHE" ] || ! cnpg_manifest_ok "$CNPG_CACHE"; then
    log "downloading CloudNativePG operator $CLOUDNATIVE_PG_VERSION manifest"
    TMP="$CNPG_CACHE.tmp.$$"
    if curl -fsSL --connect-timeout 10 --max-time 180 \
        --retry 3 --retry-delay 2 --retry-all-errors \
        "https://github.com/cloudnative-pg/cloudnative-pg/releases/download/$CLOUDNATIVE_PG_VERSION/cnpg-$CNPG_VER.yaml" \
        > "$TMP" && cnpg_manifest_ok "$TMP"; then
      mv "$TMP" "$CNPG_CACHE"
    else
      rm -f "$TMP"
      if kc get deployment cnpg-controller-manager -n cnpg-system >/dev/null 2>&1; then
        log "CloudNativePG download failed; the installed operator is kept as is"
      else
        die "cannot download the CloudNativePG operator manifest and none is installed"
      fi
    fi
  fi
  if [ -s "$CNPG_CACHE" ]; then
    log "installing/updating CloudNativePG operator $CLOUDNATIVE_PG_VERSION"
    kc apply --server-side --force-conflicts -f "$CNPG_CACHE" >/dev/null
    log "waiting for the CloudNativePG CRD"
    wait_crd_established clusters.postgresql.cnpg.io || \
      die "CloudNativePG CRD clusters.postgresql.cnpg.io is not established"
    kc -n cnpg-system rollout status deployment/cnpg-controller-manager --timeout=180s >/dev/null || \
      die "CloudNativePG operator did not become ready"
  fi

fi

# ------------------------------------------------- sealed secrets controller ----
# Only where secrets are actually sealed: real clusters, or an explicit opt-in on k3d.
if [ "$STAND_RUNTIME" != k3d ] || [ "${SEALED_SECRETS:-0}" = 1 ]; then
  SS_VER="${SEALED_SECRETS_VERSION#v}"
  SS_CACHE="${TMPDIR:-/tmp}/fusion-sealed-secrets-$SS_VER.yaml"
  ss_manifest_ok() {
    kc create --dry-run=client -f "$1" >/dev/null 2>&1 && grep -q 'name: sealed-secrets-controller' "$1"
  }
  if [ ! -s "$SS_CACHE" ] || ! ss_manifest_ok "$SS_CACHE"; then
    log "downloading sealed-secrets controller $SEALED_SECRETS_VERSION"
    TMP="$SS_CACHE.tmp.$$"
    if curl -fsSL --connect-timeout 10 --max-time 180 \
        --retry 3 --retry-delay 2 --retry-all-errors \
        "https://github.com/bitnami-labs/sealed-secrets/releases/download/$SEALED_SECRETS_VERSION/controller.yaml" \
        > "$TMP" && ss_manifest_ok "$TMP"; then
      mv "$TMP" "$SS_CACHE"
    else
      rm -f "$TMP"
      if kc -n kube-system get deployment sealed-secrets-controller >/dev/null 2>&1; then
        log "sealed-secrets download failed; the installed controller is kept as is"
      else
        die "cannot download the sealed-secrets controller manifest and none is installed"
      fi
    fi
  fi
  if [ -s "$SS_CACHE" ]; then
    log "installing/updating sealed-secrets controller $SEALED_SECRETS_VERSION"
    kc apply -f "$SS_CACHE" >/dev/null
    kc -n kube-system rollout status deployment/sealed-secrets-controller --timeout=180s >/dev/null || \
      die "sealed-secrets controller did not become ready"
  fi
fi

# ----------------------------------------------------------- platform-base ----
kc create namespace "$BASE_NAMESPACE" --dry-run=client -o yaml | kc apply -f -

BASE_VALUES=()
[ -f "$K8S_DIR/stands/base/values.yaml" ] && BASE_VALUES+=(-f "$K8S_DIR/stands/base/values.yaml")
# Sealed base credentials, generated by `stand:seal base` for this cluster.
[ -f "$K8S_DIR/stands/base/sealed.yaml" ] && BASE_VALUES+=(-f "$K8S_DIR/stands/base/sealed.yaml")
# The shared LiveKit is a k3d feature: its RTC ports are node ports from cluster/k3d.yaml. kind and
# existing keep the host livekit-server (stands/dev/values.local-livekit.yaml).
LIVEKIT_ARGS=()
[ "$STAND_RUNTIME" = k3d ] || LIVEKIT_ARGS=(--set livekit.enabled=false)
# The CNPG operand image is ~250MB; when a copy is mirrored into the local registry, pull it from
# there - a slow GitHub link otherwise stalls the first initdb for many minutes. The chart keeps
# the GHCR image as its default, so a registry without the mirror still renders a valid Cluster.
PG_IMAGE_ARGS=()
PG_TAG="${CLOUDNATIVE_PG_IMAGE##*:}"
PG_IMAGE="$CLOUDNATIVE_PG_IMAGE"
mirror_pg_image() {
  curl -fsS --connect-timeout 3 --max-time 5 \
    "http://$REGISTRY_PUSH/v2/cnpg/postgresql/tags/list" 2>/dev/null | grep -q "\"$PG_TAG\""
}
if [ -n "$REGISTRY_PUSH" ] && [ "$STAND_RUNTIME" = k3d ] && ! mirror_pg_image; then
  # A fresh k3d cluster starts with an empty registry; pull once on the host and push it in,
  # otherwise the first initdb waits on a 250MB GitHub download.
  log "mirroring $CLOUDNATIVE_PG_IMAGE into $REGISTRY_PUSH"
  if docker pull "$CLOUDNATIVE_PG_IMAGE" >/dev/null 2>&1 && \
     docker tag "$CLOUDNATIVE_PG_IMAGE" "$REGISTRY_PUSH/cnpg/postgresql:$PG_TAG" && \
     docker push "$REGISTRY_PUSH/cnpg/postgresql:$PG_TAG" >/dev/null 2>&1; then
    log "postgres image mirrored"
  else
    warn "could not mirror the postgres image; the first initdb will pull it from GHCR"
  fi
fi
if [ -n "$REGISTRY_PUSH" ] && mirror_pg_image; then
  PG_IMAGE="$REGISTRY_PULL/cnpg/postgresql:$PG_TAG"
  log "using the mirrored postgres image $PG_IMAGE"
fi
# Always passed: a mirror that disappears must not leave the old image behind in the release values.
PG_IMAGE_ARGS=(--set "postgres.image=$PG_IMAGE")
# images are pinned in the chart values; versions.env single source is kept in
# stands/base/values.yaml (see stands layout in README)
log "installing/upgrading platform-base in namespace $BASE_NAMESPACE"
helmc upgrade --install platform-base "$K8S_DIR/charts/platform-base" \
  -n "$BASE_NAMESPACE" \
  --set tls.traefikNamespace="$TRAEFIK_NS" \
  --set "kafka.mode=$KAFKA_MODE" \
  "${POSTGRES_MODE_ARGS[@]}" \
  "${BASE_VALUES[@]}" "${LIVEKIT_ARGS[@]}" "${PG_IMAGE_ARGS[@]}" \
  --timeout 600s

log "waiting for platform-base components"
# All components start together, so wait for them together: a sequential chain adds the last
# component's readiness to every earlier one and hides which wait is the slow one.
wait_component() {
  local name="$1"
  shift
  "$@" >/dev/null || {
    printf 'ERROR: %s did not become ready\n' "$name" >&2
    exit 1
  }
}

PIDS=()
NAMES=()
components() {
  local name="$1"
  shift
  wait_component "$name" "$@" &
  PIDS+=($!)
  NAMES+=("$name")
}

if [ "$PG_MODE" != external ]; then
  postgres_wait() {
    kc -n "$BASE_NAMESPACE" wait cluster/postgres --for=condition=Ready --timeout=600s >/dev/null || return 1
    local pg_deadline=$((SECONDS + 600)) pg_ready pg_want
    while :; do
      pg_ready="$(kc -n "$BASE_NAMESPACE" get cluster postgres -o jsonpath='{.status.readyInstances}' 2>/dev/null || true)"
      pg_want="$(kc -n "$BASE_NAMESPACE" get cluster postgres -o jsonpath='{.spec.instances}' 2>/dev/null || true)"
      [ -n "$pg_ready" ] && [ "$pg_ready" = "$pg_want" ] && return 0
      [ $SECONDS -lt $pg_deadline ] || { echo "postgres instances are $pg_ready/$pg_want, expected all ready" >&2; return 1; }
      sleep 3
    done
  }
  components postgres postgres_wait
fi
components s3 wait_statefulset "$BASE_NAMESPACE" s3 300
components elastic wait_statefulset "$BASE_NAMESPACE" elastic 600
components redis kc -n "$BASE_NAMESPACE" rollout status deployment/redis --timeout=120s
components mailpit kc -n "$BASE_NAMESPACE" rollout status deployment/mailpit --timeout=120s
if [ "$STAND_RUNTIME" = k3d ]; then
  components livekit kc -n "$BASE_NAMESPACE" rollout status deployment/livekit --timeout=300s
  components livekit-egress kc -n "$BASE_NAMESPACE" rollout status deployment/livekit-egress --timeout=300s
fi
# Kafka: the my-cluster resource reports readiness via the Ready condition; redpanda is a plain
# deployment on the same kafka:9092 contract.
if [ "$KAFKA_MODE" = redpanda ]; then
  components kafka kc -n "$BASE_NAMESPACE" rollout status deployment/redpanda --timeout=300s
elif [ "$KAFKA_MODE" != external ]; then
  components kafka kc -n "$BASE_NAMESPACE" wait kafka my-cluster --for=condition=Ready --timeout=600s
fi

FAILED=0
for i in "${!PIDS[@]}"; do
  wait "${PIDS[$i]}" || FAILED=1
done
[ "$FAILED" = 0 ] || die "platform-base did not become ready"

echo
log "base is up:"
echo "  context:      $KUBE_CONTEXT"
echo "  namespace:    $BASE_NAMESPACE"
echo "  registry:     push=$REGISTRY_PUSH pull=$REGISTRY_PULL"
echo "  next:         pnpm -w stand:dev:up   (STAND_RUNTIME=$STAND_RUNTIME)"
