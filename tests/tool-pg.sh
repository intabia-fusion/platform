#!/usr/bin/env bash
# Runs the platform tool against the stand that is actually up:
#   k8s     - inside the stand-tool pod of the Kubernetes sanity stand
#   compose - on the host, through the local bundle, against localhost:8083
#
#   ./tool-pg.sh sync-indexes indexes.yaml --apply
#
# tool_backend answers which backend to use; it is a plain function, so the choice can be
# checked without running the tool.
tool_backend() {
    local lib
    lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../deployment/kubernetes/scripts/lib.sh"
    command -v kubectl >/dev/null 2>&1 || { echo compose; return 0; }
    [ -f "$lib" ] || { echo compose; return 0; }
    # The lib exits on an unknown runtime and set -e aborts it on a missing values file; an
    # unreachable cluster fails the kubectl call below. Every one of those means "compose",
    # never a failure here, so the whole k8s probe runs in a subshell.
    if ( set +eu
         # shellcheck source=../deployment/kubernetes/scripts/lib.sh
         source "$lib" >/dev/null 2>&1
         ns="$(stand_namespace sanity 2>/dev/null)" || exit 1
         [ -n "$ns" ] || exit 1
         phase="$(kubectl --context "$KUBE_CONTEXT" -n "$ns" --request-timeout=5s \
             get pod stand-tool -o jsonpath='{.status.phase}' 2>/dev/null)" || exit 1
         [ "$phase" = Running ] ); then
        echo k8s
    else
        echo compose
    fi
}

if [ "$(tool_backend)" = k8s ]; then
    set -euo pipefail

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # shellcheck source=../deployment/kubernetes/scripts/lib.sh
    source "$SCRIPT_DIR/../deployment/kubernetes/scripts/lib.sh"

    MODEL_VERSION="$(node "$REPO_ROOT/common/scripts/show_version.js")"
    export MODEL_VERSION

    SANITY_NS="$(stand_namespace sanity)"
    SANITY_HOST="$(stand_host sanity)"
    SANITY_DATA="$(stand_data sanity)"
    STAND_PORT="$(published_https_port)"
    STAND_URL="https://${SANITY_HOST}:${STAND_PORT}"
    WS_URL="wss://${SANITY_HOST}:${STAND_PORT}"
    DB_URL="postgresql://postgres:postgres@postgres.${BASE_NAMESPACE}.svc.cluster.local:5432/${SANITY_DATA}?sslmode=disable"
    REGION_CONFIG_JSON="{\"regions\":{\"\":{\"transactors\":[{\"external\":\"${WS_URL}/_tr0\",\"internal\":\"${WS_URL}/_tr0\"}],\"collaborators\":[{\"external\":\"${WS_URL}/_cl0\",\"internal\":\"${WS_URL}/_cl0\"}]}}}"

    if ! kc -n "$SANITY_NS" get pod stand-tool >/dev/null 2>&1; then
        echo "stand-tool pod not found in namespace $SANITY_NS (context $KUBE_CONTEXT)" >&2
        echo "run first: cd tests && ./prepare-pg.sh" >&2
        exit 1
    fi

    ARGS=("$@")
    ARGS=("${ARGS[@]/indexes.yaml//workspace/tests/indexes.yaml}")
    kc -n "$SANITY_NS" exec stand-tool -- env \
        MODEL_VERSION="$MODEL_VERSION" \
        STORAGE_CONFIG="datalake|${STAND_URL}/_datalake" \
        ACCOUNTS_URL="${STAND_URL}/_account" \
        PLATFORM_URL="${STAND_URL}" \
        REGION_CONFIG_JSON="$REGION_CONFIG_JSON" \
        ACCOUNT_DB_URL="$DB_URL" \
        SERVER_SECRET=secret \
        DB_URL="$DB_URL" \
        QUEUE_CONFIG="my-cluster-kafka-bootstrap.${BASE_NAMESPACE}.svc.cluster.local:9092;-${SANITY_DATA}" \
        ELASTIC_URL="http://elastic.${BASE_NAMESPACE}.svc.cluster.local:9200" \
        node ${TOOL_OPTIONS:-} /workspace/dev/tool/bundle/bundle.js "${ARGS[@]}"
    exit 0
fi

export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export STORAGE_CONFIG="datalake|http://localhost:8083/_datalake"
export ACCOUNTS_URL=http://localhost:8083/_account
export PLATFORM_URL=http://localhost:8083
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:8083/_tr0","internal":"ws://localhost:8083/_tr0"}],"collaborators":[{"external":"ws://localhost:8083/_cl0","internal":"ws://localhost:8083/_cl0"}]}}}'
export ACCOUNT_DB_URL=postgresql://postgres:postgres@localhost:6433/postgres
export SERVER_SECRET=secret
export DB_URL=postgresql://postgres:postgres@localhost:6433/postgres
export QUEUE_CONFIG='localhost:19093;-staging'

BUNDLE_PATH="../dev/tool/bundle/bundle.js"
if [ -f "./bundle.js" ]; then
  BUNDLE_PATH="./bundle.js"
fi
node ${TOOL_OPTIONS} ${BUNDLE_PATH} "$@"
