#!/usr/bin/env bash
# Idempotent bring-up of the shared base for local stands:
#   1. cluster (k3d/kind) with local registry and 80/443 on the load balancer
#   2. CoreDNS rewrite *.fusion.localhost -> traefik, TLS (mkcert + TLSStore default)
#   3. Strimzi operator (pinned) and the platform-base chart: postgres, Kafka,
#      silo S3, elastic, redis, mailpit + the platform-base contract
#
# Usage: base-up.sh [k3d|kind|existing]   (default: STAND_RUNTIME or k3d)
# Safe to re-run: existing parts are detected and skipped.
set -euo pipefail
[ $# -ge 1 ] && STAND_RUNTIME="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_tools

log "base-up: runtime=$STAND_RUNTIME context=$KUBE_CONTEXT"

# ---------------------------------------------------------------- cluster ----
case "$STAND_RUNTIME" in
  k3d)
    if ! cluster_exists; then
      HTTP_PORT="${STAND_HTTP_PORT:-80}"
      HTTPS_PORT="${STAND_HTTPS_PORT:-443}"
      ports_free "$HTTP_PORT" "$HTTPS_PORT" || \
        die "host ports $HTTP_PORT/$HTTPS_PORT are busy. Free them, or run on alternative ports: STAND_HTTP_PORT=8080 STAND_HTTPS_PORT=8443 $0 k3d"
      CFG="$(mktemp -t k3d-fusion.XXXXXX.yaml)"
      sed -E "s/^(- port: )80:80$/\\1${HTTP_PORT}:80/; s/^(- port: )443:443$/\\1${HTTPS_PORT}:443/" \
        "$K8S_DIR/cluster/k3d.yaml" > "$CFG"
      log "creating k3d cluster '$K3D_CLUSTER' (host http=$HTTP_PORT https=$HTTPS_PORT)"
      k3d cluster create --config "$CFG"
      rm -f "$CFG"
    else
      log "k3d cluster '$K3D_CLUSTER' already exists"
    fi
    ;;
  kind)
    if ! cluster_exists; then
      HTTP_PORT="${STAND_HTTP_PORT:-80}"
      HTTPS_PORT="${STAND_HTTPS_PORT:-443}"
      ports_free "$HTTP_PORT" "$HTTPS_PORT" || \
        die "host ports $HTTP_PORT/$HTTPS_PORT are busy. kind cannot share them with k3d; free them or use alternative ports: STAND_HTTP_PORT=8080 STAND_HTTPS_PORT=8443 $0 kind"
      CFG="$(mktemp -t kind-fusion.XXXXXX.yaml)"
      sed -E "s/(hostPort: )80$/\\1${HTTP_PORT}/; s/(hostPort: )443$/\\1${HTTPS_PORT}/" \
        "$K8S_DIR/cluster/kind.yaml" > "$CFG"
      log "creating kind cluster '$KIND_CLUSTER' (host http=$HTTP_PORT https=$HTTPS_PORT)"
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
    # kind ships no ingress: install pinned traefik with NodePort 30080/30443.
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

# -------------------------------------------------------- strimzi operator ----
# kubectl apply of the pinned release manifest is idempotent: first run installs
# CRDs + operator, later runs keep the operator on the pinned version.
TMP="$(mktemp -t strimzi.XXXXXX.yaml)"
curl -sL "https://github.com/strimzi/strimzi-kafka-operator/releases/download/$STRIMZI_VERSION/strimzi-cluster-operator-$STRIMZI_VERSION.yaml" \
  | sed "s/namespace: myproject/namespace: $BASE_NAMESPACE/g" > "$TMP"
kc create namespace "$BASE_NAMESPACE" --dry-run=client -o yaml | kc apply -f -
if [ "$(kc get crd kafkas.kafka.strimzi.io -o jsonpath='{.status.storedVersions[-1]}' 2>/dev/null || true)" = "" ]; then
  log "installing Strimzi operator $STRIMZI_VERSION"
  kc apply -n "$BASE_NAMESPACE" -f "$TMP"
  log "waiting for strimzi CRDs"
  kc wait --for=condition=Established crd kafkas.kafka.strimzi.io --timeout=120s
else
  log "Strimzi already installed - re-applying pinned $STRIMZI_VERSION manifest"
  kc apply -n "$BASE_NAMESPACE" -f "$TMP"
fi
rm -f "$TMP"

# ----------------------------------------------------------- platform-base ----
kc create namespace "$BASE_NAMESPACE" --dry-run=client -o yaml | kc apply -f -

if [ -f "$K8S_DIR/stands/base/values.yaml" ]; then
  BASE_VALUES=(-f "$K8S_DIR/stands/base/values.yaml")
else
  BASE_VALUES=()
fi
# images are pinned in the chart values; versions.env single source is kept in
# stands/base/values.yaml (see stands layout in README)
log "installing/upgrading platform-base in namespace $BASE_NAMESPACE"
helmc upgrade --install platform-base "$K8S_DIR/charts/platform-base" \
  -n "$BASE_NAMESPACE" \
  --set tls.traefikNamespace="$TRAEFIK_NS" \
  "${BASE_VALUES[@]}" \
  --timeout 600s

log "waiting for platform-base components"
wait_statefulset "$BASE_NAMESPACE" postgres 300 || die "postgres did not become ready"
wait_statefulset "$BASE_NAMESPACE" s3 300 || die "silo did not become ready"
wait_statefulset "$BASE_NAMESPACE" elastic 600 || die "elastic did not become ready"
kc -n "$BASE_NAMESPACE" rollout status deployment/redis --timeout=120s >/dev/null || die "redis did not become ready"
kc -n "$BASE_NAMESPACE" rollout status deployment/mailpit --timeout=120s >/dev/null || die "mailpit did not become ready"
# Kafka: the my-cluster resource reports readiness via the Ready condition
kc -n "$BASE_NAMESPACE" wait kafka my-cluster --for=condition=Ready --timeout=600s || die "Kafka did not become ready"

echo
log "base is up:"
echo "  context:      $KUBE_CONTEXT"
echo "  namespace:    $BASE_NAMESPACE"
echo "  registry:     push=$REGISTRY_PUSH pull=$REGISTRY_PULL"
echo "  next:         pnpm -w stand:dev:up   (STAND_RUNTIME=$STAND_RUNTIME)"
