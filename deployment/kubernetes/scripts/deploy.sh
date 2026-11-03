#!/usr/bin/env bash
# Install or upgrade one stand (the platform chart) against the base environment.
#
#   deploy.sh <stand> [k3d|kind|existing] [--no-push] [--dry-run]
#
# A stand is a namespace fusion-<stand> + release fusion-<stand> + host
# <stand>.fusion.localhost, built from stands/<stand>/values.yaml (+ runtime
# overlay). Requires base: run stand:base:up first (auto-checked).
set -euo pipefail
STAND="${1:?usage: deploy.sh <stand> [runtime] [--no-push|--dry-run]}"; shift || true
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

PUSH=1; DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-push) PUSH=0 ;;
    --dry-run) DRY_RUN=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

require_tools

# Per-stand settings from the merged values files (later files win - runtime
# overlays redefine namespace/host).
mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
NS="$(grep -h '^  namespace:' "${VALUES_FILES[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
HOST="$(grep -h '^  hostUrl:' "${VALUES_FILES[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
[ -n "$NS" ] && [ -n "$HOST" ] || die "cannot resolve namespace/hostUrl from ${VALUES_FILES[*]}"
RELEASE="fusion-$STAND"

if [ "$DRY_RUN" = 1 ]; then
  # lookup of the platform-base contract is empty in `helm template`, so the
  # mandatory addresses come from the CI overlay with fictional values.
  log "dry-run render of $RELEASE (context $KUBE_CONTEXT, ns $NS, host $HOST)"
  VAL_ARGS=()
  for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
  [ -f "$K8S_DIR/stands/ci/render-check.yaml" ] && VAL_ARGS+=(-f "$K8S_DIR/stands/ci/render-check.yaml")
  helmc template "$RELEASE" "$K8S_DIR/charts/platform" -n "$NS" \
    "${VAL_ARGS[@]}" --set global.imageRegistry="$REGISTRY_PULL"
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

log "installing/upgrading $RELEASE in namespace $NS (host https://$HOST)"
VAL_ARGS=()
for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
helmc upgrade --install "$RELEASE" "$K8S_DIR/charts/platform" \
  -n "$NS" --create-namespace \
  "${VAL_ARGS[@]}" \
  --set global.imageRegistry="$REGISTRY_PULL" \
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
