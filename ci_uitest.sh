#!/bin/bash

set -eo pipefail

# Job variables, mirrors .github/actions/ui-test: test_folder, prepare_script,
# build_package, run_api_tests, run_backup_tests, enable_profiling
export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"
echo "test_folder: $test_folder"
echo "prepare_script: $prepare_script"
echo "build_package: $build_package"
echo "run_api_tests: ${run_api_tests:-false}"
echo "run_backup_tests: ${run_backup_tests:-false}"
echo "enable_profiling: ${enable_profiling:-false}"

pnpm install --frozen-lockfile

# Stand images are pulled from the registry by DOCKER_TAG, so any runner can host a suite.
export LIVEKIT_MODE="docker"
cd "${project_dir}/${test_folder}"
${prepare_script}

cd "${project_dir}"
pnpm build --to ${build_package}

cd "${project_dir}/${test_folder}/sanity"
# `playwright install --with-deps` shells out to sudo apt-get. A runner without passwordless
# sudo can still run the suite as long as the chromium system libs are already installed.
if sudo -n true 2>/dev/null; then
  pnpm run ci
else
  echo "No passwordless sudo on $(hostname) - installing chromium without system deps"
  pnpm exec playwright install chromium
fi

if [[ "${run_api_tests}" == "true" ]]; then
    cd "${project_dir}"
    pnpm build --to @hcengineering/api-tests
    cd "${project_dir}/${test_folder}/api-tests"
    pnpm run api-test --verbose
fi

if [[ "${run_backup_tests}" == "true" ]]; then
    cd "${project_dir}"
    pnpm build --to @hcengineering/backup-tests
    cd "${project_dir}/${test_folder}/backup-tests"
    pnpm run backup-test --verbose
fi

if [[ "${enable_profiling}" == "true" ]]; then
    cd "${project_dir}/${test_folder}"
    ./profile-start.sh
fi

# Logs and reports must survive a failing test run.
uitest_status=0
cd "${project_dir}/${test_folder}/sanity"
pnpm run uitest || uitest_status=$?

if [[ "${enable_profiling}" == "true" ]]; then
    cd "${project_dir}/${test_folder}"
    ./profile-download.sh
    ./profile-generate.sh
fi

cd "${project_dir}/${test_folder}/sanity"
mkdir -p logs
docker ps -a --format '{{.Names}}' | xargs -I {} sh -c 'docker logs {} > logs/{}_logs.log 2>&1' || true

if [[ -f playwright-report.json ]]; then
    node "${project_dir}/tests/sanity/analyze_failures.js" playwright-report.json || true
fi
if [[ -f step-report.ndjson ]]; then
    node "${project_dir}/tests/sanity/analyze_steps.js" step-report.ndjson --top 20 || true
fi

# Under the stand lock, unlike after_script.
docker ps -q | xargs -r docker stop || true

exit $uitest_status
