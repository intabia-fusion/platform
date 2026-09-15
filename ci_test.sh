#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"
echo "DB_URL: $DB_URL"
echo "ELASTIC_URL: $ELASTIC_URL"
echo "MONGO_URL: $MONGO_URL"

pnpm install --frozen-lockfile

cd ./tests
./prepare-tests.sh

cd ${project_dir}
pnpm test --verbose