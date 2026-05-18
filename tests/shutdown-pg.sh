#!/usr/bin/env bash

# Tear down sanity test stand: LiveKit (host) + docker compose stack.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVEKIT_DIR="$SCRIPT_DIR/.livekit"
LIVEKIT_PID="$LIVEKIT_DIR/livekit.pid"

# Stop LiveKit by pid file, port and process-name match.
if [ -f "$LIVEKIT_PID" ]; then
    PID=$(cat "$LIVEKIT_PID" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Stopping LiveKit by pid file (pid=$PID)..."
        kill "$PID" 2>/dev/null || true
    fi
    rm -f "$LIVEKIT_PID"
fi

PORT_PIDS=$(lsof -tiTCP:7890 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PORT_PIDS" ]; then
    echo "Stopping LiveKit on port 7890 (pids=$PORT_PIDS)..."
    echo "$PORT_PIDS" | xargs kill 2>/dev/null || true
fi

CFG_PIDS=$(pgrep -f "livekit-test-config.yaml" 2>/dev/null || true)
if [ -n "$CFG_PIDS" ]; then
    echo "Stopping livekit-server bound to test config (pids=$CFG_PIDS)..."
    echo "$CFG_PIDS" | xargs kill 2>/dev/null || true
fi

sleep 1
LEFTOVER=$(lsof -tiTCP:7890 -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$LEFTOVER" ]; then
    echo "Force-killing LiveKit leftovers (pids=$LEFTOVER)..."
    echo "$LEFTOVER" | xargs kill -9 2>/dev/null || true
fi

# Determine compose files (must match prepare-pg.sh).
if [ -f "$SCRIPT_DIR/docker-compose.override.versions.yml" ]; then
    COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml -f docker-compose.override.versions.yml"
else
    COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml"
fi

cd "$SCRIPT_DIR"
docker compose ${COMPOSE_FILES} -p sanity kill
docker compose ${COMPOSE_FILES} -p sanity down --volumes --remove-orphans

# Stop LiveKit docker (CI/Linux) if it was started.
docker compose -f docker-compose.livekit.yaml -p sanity-livekit down --remove-orphans 2>/dev/null || true
