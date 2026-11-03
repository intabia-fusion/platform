#!/bin/bash

set -eo pipefail

export project_dir
project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

# k3d/kubectl/helm/mkcert for the api-tests stand; also puts them on PATH for the jest suites.
source ./common/scripts/ci-k8s-tools.sh

# The api stand deploys into the configured namespace; explicit env wins over the saved config.
export STAND_NAMESPACE="${STAND_NAMESPACE:-fusion-api}"
pnpm -w stand:configure --runtime "${STAND_RUNTIME:-k3d}" --namespace "$STAND_NAMESPACE" --yes

# Only our own stand: none (default, one-shot VMs), stand (namespace), cluster (shared runners).
trap 'STAND_CLEANUP=${STAND_CLEANUP:-none} ./common/scripts/ci-k8s-cleanup.sh api' EXIT

pnpm install --frozen-lockfile

# api-tests and backup-tests on their own stand, built from the bundles on disk (`pnpm bundle`
# ran before this). Pods run under NODE_V8_COVERAGE, so the run yields server coverage too.
./common/scripts/docker-api.sh
pnpm build --to @hcengineering/api-tests --to @hcengineering/backup-tests
# With a registry set the cluster looks for images nobody built locally (the sha-tagged ones
# live in the registry, not in this job's Docker).
export DOCKER_REGISTRY=
export STAND_COVERAGE=true
rm -rf "${project_dir}/api-tests/coverage"
logs="${project_dir}/api-tests/logs"
mkdir -p "$logs"

# Reports must survive a failing run. --silent: client console output was ~6000 of ~8800 step lines.
status=0
cd "${project_dir}/api-tests/api"
API_STAND=keep pnpm run api-test --silent --json --outputFile="$logs/api-tests.json" || status=$?
cd "${project_dir}/api-tests/backup"
API_STAND=stop pnpm run backup-test --silent --json --outputFile="$logs/backup-tests.json" || status=$?

cd "${project_dir}"
# No profiles when the stand never came up; the jest groups still run and report without it.
stand=--stand
pnpm coverage:stand || { status=1; stand=; }

# Unit + integration (*.itest.ts) under istanbul, with the stand run folded in. The last line is
# what GitLab's `coverage:` regex reads; integration suites start their own containers.
pnpm coverage --integration ${stand} || status=$?

# Kubernetes diagnostics for the api stand namespace.
./common/scripts/k8s-stand-logs.sh api "${project_dir}/api-tests/logs" || true

# The api reports scroll far above by now.
echo
echo "=== api-tests / backup-tests ==="
node ./common/scripts/jest-failures.js "$logs/api-tests.json" "$logs/backup-tests.json"

exit $status
