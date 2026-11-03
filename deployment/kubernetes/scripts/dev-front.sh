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
# Start webpack dev-server against a stand in Kubernetes.
#
# By default the dev-server runs inside a Docker container (fusion-dev-front):
# the repo is bind-mounted (HMR/source editing stay on macOS), Linux
# node_modules and the pnpm store live on named volumes seeded from the
# dev-front image, so no Linux binaries or root-owned files land in the host
# checkout. The container proxies API/WebSocket paths to the configured
# Kubernetes stand and serves its config/branding with a localhost alias.
#
# Modes:
#   (default)        container; Ctrl+C stops the dev-server, the container is removed
#   down             stop and remove a running dev-front container
#   --host           host-local webpack (legacy; remote clusters, Docker-less troubleshooting)
#   DEV_FRONT_MODE=host   same as --host
#
# Port: host ${PORT:-8080} -> container 8080 (webpack-dev-server reads PORT,
# we pin it to 8080 inside the container).
set -euo pipefail

MODE="${DEV_FRONT_MODE:-container}"
ACTION=start
STAND=dev
[ $# -ge 1 ] && case "$1" in dev|sanity|ws|api) STAND="$1"; shift ;; esac
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
[ $# -ge 1 ] && case "$1" in down) ACTION=down; shift ;; esac
[ $# -ge 1 ] && case "$1" in --host) MODE=host; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

CONTAINER="fusion-dev-front"
IMAGE="fusion-dev-front:dev"
NODE_MODULES_VOLUME="fusion-dev-front-node_modules"
HOST_PORT="${PORT:-8080}"

if [ "$ACTION" = down ]; then
  require_tools
  if docker rm -f "$CONTAINER" >/dev/null 2>&1; then
    log "stopped and removed container $CONTAINER"
  else
    log "container $CONTAINER is not running"
  fi
  exit 0
fi

require_tools
ensure_base

HOST="$(stand_host "$STAND")"
[ -n "$HOST" ] || die "cannot resolve $STAND hostUrl"
HTTPS_PORT="$(published_https_port)"
STAND_URL="https://$HOST:$HTTPS_PORT"
STAND_PUBLIC_HOST="$HOST"
[ "$HTTPS_PORT" = 443 ] || STAND_PUBLIC_HOST="$HOST:$HTTPS_PORT"
export STAND_URL STAND_PUBLIC_HOST

CA_PEM="$(mkcert -CAROOT)/rootCA.pem"
[ -f "$CA_PEM" ] || die "mkcert CA not found: $CA_PEM"
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-$CA_PEM}"

STAND_CONFIG_FILE="$(mktemp -t fusion-dev-front-config.XXXXXX.json)"
STAND_BRANDING_FILE="$(mktemp -t fusion-dev-front-branding.XXXXXX.json)"
trap 'rm -f "$STAND_CONFIG_FILE" "$STAND_BRANDING_FILE"' EXIT
export STAND_CONFIG_FILE STAND_BRANDING_FILE

log "loading runtime config from $STAND_URL"
curl --cacert "$CA_PEM" --resolve "$HOST:$HTTPS_PORT:127.0.0.1" -fsS \
  "$STAND_URL/config.json" | python3 -c '
import json, os, sys

base = os.environ["STAND_URL"].rstrip("/")
config = json.load(sys.stdin)

def relative(value):
    if isinstance(value, str):
        return value.replace(base, "")
    if isinstance(value, list):
        return [relative(item) for item in value]
    if isinstance(value, dict):
        return {key: relative(item) for key, item in value.items()}
    return value

config = relative(config)
config["BRANDING_URL"] = "/branding.json"
json.dump(config, sys.stdout, indent=2)
' > "$STAND_CONFIG_FILE" || die "cannot load dev config; run: pnpm -w stand:dev:up $STAND_RUNTIME"

curl --cacert "$CA_PEM" --resolve "$HOST:$HTTPS_PORT:127.0.0.1" -fsS \
  "$STAND_URL/platform-branding.json" | python3 -c '
import json, os, sys

branding = json.load(sys.stdin)
local_host = "localhost:" + os.environ.get("PORT", "8080")
stand_host = os.environ["STAND_PUBLIC_HOST"]
if local_host not in branding:
    if stand_host in branding:
        branding[local_host] = branding[stand_host]
    elif len(branding) == 1:
        branding[local_host] = next(iter(branding.values()))
json.dump(branding, sys.stdout, indent=2)
' > "$STAND_BRANDING_FILE" || die "cannot load stand branding from $STAND_URL"

if [ "$MODE" = host ]; then
  cd "$REPO_ROOT/dev/prod"
  export NODE_PATH="$REPO_ROOT/dev/prod/node_modules${NODE_PATH:+:$NODE_PATH}"
  log "starting webpack on http://localhost:$HOST_PORT, proxy target $STAND_URL"
  exec pnpm run dev-server
fi

# ------------------------------------------------------------ container mode --
have docker || die "Docker is required for the dev front container.
  Start Docker Desktop, or run host-local instead: pnpm -w stand:dev:front:host"
docker info >/dev/null 2>&1 || die "Docker daemon is not reachable.
  Start Docker Desktop, or run host-local instead: pnpm -w stand:dev:front:host"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  die "container $CONTAINER is already running on http://localhost:$HOST_PORT
  stop it first: pnpm -w stand:dev:front:down"
fi
if lsof -nP -iTCP:"$HOST_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "host port $HOST_PORT is busy; free it or use another: PORT=<port> pnpm -w stand:dev:front"
fi

if [ ! -f "$K8S_DIR/docker/dev-front.Dockerfile" ]; then
  die "Dockerfile not found: $K8S_DIR/docker/dev-front.Dockerfile"
fi
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  log "building image $IMAGE (first build takes a while; pnpm install inside)"
  docker build -f "$K8S_DIR/docker/dev-front.Dockerfile" -t "$IMAGE" "$REPO_ROOT"
fi

log "starting container $CONTAINER: http://localhost:$HOST_PORT -> :8080, proxy target $STAND_URL"
log "sources are bind-mounted (HMR on save); stop: Ctrl+C or 'pnpm -w stand:dev:front:down'"
exec docker run --rm --name "$CONTAINER" \
  -p "127.0.0.1:$HOST_PORT:8080" \
  -v "$REPO_ROOT:/repo" \
  -v "$NODE_MODULES_VOLUME:/repo/node_modules" \
  -v "$STAND_CONFIG_FILE:/run/stand-config.json:ro" \
  -v "$STAND_BRANDING_FILE:/run/stand-branding.json:ro" \
  -v "$CA_PEM:/run/mkcert-rootCA.pem:ro" \
  --add-host "$HOST:host-gateway" \
  -e STAND_CONFIG_FILE=/run/stand-config.json \
  -e STAND_BRANDING_FILE=/run/stand-branding.json \
  -e STAND_URL="$STAND_URL" \
  ${NODE_OPTIONS:+-e NODE_OPTIONS="$NODE_OPTIONS"} \
  -e NODE_EXTRA_CA_CERTS=/run/mkcert-rootCA.pem \
  -e PORT=8080 \
  -w /repo/dev/prod \
  "$IMAGE" bash -lc '
    lock="$(sha256sum /repo/pnpm-lock.yaml | cut -d" " -f1)"
    if [ "$(cat /repo/node_modules/.fusion-front-lock 2>/dev/null)" != "$lock" ]; then
      echo ">> lockfile changed or first run, running pnpm install inside container"
      pnpm install --frozen-lockfile --prefer-offline || exit 1
      echo "$lock" > /repo/node_modules/.fusion-front-lock
    fi
    exec pnpm run dev-server
  '
