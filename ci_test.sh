#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"
echo "DB_URL: $DB_URL"
echo "ELASTIC_URL: $ELASTIC_URL"

pnpm install --frozen-lockfile

cd ./tests
./prepare-tests.sh

cd ${project_dir}

# Unit group only (*.test.ts / *.spec.ts): no service needed, and it fails fast with a per-package
# report. The coverage run below repeats it together with the integration group.
pnpm test --verbose

# Unit + integration (*.itest.ts) under istanbul, into coverage/. Also the gate for the
# integration group, and the last line is what the job's `coverage:` regex reads.
pnpm coverage --integration
