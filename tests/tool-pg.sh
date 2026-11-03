#!/usr/bin/env bash
# Runs the platform tool (dev/tool) against the sanity stand in Kubernetes.
# The cluster comes from pnpm -w stand:configure (kubeconfig/context/namespace).
# prepare-pg.sh calls this before deleting its temporary stand-tool pod.
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
