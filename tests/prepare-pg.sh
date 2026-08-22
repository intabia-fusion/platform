#!/usr/bin/env bash

# Check if docker-compose.override.yml exists
# Load env vars from .env (export them), so DB_PURE_PG_HOST and DB_PURE_PG_URL are available
set -a
. ./.env
set +a
# DB connection URLs are read from env files.
# For dev: ../dev/.env; for tests: ./tests/.env
# Set DB_PURE_PG_URL / DB_URL_PG to point to pgbouncer when running the pure-Postgres configuration.
# Do not hardcode URLs here so .env controls which DB backend is used.
# Determine compose files to use
if [ -f "docker-compose.override.versions.yml" ]; then
    COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml -f docker-compose.override.versions.yml"
else
    COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml"
fi

# `restart`: pick up rebuilt images without touching data. Compose recreates only the containers
# whose image or config changed; postgres/minio keep their (anonymous) volumes.
if [[ " $* " == *" restart "* ]]; then
    echo "=== restart: recreating changed containers, data kept ==="
    docker compose ${COMPOSE_FILES} -p sanity up -d --remove-orphans
    # nginx resolves upstream IPs at config load, so recreated containers leave it with stale
    # ones - every proxied call then answers 502 with an HTML body.
    docker compose ${COMPOSE_FILES} -p sanity restart nginx
    # Services sharing nginx's network namespace lose it when nginx restarts: they keep running
    # with no DNS at all. Restart them after, never before.
    NS_SVCS=$(awk '/^  [a-z0-9_-]+:$/{svc=$1} /network_mode:.*service:nginx/{gsub(":","",svc); print svc}' docker-compose.yaml)
    if [ -n "$NS_SVCS" ]; then
        # shellcheck disable=SC2086
        docker compose ${COMPOSE_FILES} -p sanity restart $NS_SVCS
    fi
    echo "Waiting for account service..."
    for i in $(seq 1 90); do
        CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
            -d '{}' http://localhost:8083/_account || true)
        case "$CODE" in 000|502|503|504) sleep 2 ;; *) echo "account is up ($CODE)"; break ;; esac
    done
    # Rebuilt images may carry a newer model - bring our workspaces up to it right here.
    ./tool-pg.sh upgrade-workspace sanity-ws
    ./tool-pg.sh upgrade-workspace meetings-ws
    exit 0
fi

# `restore_bench` / RESTORE_BENCH=1 / BENCH_DUMP=<path>: restore a full snapshot (accounts,
# workspaces, data, blobs) from BENCH_BACKUPS instead of seeding from scratch. Storage comes up
# first so the dump lands in a virgin DB, before db-migrator and account create objects there.
if [[ " $* " == *" restore_bench "* ]] || [ "${RESTORE_BENCH:-}" = "1" ] || [ -n "${BENCH_DUMP:-}" ]; then
    RESTORE_FIRST=1
    UP_SERVICES="postgres pgbouncer minio elastic"
else
    RESTORE_FIRST=0
    UP_SERVICES=""
fi

docker compose ${COMPOSE_FILES} -p sanity kill
docker compose ${COMPOSE_FILES} -p sanity down --volumes --remove-orphans
docker compose ${COMPOSE_FILES} -p sanity up -d --force-recreate --renew-anon-volumes --remove-orphans ${UP_SERVICES}

docker_exit=$?
if [ ${docker_exit} -eq 0 ]; then
    echo "Container started successfully"
else
    echo "Container started with errors"
    exit ${docker_exit}
fi

# Wait for pgbouncer to be ready (container named 'pgbouncer' under project 'sanity')
echo "Waiting for pgbouncer to be ready..."
PGB_CONTAINER=$(docker compose ${COMPOSE_FILES} -p sanity ps -q pgbouncer 2>/dev/null || true)
if [ -n "$PGB_CONTAINER" ]; then
    for i in $(seq 1 60); do
        STATUS_HEALTH=$(docker inspect -f '{{ .State.Health.Status }}' "$PGB_CONTAINER" 2>/dev/null || true)
        STATUS_STATE=$(docker inspect -f '{{ .State.Status }}' "$PGB_CONTAINER" 2>/dev/null || true)
        if [ "$STATUS_HEALTH" = "healthy" ] || [ "$STATUS_STATE" = "running" ]; then
            echo "pgbouncer is ready (status: ${STATUS_HEALTH:-$STATUS_STATE})"
            break
        fi
        sleep 1
    done
