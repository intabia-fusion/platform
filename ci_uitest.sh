#!/bin/bash

set -eo pipefail

# Job variables (from .gitlab-ci.yml / .github/workflows), see below. stand: sanity|ws|api|qms,
# empty = compose stand; stand_backend (k8s|compose) defaults from `stand`.
export project_dir
project_dir=$(pwd)
stand_backend="${STAND_BACKEND:-${stand:+k8s}}"
stand_backend="${stand_backend:-compose}"
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"
: "${test_folder:?test_folder is not set}"
: "${prepare_script:?prepare_script is not set}"
: "${build_package:?build_package is not set}"
echo "test_folder: $test_folder"
echo "prepare_script: $prepare_script"
echo "build_package: $build_package"
echo "enable_profiling: ${enable_profiling:-false}"
echo "stand: ${stand:-<compose>}"
echo "stand_backend: $stand_backend"

if [ "$stand_backend" = "k8s" ]; then
    if [ -z "${stand}" ]; then
        echo "STAND_BACKEND=k8s requires a stand name (sanity|ws|api|qms)" >&2
        exit 2
    fi
    # Kubernetes tools (k3d/kubectl/helm/mkcert), no sudo: see ci-k8s-tools.sh.
    source ./common/scripts/ci-k8s-tools.sh

    # Published images are pulled from the registry, nothing is built or pushed here. Address:
    # <STAND_IMAGE_REGISTRY>/<STAND_IMAGE_NAMESPACE>/<name>:<STAND_VERSION>; explicit STAND_IMAGE_* wins.
    export STAND_VERSION="${STAND_VERSION:-${CI_COMMIT_SHA:-latest}}"
    export STAND_IMAGE_REGISTRY="${STAND_IMAGE_REGISTRY:-${DOCKER_REGISTRY:-}}"
    export STAND_IMAGE_NAMESPACE="${STAND_IMAGE_NAMESPACE:-${DOCKER_NAMESPACE:-intabiafusion}}"
    export STAND_PUSH_IMAGES=0
    # Optional imagePullSecret for a private pull registry, from the GitLab registry credentials.
    # Never printed; empty credentials are unset rather than exported empty.
    export STAND_REGISTRY_USERNAME="${STAND_REGISTRY_USERNAME:-${CICD_DOCKER_REGISTRY_USER_PULL:-${CICD_DOCKER_REGISTRY_USER_PUSH:-}}}"
    export STAND_REGISTRY_PASSWORD="${STAND_REGISTRY_PASSWORD:-${CICD_DOCKER_REGISTRY_PASSWORD_PULL:-${CICD_DOCKER_REGISTRY_PASSWORD_PUSH:-}}}"
    export STAND_REGISTRY_SERVER="${STAND_REGISTRY_SERVER:-${CICD_DOCKER_REGISTRY_URL:-}}"
    [ -n "$STAND_REGISTRY_USERNAME" ] || unset STAND_REGISTRY_USERNAME
    [ -n "$STAND_REGISTRY_PASSWORD" ] || unset STAND_REGISTRY_PASSWORD
    [ -n "$STAND_REGISTRY_SERVER" ] || unset STAND_REGISTRY_SERVER
    export STAND_NAMESPACE="${STAND_NAMESPACE:-fusion-${stand}}"
    pnpm -w stand:configure --runtime "${STAND_RUNTIME:-k3d}" --namespace "$STAND_NAMESPACE" --no-push-images --yes

    # Only our own stand: none (default, one-shot VMs), stand (namespace + LiveKit),
    # cluster (also the local k3d/kind cluster - shared runners set this).
    trap 'if [ -f /tmp/stand-front.pid ]; then kill "$(cat /tmp/stand-front.pid)" 2>/dev/null || true; fi; STAND_CLEANUP=${STAND_CLEANUP:-stand} ./common/scripts/ci-k8s-cleanup.sh "${stand}"' EXIT
