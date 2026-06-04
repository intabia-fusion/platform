#!/usr/bin/env bash

# Standalone QMS test stand. Brings up its own docker stack under the `qms`
# compose project (same ports as tests/, so run it only when the tests/ `sanity`
# stand is down) and seeds only the QMS workspaces.

set -a
. ./.env
set +a

COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.purepg.yaml -f docker-compose.pgbouncer.yaml"

docker compose ${COMPOSE_FILES} -p qms kill
docker compose ${COMPOSE_FILES} -p qms down --volumes --remove-orphans
docker compose ${COMPOSE_FILES} -p qms up -d --force-recreate --renew-anon-volumes --remove-orphans

docker_exit=$?
if [ ${docker_exit} -eq 0 ]; then
    echo "Container started successfully"
else
    echo "Container started with errors"
    exit ${docker_exit}
fi

# Wait for pgbouncer to be ready.
echo "Waiting for pgbouncer to be ready..."
PGB_CONTAINER=$(docker compose ${COMPOSE_FILES} -p qms ps -q pgbouncer 2>/dev/null || true)
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
fi

./wait-elastic.sh 9201

# Create user records in accounts.
./tool.sh create-account user1 -f John -l Appleseed -p 1234
./tool.sh create-account user2 -f Kainin -l Dirak -p 1234
./tool.sh create-account user3 -f Cain -l Velasquez -p 1234
./tool.sh create-account user4 -f Armin -l Karmin -p 1234
./tool.sh create-account user_qara -f Qara -l Admin -p 1234
./tool.sh create-account admin -f Super -l User -p 1234

# QMS init workspace (enables all plugins for the QMS template).
./tool.sh create-workspace init-ws-qms email:user1
./tool.sh configure init-ws-qms --enable=*
./tool.sh configure init-ws-qms --list

# QMS test workspace.
./tool.sh create-workspace sanity-ws-qms email:user1

./restore-workspace.sh
rm -rf ./sanity/.auth