else
    echo "pgbouncer container not found in the compose project; determining host:port to wait for..."
    # Default host/port to wait for
    WAIT_HOST=localhost
    WAIT_PORT=6432

    # Prefer an explicit host:port from DB_PURE_PG_HOST if present (format: host[:port])
    if [ -n "$DB_PURE_PG_HOST" ]; then
        if echo "$DB_PURE_PG_HOST" | grep -q ':[0-9][0-9]*'; then
            WAIT_HOST=$(echo "$DB_PURE_PG_HOST" | sed -E 's#^(.*):([0-9]+)$#\1#')
            WAIT_PORT=$(echo "$DB_PURE_PG_HOST" | sed -E 's#^(.*):([0-9]+)$#\2#')
        else
            WAIT_HOST="$DB_PURE_PG_HOST"
        fi
    # Fallback to parsing DB_PURE_PG_URL if provided (e.g. postgresql://user:pass@host:port/db)
    elif [ -n "$DB_PURE_PG_URL" ]; then
        HOSTPORT=$(echo "$DB_PURE_PG_URL" | sed -E 's#^[^:]+://([^@]+@)?([^/]+).*#\2#')
        if echo "$HOSTPORT" | grep -q ':[0-9][0-9]*'; then
            WAIT_HOST=$(echo "$HOSTPORT" | cut -d: -f1)
            WAIT_PORT=$(echo "$HOSTPORT" | cut -d: -f2)
        else
            WAIT_HOST="$HOSTPORT"
        fi
    fi

    echo "Waiting for ${WAIT_HOST}:${WAIT_PORT} to be available..."
    for i in $(seq 1 60); do
        if bash -c ">/dev/tcp/${WAIT_HOST}/${WAIT_PORT}" >/dev/null 2>&1; then
            echo "${WAIT_HOST}:${WAIT_PORT} is listening"
            break
        fi
        sleep 1
    done
fi

if [ "x$DO_CLEAN" == 'xtrue' ]; then
    echo 'Do docker Clean'
    docker system prune -a -f
fi

./wait-elastic.sh 9201

if [ "$RESTORE_FIRST" = "1" ]; then
    BENCH_BACKUPS="${BENCH_BACKUPS:-$HOME/Develop/private/bench-backups}"
    echo "restore_bench ENABLED: ${BENCH_DUMP:-newest in $BENCH_BACKUPS}"
    ../dev/stand-snapshot.sh restore "${BENCH_DUMP:-$BENCH_BACKUPS}"
    BENCH_DUMP=restored
    # No --force-recreate here: it renews the anonymous volumes and drops what we just restored.
    docker compose ${COMPOSE_FILES} -p sanity up -d --remove-orphans
    echo "Waiting for account service..."
    for i in $(seq 1 90); do
        CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
            -d '{}' http://localhost:8083/_account || true)
        case "$CODE" in 000|502|503|504) sleep 2 ;; *) echo "account is up ($CODE)"; break ;; esac
    done
fi
if [ -n "${BENCH_DUMP:-}" ]; then
    # Seed fresh sanity-ws/meetings-ws ON TOP of the restored bench data so functional
    # tests keep their standard workspaces. The snapshot's bench workspaces were renamed
    # away from sanity-ws/meetings-ws, so those names are free; the dump already holds the
    # user accounts, so create-account is a harmless no-op (|| true).
    ./tool-pg.sh create-account user1 -f John -l Appleseed -p 1234 || true
    ./tool-pg.sh create-account user2 -f Kainin -l Dirak -p 1234 || true
    ./tool-pg.sh create-account user3 -f Muffin -l Muram -p 1234 || true
    ./tool-pg.sh create-account user4 -f Armin -l Karmin -p 1234 || true
    ./tool-pg.sh create-account admin -f Super -l User -p 1234 || true
    ./tool-pg.sh create-workspace sanity-ws email:user1 || true
    ./tool-pg.sh create-workspace meetings-ws email:user1 || true
    ./restore-pg.sh || true
    rm -rf ./sanity/.auth
else
# Create user record in accounts
./tool-pg.sh create-account user1 -f John -l Appleseed -p 1234
./tool-pg.sh create-account user2 -f Kainin -l Dirak -p 1234
./tool-pg.sh create-account user3 -f Muffin -l Muram -p 1234
./tool-pg.sh create-account user4 -f Armin -l Karmin -p 1234

./tool-pg.sh create-account admin -f Super -l User -p 1234

# Create workspace records in accounts
./tool-pg.sh create-workspace sanity-ws email:user1
./tool-pg.sh create-workspace meetings-ws email:user1

./restore-pg.sh
rm -rf ./sanity/.auth
fi

# Upgrade ours explicitly: the queue skips workspaces whose last_visit is stale (WS_LIVENESS_DAYS),
# and meetings-ws is never opened through login, so it would never be picked up.
./tool-pg.sh upgrade-workspace sanity-ws
./tool-pg.sh upgrade-workspace meetings-ws


# Apply the deployment index set (composite/expression indexes from the deployment repo)
# so the stand matches production; migration + sync-indexes alone miss them. Best-effort.
INDEXES_YAML="${INDEXES_YAML:-../../deployment/deployments/indexes.yaml}"
if [ -f "$INDEXES_YAML" ]; then
    echo "Applying deployment indexes from $INDEXES_YAML..."
    ./tool-pg.sh apply-indexes "$INDEXES_YAML" --apply || true
else
    echo "WARN: $INDEXES_YAML not found, skipping deployment index apply"
fi

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
