#!/usr/bin/env bash

COMPOSE_FILES="-f docker-compose.yaml -f docker-compose.cockroach.yaml"

docker compose ${COMPOSE_FILES} -p sanity kill
docker compose ${COMPOSE_FILES} -p sanity down --volumes
docker compose ${COMPOSE_FILES} -p sanity up elastic cockroach postgres redpanda minio -d --force-recreate --renew-anon-volumes
docker_exit=$?
if [ ${docker_exit} -eq 0 ]; then
    echo "Container started successfully"
else
    echo "Container started with errors"
    exit ${docker_exit}
fi

# Database URLs on host side with defaults
DB_PG_URL_HOST="${DB_PG_URL_HOST:-postgresql://root@localhost:26258/defaultdb?sslmode=disable}"
DB_PURE_PG_URL_HOST="${DB_PURE_PG_URL_HOST:-postgresql://postgres:postgres@localhost:5433/postgres}"

echo "Running migrations for Postgres..."
DB_URL="$DB_PURE_PG_URL_HOST" node ../services/db-migrator/lib/index.js

echo "Running migrations for CockroachDB..."
DB_URL="$DB_PG_URL_HOST" node ../services/db-migrator/lib/index.js

./wait-elastic.sh 9201

# Wait for minio to be ready
for i in $(seq 1 30); do
    if curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
        echo "Minio ready"
        break
    fi
    echo "Waiting for minio... ($i)"
    sleep 2
done
curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1 || { echo "Minio did not become ready"; exit 1; }
