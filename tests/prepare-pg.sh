#!/usr/bin/env bash

# Reset and seed the sanity stand on the cluster configured by pnpm -w stand:configure.
# --reuse (what dotest.sh uses) keeps the chart, wipes data and restarts pods.

set -e

# prepare-sanity-k3s.sh below overwrites SCRIPT_DIR, so the lock uses its own variable.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# One prepare at a time: a second run drops the database and Kafka topics under a live
# suite and looks like a mass test failure, so refuse it.
LOCK_DIR="$HERE/.prepare.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    HOLDER=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
    if [ -n "$HOLDER" ] && kill -0 "$HOLDER" 2>/dev/null; then
        echo "ERROR: another prepare is running (pid $HOLDER); refusing to wipe the stand" >&2
        exit 1
    fi
    rm -rf "$LOCK_DIR"
    mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

STAND_REUSE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --reuse) STAND_REUSE=1; shift ;;
        *) echo "usage: ./prepare-pg.sh [--reuse]" >&2; exit 1 ;;
    esac
done
export STAND_REUSE

# prepare-sanity-k3s.sh exports STAND_HTTPS_PORT for the LiveKit block below.
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

# Stop previous host instance — by pid file, by port, and by process name. In cluster mode this
# also clears a server left from an older stand configuration: its ports would clash with the
# published k3d mappings.
if [ -f "$LIVEKIT_PID" ]; then
    OLD_PID=$(cat "$LIVEKIT_PID" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Stopping previous LiveKit by pid file (pid=$OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$LIVEKIT_PID"
fi

# Host livekit-server PIDs on the test port. The stale k3d port mapping on an old cluster answers
# there too (docker-proxy), and that process is not ours to kill.
livekit_server_pids() {
    local pid
    # docker-proxy from a stale k3d 7890 mapping answers here too; only a host server is ours.
    for pid in $(lsof -tiTCP:7890 -sTCP:LISTEN 2>/dev/null || true); do
        if ps -p "$pid" -o command= 2>/dev/null | grep -q "livekit-server"; then
            echo "$pid"
        fi
    done
    return 0
}

# Kill a host instance left on the test LiveKit port (covers manually-started ones).
PORT_PIDS=$(livekit_server_pids)
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

# Wait for graceful exit, then SIGKILL a livekit-server still on the port.
sleep 1
LEFTOVER=$(livekit_server_pids)
if [ -n "$LEFTOVER" ]; then
    echo "Force-killing LiveKit leftovers (pids=$LEFTOVER)..."
    echo "$LEFTOVER" | xargs kill -9 2>/dev/null || true
fi

# LiveKit lives either in platform-base (the one shared server for every k3d stand: RTC ports are
# published by the cluster) or on the host. The cluster one is the default when installed; the host
# one is the fallback for kind/existing (kind cannot add the RTC mappings after creation).
# LIVEKIT_MODE=cluster|docker|local overrides the detection.
LIVEKIT_MODE="${LIVEKIT_MODE:-auto}"
if [ "$LIVEKIT_MODE" = "auto" ]; then
    if kc -n "$BASE_NAMESPACE" get deployment livekit >/dev/null 2>&1; then
        LIVEKIT_MODE=cluster
    else
        case "$(uname -s)" in
            Linux) LIVEKIT_MODE=docker ;;
            *)     LIVEKIT_MODE=local ;;
        esac
    fi
fi

if [ "$LIVEKIT_MODE" = "cluster" ]; then
    echo "LiveKit runs in platform-base; nothing to start on the host"
elif [ "$LIVEKIT_MODE" = "docker" ]; then
    echo "Starting LiveKit in docker (host network)..."
    docker compose -f docker-compose.livekit.yaml -p sanity-livekit down --remove-orphans 2>/dev/null || true
    docker compose -f docker-compose.livekit.yaml -p sanity-livekit up -d --force-recreate