else
    # Compose stands (cockroach): only this job's own containers are stopped, not
    # everything on the host - a neighbor job may hold a Kubernetes stand in k3d containers.
    trap 'docker ps -q --filter name=^/sanity- --filter name=^/qms- --filter name=^/sanity-livekit- | xargs -r docker stop >/dev/null 2>&1 || true' EXIT
fi

pnpm install --frozen-lockfile

if [ "$stand_backend" = "k8s" ]; then
    export LIVEKIT_MODE="${LIVEKIT_MODE:-docker}"
    cd "${project_dir}/${test_folder}"
    ${prepare_script}

    cd "${project_dir}"
    # Webpack dev-server on :8081, which uitest:k8s runs the browser against; it proxies to the
    # stand with the mkcert CA. qms has its own wrapper: stand:test:front whitelists sanity|ws|api.
    pnpm build --to @hcengineering/prod --esbuild-emit
    front_port="${STAND_FRONT_PORT:-8081}"
    if [ "${stand}" = qms ]; then
        "${project_dir}/qms-tests/stand-front.sh" > /tmp/stand-front.log 2>&1 &
    else
        pnpm -w stand:test:front "${stand}" > /tmp/stand-front.log 2>&1 &
    fi
    echo $! > /tmp/stand-front.pid
    for _ in $(seq 1 60); do
        if curl -fsS "http://localhost:${front_port}/" >/dev/null 2>&1; then break; fi
        sleep 5
    done
    if ! curl -fsS "http://localhost:${front_port}/" >/dev/null 2>&1; then
        echo "stand front proxy did not come up on :${front_port}; log follows" >&2
        cat /tmp/stand-front.log >&2 || true
        exit 1
    fi
else
    # Stand images are pulled from the registry by DOCKER_TAG, so any runner can host a suite.
    export LIVEKIT_MODE="docker"
    export STAND_CLEAN_OTHERS="true"
    cd "${project_dir}/${test_folder}"
    ${prepare_script}
fi

cd "${project_dir}"
pnpm build --to ${build_package}

cd "${project_dir}/${test_folder}/sanity"
# `playwright install --with-deps` shells out to sudo apt-get; without passwordless sudo the suite
# still runs if the chromium system libs are installed.
if sudo -n true 2>/dev/null; then
  pnpm run playwright:install
else
  echo "No passwordless sudo on $(hostname) - installing chromium without system deps"
  pnpm exec playwright install chromium
fi

if [[ "${enable_profiling}" == "true" ]]; then
    cd "${project_dir}/${test_folder}"
    ./profile-start.sh
fi

# Logs and reports must survive a failing test run.
uitest_status=0
cd "${project_dir}/${test_folder}/sanity"
if [ "$stand_backend" = "k8s" ]; then
    pnpm run uitest:k8s || uitest_status=$?
else
    pnpm run uitest || uitest_status=$?
fi

if [[ "${enable_profiling}" == "true" ]]; then
    cd "${project_dir}/${test_folder}"
    ./profile-download.sh
    ./profile-generate.sh
fi

cd "${project_dir}/${test_folder}/sanity"
mkdir -p logs
if [ "$stand_backend" = "k8s" ]; then
    "${project_dir}/common/scripts/k8s-stand-logs.sh" "${stand}" logs || true
else
    # Only this project's compose containers - never a neighbor job's k3d cluster containers.
    docker ps -a --format '{{.Names}}' \
      | grep -E '^(sanity|qms|sanity-livekit)-' \
      | xargs -r -I {} sh -c 'docker logs {} > logs/{}_logs.log 2>&1' || true
fi

if [[ -f playwright-report.json ]]; then
    node "${project_dir}/tests/sanity/analyze_failures.js" playwright-report.json || true
fi
if [[ -f step-report.ndjson ]]; then
    node "${project_dir}/tests/sanity/analyze_steps.js" step-report.ndjson --top 20 || true
fi

exit $uitest_status
