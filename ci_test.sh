#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

pnpm install --frozen-lockfile

# A stand left running recreates its bind mounts as root and breaks the next checkout.
trap 'docker ps -q | xargs -r docker stop >/dev/null 2>&1 || true' EXIT

# api-tests and backup-tests against the ws-tests stand, built from the bundles on disk (`pnpm
# bundle` ran before this). Every pod runs under NODE_V8_COVERAGE, so the stand run also yields
# coverage of the server code the tests drove.
./common/scripts/docker-api.sh
pnpm build --to @hcengineering/api-tests --to @hcengineering/backup-tests
# docker_build.sh tags without a registry; with one set, compose would look for images nobody built.
export DOCKER_REGISTRY=

cd "${project_dir}/ws-tests"
rm -rf coverage
STAND_EXTRA_COMPOSE=docker-compose.coverage.yaml ./prepare.sh

# Reports and coverage must survive a failing test run.
status=0
cd "${project_dir}/ws-tests/api-tests"
STAND_COVERAGE=true pnpm run api-test --verbose || status=$?
cd "${project_dir}/ws-tests/backup-tests"
pnpm run backup-test --verbose || status=$?

cd "${project_dir}/ws-tests"
mkdir -p api-tests/logs
docker ps -a --format '{{.Names}}' | xargs -I {} sh -c 'docker logs {} > api-tests/logs/{}_logs.log 2>&1' || true
# V8 writes a pod's profile as it exits: stop, never down or kill.
docker compose -f docker-compose.yaml -f docker-compose.coverage.yaml -p sanity stop -t 60

cd "${project_dir}"
pnpm coverage:stand

# Unit + integration (*.itest.ts) under istanbul, with the stand run folded in, into coverage/.
# Also the gate for both jest groups, and the last line is what GitLab's `coverage:` regex reads.
# The integration suites start their own containers, so no service url is exported - an exported
# one would be used instead of a container.
pnpm coverage --integration --stand || status=$?

exit $status
