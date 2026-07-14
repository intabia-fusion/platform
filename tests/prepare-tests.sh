#!/usr/bin/env bash

docker compose -p sanity kill
docker compose -p sanity down --volumes
docker compose -f docker-compose.yaml -p sanity up elastic cockroach postgres redpanda -d --force-recreate --renew-anon-volumes
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
