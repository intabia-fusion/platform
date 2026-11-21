#!/usr/bin/env bash
# Install or upgrade one stand (the platform chart) against the base environment.
# A stand is namespace fusion-<stand> + release fusion-<stand> + <stand>.fusion.localhost from
# stands/<stand>/values.yaml (+ runtime overlay); STAND_NAMESPACE overrides only when explicit.
set -euo pipefail
STAND="${1:?usage: deploy.sh <stand> [runtime] [--push|--no-push|--dry-run]}"; shift || true
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

PUSH=""; DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=0 ;;
    --push) PUSH=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

require_tools
[ "$DRY_RUN" = 1 ] || stand_lock_acquire "$STAND"

# Per-stand settings from the merged values files (later files win - runtime overlays redefine
# namespace/host); STAND_NAMESPACE overrides the namespace for the next deploy.
mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
NS="$(stand_namespace "$STAND")"
HOST="$(stand_host "$STAND")"
[ -n "$NS" ] && [ -n "$HOST" ] || die "cannot resolve namespace/hostUrl from ${VALUES_FILES[*]}"
RELEASE="fusion-$STAND"
# A saved-config namespace pointing at another stand (fusion-dev while deploying sanity) must
# never receive the install even if down was skipped.
guard_deploy_namespace "$STAND" "$NS"
# Images are expected pullable on a remote cluster; locally they are pushed unless overridden
# (STAND_PUSH_IMAGES from stand:configure, --push/--no-push).
if [ -z "$PUSH" ]; then
  case "$STAND_RUNTIME" in
    existing) PUSH="${STAND_PUSH_IMAGES:-0}" ;;
    *)        PUSH="${STAND_PUSH_IMAGES:-1}" ;;
  esac
fi
# k3d stands share the cluster LiveKit; only a non-k3d dev stand reaches a host server, and Podman
# spells the host alias differently.
LIVEKIT_ARGS=()
if [ "$STAND_RUNTIME" != k3d ] && [ "$STAND" = dev ] && [ "${KIND_EXPERIMENTAL_PROVIDER:-}" = podman ]; then
  LIVEKIT_ARGS=(--set "config.livekitHost=ws://host.containers.internal:7880")
fi

# CI contract (GitLab docker-build job): STAND_VERSION/STAND_IMAGE_REGISTRY/STAND_IMAGE_NAMESPACE map to
# global.*, plus STAND_COVERAGE, STAND_PUSH_IMAGES, STAND_REGISTRY_USERNAME/PASSWORD -> stand-registry secret.
VERSION_ARGS=()
[ -n "${STAND_VERSION:-}" ] && VERSION_ARGS+=(--set "global.version=$STAND_VERSION")
[ "${STAND_COVERAGE:-false}" = true ] && VERSION_ARGS+=(--set "global.coverage.enabled=true")

if [ "$DRY_RUN" = 1 ]; then
  # lookup of the platform-base contract is empty in `helm template`, so the mandatory
  # addresses come from the CI overlay with fictional values.
  log "dry-run render of $RELEASE (context $KUBE_CONTEXT, ns $NS, host $HOST)"
  VAL_ARGS=()
  for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
  [ -f "$K8S_DIR/stands/ci/render-check.yaml" ] && VAL_ARGS+=(-f "$K8S_DIR/stands/ci/render-check.yaml")
  helmc template "$RELEASE" "$K8S_DIR/charts/platform" -n "$NS" \
    "${VAL_ARGS[@]}" "${LIVEKIT_ARGS[@]}" "${VERSION_ARGS[@]}" --set global.imageRegistry="$STAND_IMAGE_REGISTRY" \
    --set global.imageNamespace="$STAND_IMAGE_NAMESPACE" \
    --set global.namespace="$NS"
  exit 0
fi

ensure_base
ensure_livekit_ports
HTTPS_PORT="$(published_https_port)"
ensure_traefik_https_port "$HTTPS_PORT"

# TLS CA secret for the stand namespace (idempotent).
"$K8S_DIR/certs/gen.sh" "$STAND_RUNTIME" "$NS" >/dev/null

if [ "$PUSH" = 1 ]; then
  log "pushing images for stand '$STAND'"
  "$SCRIPT_DIR/push-images.sh" "$STAND" "$STAND_RUNTIME"
fi

