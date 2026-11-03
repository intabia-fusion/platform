#!/usr/bin/env bash

# Reset and seed the sanity stand in the Kubernetes cluster configured through
# pnpm -w stand:configure (kubeconfig/context/namespace). LiveKit runs on the host.
#
#   ./prepare-pg.sh

set -e

if [ $# -gt 0 ]; then
    echo "usage: ./prepare-pg.sh"
    exit 1
fi

# prepare-sanity-k3s.sh exports STAND_HTTPS_PORT/LIVEKIT_* for the local
# LiveKit started below.
source ../deployment/kubernetes/scripts/prepare-sanity-k3s.sh

# The media sanity tests need an mp4 and a docx; generate them with the stand images once the
# stand is up, so nothing is downloaded and no host ffmpeg or libreoffice is needed.
./make-media-fixtures.sh

# Start LiveKit server in background. Writes pid/log to ./.livekit/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVEKIT_DIR="$SCRIPT_DIR/.livekit"
LIVEKIT_PID="$LIVEKIT_DIR/livekit.pid"
LIVEKIT_LOG="$LIVEKIT_DIR/livekit.log"
mkdir -p "$LIVEKIT_DIR"

# Stop previous instance — by pid file, by port, and by process name.
if [ -f "$LIVEKIT_PID" ]; then
    OLD_PID=$(cat "$LIVEKIT_PID" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Stopping previous LiveKit by pid file (pid=$OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$LIVEKIT_PID"
fi

# Kill anything bound to the test LiveKit port (covers manually-started instances).
PORT_PIDS=$(lsof -tiTCP:7890 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
    echo "Stopping LiveKit on port 7890 (pids=$PORT_PIDS)..."
    echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
fi

# Last-resort: kill livekit-server processes that point to our test config.
CFG_PIDS=$(pgrep -f "livekit-test-config.yaml" 2>/dev/null || true)
if [ -n "$CFG_PIDS" ]; then
    echo "Stopping livekit-server bound to test config (pids=$CFG_PIDS)..."
    echo "$CFG_PIDS" | xargs kill 2>/dev/null || true
fi

# Wait for graceful exit, then SIGKILL anything still on the port.
sleep 1
LEFTOVER=$(lsof -tiTCP:7890 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$LEFTOVER" ]; then
    echo "Force-killing LiveKit leftovers (pids=$LEFTOVER)..."
    echo "$LEFTOVER" | xargs kill -9 2>/dev/null || true
fi

# LiveKit: on Linux use docker with host network (works in CI and local Linux).
# On macOS network_mode: host is unsupported, fall back to local livekit-server.
# Override with LIVEKIT_MODE=docker|local.
LIVEKIT_MODE="${LIVEKIT_MODE:-}"
if [ -z "$LIVEKIT_MODE" ]; then
    case "$(uname -s)" in
        Linux) LIVEKIT_MODE=docker ;;
        *)     LIVEKIT_MODE=local ;;
    esac
fi

if [ "$LIVEKIT_MODE" = "docker" ]; then
    echo "Starting LiveKit in docker (host network)..."
    docker compose -f docker-compose.livekit.yaml -p sanity-livekit down --remove-orphans 2>/dev/null || true
    docker compose -f docker-compose.livekit.yaml -p sanity-livekit up -d --force-recreate
elif command -v livekit-server >/dev/null 2>&1; then
    echo "Starting LiveKit (log: $LIVEKIT_LOG)..."
    nohup "$SCRIPT_DIR/run_livekit_test.sh" >"$LIVEKIT_LOG" 2>&1 &
    echo $! > "$LIVEKIT_PID"
    echo "LiveKit pid=$(cat "$LIVEKIT_PID")"
else
    echo "WARNING: livekit-server not installed; skipping LiveKit startup"
fi

# Prod index set on top of the migrations, so the stand plans queries like prod. Keep indexes.yaml in
# step with migrations: sync only adds, so an index a migration drops comes back if still listed.
./tool-pg.sh sync-indexes indexes.yaml --apply