elif command -v livekit-server >/dev/null 2>&1; then
    # A host server posts its webhooks through Traefik and stays a single node: no redis, so
    # StartEgress is refused - that is what the in-cluster scheme exists for.
    export LIVEKIT_WEBHOOK_URL="https://$(stand_host sanity):${STAND_HTTPS_PORT}/_love/webhook"
    export LIVEKIT_REDIS_ADDRESS=
    echo "Starting LiveKit (log: $LIVEKIT_LOG)..."
    nohup "$SCRIPT_DIR/run_livekit_test.sh" >"$LIVEKIT_LOG" 2>&1 &
    echo $! > "$LIVEKIT_PID"
    echo "LiveKit pid=$(cat "$LIVEKIT_PID")"
else
    echo "WARNING: livekit-server not installed; skipping LiveKit startup"
fi

# A LiveKit that is down (port taken, bad config, missing k3d mapping) would only show up as
# meeting timeouts; fail here with the log tail.
if [ "$LIVEKIT_MODE" = "cluster" ]; then
    livekit_up=0
    for _ in $(seq 1 40); do
        if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:7880/ 2>/dev/null; then livekit_up=1; break; fi
        sleep 1
    done
    if [ "$livekit_up" != 1 ]; then
        echo "ERROR: LiveKit does not answer on http://127.0.0.1:7880 (published k3d port)" >&2
        echo "       the cluster needs the RTC mappings: pnpm -w stand:base:up (or the k3d port-add in k3d.yaml)" >&2
        kc -n "$BASE_NAMESPACE" logs -l app=livekit --tail=30 2>&1 | tail -30 >&2 || true
        exit 1
    fi
    echo "LiveKit is up on http://127.0.0.1:7880"

    # Egress listens for jobs over the server's redis; recording tests fail without it.
    if kc -n "$BASE_NAMESPACE" get deployment livekit-egress >/dev/null 2>&1; then
        if ! kc -n "$BASE_NAMESPACE" rollout status deployment/livekit-egress \
            --timeout=120s >/dev/null 2>&1; then
            echo "ERROR: livekit-egress did not become ready; /startRecord would answer 500" >&2
            kc -n "$BASE_NAMESPACE" logs -l app=livekit-egress --tail=40 2>&1 | tail -40 >&2 || true
            exit 1
        fi
        echo "LiveKit egress is ready"
    fi
elif [ "$LIVEKIT_MODE" = "docker" ] || command -v livekit-server >/dev/null 2>&1; then
    livekit_up=0
    for _ in $(seq 1 40); do
        if lsof -tiTCP:7890 -sTCP:LISTEN >/dev/null 2>&1; then livekit_up=1; break; fi
        sleep 0.5
    done
    if [ "$livekit_up" != 1 ]; then
        echo "ERROR: LiveKit did not listen on :7890; love/meetings tests would fail" >&2
        tail -30 "$LIVEKIT_LOG" >&2 2>/dev/null || true
        exit 1
    fi
    echo "LiveKit is up on :7890"
fi

# Prod index set on top of the migrations, so the stand plans queries like prod. Keep indexes.yaml in
# step with migrations: sync only adds, so an index a migration drops comes back if still listed.
./tool-pg.sh sync-indexes indexes.yaml --apply

# The prepare takes minutes; a LiveKit that died meanwhile leaves a green stand and a red Love lane.
if [ "$LIVEKIT_MODE" = "cluster" ]; then
    if ! curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:7880/ 2>/dev/null; then
        echo "WARNING: LiveKit stopped answering during prepare; love/meetings tests will fail" >&2
    fi
elif [ -f "$LIVEKIT_PID" ] && ! kill -0 "$(cat "$LIVEKIT_PID")" 2>/dev/null; then
    echo "WARNING: LiveKit (pid $(cat "$LIVEKIT_PID")) stopped during prepare; love/meetings tests will fail" >&2
fi