# ---------------------------------------------------------- registry auth ----
# A private registry the host `docker login` covers but k3d/kind nodes do not: credentials create
# the stand-registry pull secret on the default ServiceAccount (600 temp file, never in the logs).
if [ -n "${STAND_REGISTRY_USERNAME:-}" ] || [ -n "${STAND_REGISTRY_PASSWORD:-}" ]; then
  if [ -z "${STAND_REGISTRY_USERNAME:-}" ] || [ -z "${STAND_REGISTRY_PASSWORD:-}" ]; then
    die "registry auth needs both STAND_REGISTRY_USERNAME and STAND_REGISTRY_PASSWORD (or neither)"
  fi
  REGISTRY_SERVER="${STAND_REGISTRY_SERVER:-}"
  if [ -z "$REGISTRY_SERVER" ] && [ -n "$STAND_IMAGE_REGISTRY" ]; then
    REGISTRY_SERVER="${STAND_IMAGE_REGISTRY#*://}"
    REGISTRY_SERVER="${REGISTRY_SERVER%%/*}"
  fi
  [ -n "$REGISTRY_SERVER" ] || REGISTRY_SERVER="https://index.docker.io/v1/"
  log "configuring pull secret stand-registry in namespace $NS (server $REGISTRY_SERVER)"

  DOCKERCFG="$(mktemp -t stand-registry.XXXXXX)"
  chmod 600 "$DOCKERCFG"
  trap 'rm -f "$DOCKERCFG"' EXIT
  DOCKERCFG="$DOCKERCFG" REGISTRY_SERVER="$REGISTRY_SERVER" \
  STAND_REGISTRY_USERNAME="$STAND_REGISTRY_USERNAME" STAND_REGISTRY_PASSWORD="$STAND_REGISTRY_PASSWORD" \
    python3 - <<'PYEOF' >/dev/null
import base64
import json
import os

username = os.environ["STAND_REGISTRY_USERNAME"]
password = os.environ["STAND_REGISTRY_PASSWORD"]
server = os.environ["REGISTRY_SERVER"]
auth = base64.b64encode(f"{username}:{password}".encode()).decode()
with open(os.environ["DOCKERCFG"], "w", encoding="utf-8") as fh:
    json.dump({"auths": {server: {"username": username, "password": password, "auth": auth}}}, fh)
PYEOF

  kc create namespace "$NS" --dry-run=client -o yaml | kc apply -f - >/dev/null
  kc -n "$NS" create secret generic stand-registry \
    --type=kubernetes.io/dockerconfigjson \
    --from-file=.dockerconfigjson="$DOCKERCFG" \
    --dry-run=client -o yaml | kc -n "$NS" apply -f - >/dev/null
  # Strategic merge keys imagePullSecrets by name: repeatable, keeps other entries.
  kc -n "$NS" patch serviceaccount default --type=strategic \
    --patch='{"imagePullSecrets":[{"name":"stand-registry"}]}' >/dev/null
  rm -f "$DOCKERCFG"
  trap - EXIT
fi

DISPLAY_URL="https://$HOST"
[ "$HTTPS_PORT" = 443 ] || DISPLAY_URL="$DISPLAY_URL:$HTTPS_PORT"

log "installing/upgrading $RELEASE in namespace $NS (host $DISPLAY_URL)"
VAL_ARGS=()
for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
helmc upgrade --install "$RELEASE" "$K8S_DIR/charts/platform" \
  -n "$NS" --create-namespace \
  "${VAL_ARGS[@]}" "${LIVEKIT_ARGS[@]}" "${VERSION_ARGS[@]}" \
  --set global.imageRegistry="$STAND_IMAGE_REGISTRY" \
  --set global.imageNamespace="$STAND_IMAGE_NAMESPACE" \
  --set global.namespace="$NS" \
  --set global.publicPort="$HTTPS_PORT" \
  --timeout 600s

log "waiting for $RELEASE"
wait_deployments "$NS" 600 || die "stand '$STAND' did not become ready - see diagnostics above"
if kc -n "$NS" get job "db-init-$RELEASE" >/dev/null 2>&1; then
  wait_job "$NS" "db-init-$RELEASE" 300 || die "db-init failed"
fi

# HTTPS smoke check from the host. --resolve pins the host to loopback so it works before/without
# an /etc/hosts entry; --cacert covers setups where mkcert -install (sudo) was never run.
echo
log "stand '$STAND' is up:"
echo "  url:       $DISPLAY_URL  (hosts entry on macOS: 127.0.0.1 $HOST)"
echo "  namespace: $NS"
echo "  context:   $KUBE_CONTEXT"

CURL_CA=()
if [ -f "$(mkcert -CAROOT 2>/dev/null)/rootCA.pem" ]; then
  CURL_CA=(--cacert "$(mkcert -CAROOT)/rootCA.pem")
fi
code="$(curl "${CURL_CA[@]}" --resolve "$HOST:$HTTPS_PORT:127.0.0.1" -sS -o /dev/null -w '%{http_code}' \
  --max-time 15 "https://$HOST:$HTTPS_PORT/" 2>/dev/null || true)"
case "$code" in
  200|301|302) log "$DISPLAY_URL responds with $code" ;;
  *) warn "$DISPLAY_URL did not answer as expected (code $code) - check 'kc -n $NS get pods' and traefik" ;;
esac
