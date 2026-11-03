#!/usr/bin/env bash
# Install or upgrade one stand (the platform chart) against the base environment.
#
#   deploy.sh <stand> [k3d|kind|existing] [--push|--no-push] [--dry-run]
#
# A stand is a namespace fusion-<stand> + release fusion-<stand> + host
# <stand>.fusion.localhost, built from stands/<stand>/values.yaml (+ runtime
# overlay). Requires base: run stand:base:up first (auto-checked).
# STAND_NAMESPACE overrides the target namespace when set explicitly in the
# environment; the value saved by stand:configure applies to the dev stand only.
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

# Per-stand settings from the merged values files (later files win - runtime
# overlays redefine namespace/host). STAND_NAMESPACE (set explicitly in the
# environment, or saved by stand:configure for the dev stand only) overrides
# the namespace for the next deploy.
mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
NS="$(stand_namespace "$STAND")"
HOST="$(stand_host "$STAND")"
[ -n "$NS" ] && [ -n "$HOST" ] || die "cannot resolve namespace/hostUrl from ${VALUES_FILES[*]}"
RELEASE="fusion-$STAND"
# Saved-config namespace pointing at a different stand (e.g. fusion-dev while
# deploying sanity) must never receive the install even if down was skipped.
guard_deploy_namespace "$STAND" "$NS"
# Images are expected pullable on a remote cluster; locally they are pushed
# unless overridden (STAND_PUSH_IMAGES from stand:configure, --push/--no-push).
if [ -z "$PUSH" ]; then
  case "$STAND_RUNTIME" in
    existing) PUSH="${STAND_PUSH_IMAGES:-0}" ;;
    *)        PUSH="${STAND_PUSH_IMAGES:-1}" ;;
  esac
fi
LIVEKIT_ARGS=()
if [ "$STAND" = dev ] && [ "${STAND_LIVEKIT:-local}" = local ]; then
  case "$STAND_RUNTIME" in
    k3d) LIVEKIT_ARGS=(--set "config.livekitHost=ws://host.docker.internal:7880") ;;
    kind)
      if [ "${KIND_EXPERIMENTAL_PROVIDER:-}" = podman ]; then
        LIVEKIT_ARGS=(--set "config.livekitHost=ws://host.containers.internal:7880")
      fi
      ;;
  esac
fi

# CI contract (GitLab docker-build job):
#   STAND_VERSION          - overrides global.version (images tagged <version>)
#   STAND_IMAGE_REGISTRY   - overrides the pull registry (global.imageRegistry)
#   STAND_IMAGE_NAMESPACE  - overrides the image namespace (global.imageNamespace,
#                            e.g. DOCKER_NAMESPACE; default intabiafusion)
#   STAND_PUSH_IMAGES=0    - never push from this host; the cluster pulls the
#                            published images itself (default for `existing`)
#   STAND_COVERAGE=true    - run the stand with V8 coverage profiles
#   STAND_REGISTRY_USERNAME/PASSWORD - private pull registry the cluster nodes
#                            authenticate to: creates the stand-registry pull
#                            secret on the namespace default ServiceAccount
#                            (STAND_REGISTRY_SERVER optional, defaults to the
#                            host of STAND_IMAGE_REGISTRY)
VERSION_ARGS=()
[ -n "${STAND_VERSION:-}" ] && VERSION_ARGS+=(--set "global.version=$STAND_VERSION")
[ "${STAND_COVERAGE:-false}" = true ] && VERSION_ARGS+=(--set "global.coverage.enabled=true")

if [ "$DRY_RUN" = 1 ]; then
  # lookup of the platform-base contract is empty in `helm template`, so the
  # mandatory addresses come from the CI overlay with fictional values.
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
HTTPS_PORT="$(published_https_port)"
ensure_traefik_https_port "$HTTPS_PORT"

# TLS CA secret for the stand namespace (idempotent).
"$K8S_DIR/certs/gen.sh" "$STAND_RUNTIME" "$NS" >/dev/null

if [ "$PUSH" = 1 ]; then
  log "pushing images for stand '$STAND'"
  "$SCRIPT_DIR/push-images.sh" "$STAND" "$STAND_RUNTIME"
fi

# ---------------------------------------------------------- registry auth ----
# A private registry the host `docker login` covers but k3d/kind nodes do not:
# with credentials given, pods pull through a docker-registry secret on the
# namespace's default ServiceAccount. Nothing happens when the variables are
# unset; one without the other is an error. Credentials never reach the logs
# (the docker config is built in a 600 temp file and piped through dry-run/apply).
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

log "installing/upgrading $RELEASE in namespace $NS (host https://$HOST)"
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

# HTTPS smoke check from the host; --resolve pins the host to loopback so the
# check works before/without an /etc/hosts entry. --cacert points at the mkcert
# CA when the system store is not set up (mkcert -install needs sudo).
DISPLAY_URL="https://$HOST"
[ "$HTTPS_PORT" = 443 ] || DISPLAY_URL="$DISPLAY_URL:$HTTPS_PORT"

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
