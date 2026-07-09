#!/usr/bin/env bash



# Check if docker-compose.override.yml exists
if [ -f "docker-compose.override.yml" ]; then
    echo "Using docker-compose.override.yml"
    docker compose -p sanity -f docker-compose.yaml -f docker-compose.override.yml kill
    docker compose -p sanity -f docker-compose.yaml -f docker-compose.override.yml down --volumes --remove-orphans
    docker compose -p sanity -f docker-compose.yaml -f docker-compose.override.yml up -d --force-recreate --renew-anon-volumes --remove-orphans
else
    docker compose -p sanity kill
    docker compose -p sanity down --volumes --remove-orphans
    docker compose -p sanity up -d --force-recreate --renew-anon-volumes --remove-orphans
fi
docker_exit=$?
if [ ${docker_exit} -eq 0 ]; then
    echo "Container started successfully"
else
    echo "Container started with errors"
    exit ${docker_exit}
fi

if [ "x$DO_CLEAN" == 'xtrue' ]; then
    echo 'Do docker Clean'
    docker system prune -a -f
fi

echo "Running migrations for Postgres..."
DB_URL="postgresql://postgres:postgres@localhost:5433/postgres" node ../services/db-migrator/lib/index.js

echo "Running migrations for CockroachDB..."
DB_URL="postgresql://root@localhost:26258/defaultdb?sslmode=disable" node ../services/db-migrator/lib/index.js

./wait-elastic.sh 9201

echo "Creating user accounts..."
./tool.sh create-account admin -f Super -l Admin -p 1234
./tool.sh create-account user1 -f John -l Appleseed -p 1234
./tool.sh create-account user2 -f Kainin -l Dirak -p 1234
./tool.sh create-account user3 -f Muffin -l Muram -p 1234

echo "Creating workspace api-tests..."
./tool.sh create-workspace api-tests email:user1

./tool.sh create-workspace api-tests-fail email:user3

echo "Creating workspace api-tests-cr..."
./tool-europe.sh create-workspace api-tests-cr email:user1 --region 'europe'

echo "Assigning users to workspaces..."
./tool.sh assign-workspace user1 api-tests
./tool.sh assign-workspace user1 api-tests-cr
# user2 is needed by love-flow tests (caller/recipient pair) so they both
# have PersonSpace + Employee in the same api-tests workspace.
./tool.sh assign-workspace user2 api-tests
./tool.sh assign-workspace user3 api-tests-fail

rm -rf ./sanity/.auth
