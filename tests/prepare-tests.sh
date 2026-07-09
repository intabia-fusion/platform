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

echo "Running migrations for Postgres..."
docker compose -f docker-compose.yaml -p sanity run --rm -e DB_URL=postgres://postgres:postgres@postgres:5433/postgres db-migrator

echo "Running migrations for CockroachDB..."
docker compose -f docker-compose.yaml -p sanity run --rm -e DB_URL=postgresql://root@cockroach:26257/defaultdb?sslmode=disable db-migrator

./wait-elastic.sh 9201
