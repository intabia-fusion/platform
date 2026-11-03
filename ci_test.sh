#!/bin/bash

set -eo pipefail

export project_dir
project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

# Kubernetes tools (k3d/kubectl/helm/mkcert) for the api-tests stand; also puts them on PATH
# for the jest suites, which drive the stand through the repo's stand scripts.
source ./common/scripts/ci-k8s-tools.sh

# The api stand deploys into the configured namespace; explicit env wins over the saved config.
export STAND_NAMESPACE="${STAND_NAMESPACE:-fusion-api}"
pnpm -w stand:configure --runtime "${STAND_RUNTIME:-k3d}" --namespace "$STAND_NAMESPACE" --yes

# Only our own stand is torn down, and only when asked: none (default, right for one-shot CI
# VMs), stand (namespace), cluster (the local k3d/kind cluster - shared runners set this).
trap 'STAND_CLEANUP=${STAND_CLEANUP:-none} ./common/scripts/ci-k8s-cleanup.sh api' EXIT

pnpm install --frozen-lockfile

# api-tests and backup-tests against their own stand, built from the bundles on disk (`pnpm bundle`
# ran before this) and pushed into the local cluster registry by the stand scripts. Every pod runs
# under NODE_V8_COVERAGE, so the stand run also yields coverage of the server code the tests drove.
# The api-tests start the stand and leave it for the backup-tests, which take it down.
./common/scripts/docker-api.sh
pnpm build --to @hcengineering/api-tests --to @hcengineering/backup-tests
# docker_build.sh tags without a registry; with one set, the cluster would look for images nobody
# built locally (the published sha-tagged ones live in the registry, not in this job's Docker).
export DOCKER_REGISTRY=
export STAND_COVERAGE=true
rm -rf "${project_dir}/api-tests/coverage"
logs="${project_dir}/api-tests/logs"
mkdir -p "$logs"

# Reports and coverage must survive a failing test run.
# --silent: the in-process clients' console output was ~6000 of the step's ~8800 lines; failures
# are printed from the JSON reports at the end.
status=0
cd "${project_dir}/api-tests/api"
API_STAND=keep pnpm run api-test --silent --json --outputFile="$logs/api-tests.json" || status=$?
cd "${project_dir}/api-tests/backup"
API_STAND=stop pnpm run backup-test --silent --json --outputFile="$logs/backup-tests.json" || status=$?

cd "${project_dir}"
# No profiles when the stand never came up; the jest groups still run and report without it.
# Requires the K8s stand support in the api-tests (STAND_COVERAGE profile collection).
stand=--stand
pnpm coverage:stand || { status=1; stand=; }

# Unit + integration (*.itest.ts) under istanbul, with the stand run folded in, into coverage/.
# Also the gate for both jest groups, and the last line is what GitLab's `coverage:` regex reads.
# The integration suites start their own containers, so no service url is exported - an exported
# one would be used instead of a container.
pnpm coverage --integration ${stand} || status=$?

# Kubernetes diagnostics for the api stand namespace (replaces the compose docker logs).
./common/scripts/k8s-stand-logs.sh api "${project_dir}/api-tests/logs" || true

# The api reports scroll far above by now.
echo
echo "=== api-tests / backup-tests ==="
node ./common/scripts/jest-failures.js "$logs/api-tests.json" "$logs/backup-tests.json"

exit $status
