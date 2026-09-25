#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

pnpm install --frozen-lockfile

# A stand left running recreates its bind mounts as root and breaks the next checkout.
trap 'docker ps -q | xargs -r docker stop >/dev/null 2>&1 || true' EXIT

# api-tests and backup-tests against their own stand, built from the bundles on disk (`pnpm bundle`
# ran before this). Every pod runs under NODE_V8_COVERAGE, so the stand run also yields coverage of
# the server code the tests drove. The api-tests start the stand and leave it for the backup-tests,
# which take it down.
./common/scripts/docker-api.sh
pnpm build --to @hcengineering/api-tests --to @hcengineering/backup-tests
# docker_build.sh tags without a registry; with one set, compose would look for images nobody built.
export DOCKER_REGISTRY=
export STAND_COVERAGE=true
rm -rf "${project_dir}/api-tests/coverage"

# Reports and coverage must survive a failing test run.
status=0
cd "${project_dir}/api-tests/api"
API_STAND=keep pnpm run api-test --verbose || status=$?
cd "${project_dir}/api-tests/backup"
API_STAND=stop pnpm run backup-test --verbose || status=$?

cd "${project_dir}"
# No profiles when the stand never came up; the jest groups still run and report without it.
stand=--stand
pnpm coverage:stand || { status=1; stand=; }

# Unit + integration (*.itest.ts) under istanbul, with the stand run folded in, into coverage/.
# Also the gate for both jest groups, and the last line is what GitLab's `coverage:` regex reads.
# The integration suites start their own containers, so no service url is exported - an exported
# one would be used instead of a container.
pnpm coverage --integration ${stand} || status=$?

exit $status
