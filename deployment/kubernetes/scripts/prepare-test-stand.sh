#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Reset and seed a test stand (sanity|ws|api) against the lib.sh config: remove, wipe data
# (db, region dbs, buckets, index, topics), deploy, seed via stand-tool. SOURCEd or executed.
set -euo pipefail
STAND_NAME="${1:?usage: prepare-test-stand.sh <sanity|ws|api> [k3d|kind|existing]}"
case "$STAND_NAME" in
  sanity|ws|api) ;;
  *) echo "usage: prepare-test-stand.sh <sanity|ws|api> [k3d|kind|existing]" >&2; exit 2 ;;
esac
[ $# -ge 2 ] && case "$2" in k3d|kind|existing) STAND_RUNTIME="$2"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

export STAND_BACKEND=k3s
export K8S_STAND="$STAND_NAME"
export K8S_PG_PORT="${K8S_PG_PORT:-65432}"
export K8S_KAFKA_PORT="${K8S_KAFKA_PORT:-19092}"
export K8S_ELASTIC_PORT="${K8S_ELASTIC_PORT:-19200}"
# The port the stand actually publishes on (STAND_HTTPS_PORT wins; k3d/kind are
# detected from the running cluster, existing defaults to 443).
STAND_HTTPS_PORT="$(published_https_port)"
export STAND_HTTPS_PORT
export NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-$(mkcert -CAROOT)/rootCA.pem}"

STAND_NS="$(stand_namespace "$STAND_NAME")"
STAND_HOST="$(stand_host "$STAND_NAME")"
STAND_DATA="$(stand_data "$STAND_NAME")"
[ -n "$STAND_NS" ] && [ -n "$STAND_HOST" ] && [ -n "$STAND_DATA" ] || \
  die "cannot resolve $STAND_NAME namespace/hostUrl/stand from values"

VALUES_FILES=()
mapfile -t VALUES_FILES < <(stand_values_files "$STAND_NAME")
# Per-region databases (config.regions[].db) and region ids, for the data wipe. `|| true`:
# single-region stands (sanity) have neither key and grep would fail the pipeline under pipefail.
REGION_DBS="$(grep -h -E '^    db:' "${VALUES_FILES[@]}" | awk '{print $2}' | sort -u || true)"
REGION_IDS="$(grep -h -E '^  - id:' "${VALUES_FILES[@]}" | awk '{print $3}' | sed 's/^"//; s/"$//' | grep -v '^$' || true)"

require_tools
"$SCRIPT_DIR/base-up.sh" "$STAND_RUNTIME"

log "removing the previous $STAND_NAME stand"
if [ "${STAND_REUSE:-0}" = 1 ] && kc get namespace "$STAND_NS" >/dev/null 2>&1; then
  # STAND_REUSE=1: upgrade in place; the data wipe below requires a pod restart anyway.
  log "keeping namespace $STAND_NS (STAND_REUSE=1): upgrade in place"
else
  "$SCRIPT_DIR/test-down.sh" "$STAND_NAME" "$STAND_RUNTIME" --yes
fi

# Kafka admin calls can wedge while the broker recovers; a bounded run fails the prepare with a
# message instead of hanging dotest until someone kills it.
with_deadline() {
  local secs="$1"; shift
  perl -e 'alarm shift; exec @ARGV' "$secs" "$@" || die "timed out after ${secs}s: $*"
}

log "resetting $STAND_NAME data (databases, buckets, index, Kafka topics)"
PG_POD="$(postgres_primary_pod)"
kc -n "$BASE_NAMESPACE" exec "$PG_POD" -- sh -c \
  "dropdb -U postgres --if-exists --force '$STAND_DATA'; for db in $REGION_DBS; do dropdb -U postgres --if-exists --force \"\$db\"; done"
# The silo pod's `local` alias carries no keys; use the platform credentials explicitly,
# otherwise the wipe is a silent no-op and old blobs pile up across runs.
S3_AK="$(kc -n "$BASE_NAMESPACE" get secret platform-base -o jsonpath='{.data.S3_ACCESS_KEY}' 2>/dev/null | base64 -d || true)"
S3_SK="$(kc -n "$BASE_NAMESPACE" get secret platform-base -o jsonpath='{.data.S3_SECRET_KEY}' 2>/dev/null | base64 -d || true)"
if [ -n "$S3_AK" ] && [ -n "$S3_SK" ]; then
  kc -n "$BASE_NAMESPACE" exec statefulset/s3 -- sh -c \
    "mc alias set wipe http://127.0.0.1:9000 '$S3_AK' '$S3_SK' >/dev/null && mc rm -r --force wipe/$STAND_DATA wipe/$STAND_DATA-chunks wipe/$STAND_DATA-backups wipe/$STAND_DATA-love-recordings >/dev/null 2>&1 || true"
fi
# Elastic: the stand index plus one index per non-default region (fulltext<region>).
ELASTIC_INDEXES="$STAND_DATA"
for region in $REGION_IDS; do
  ELASTIC_INDEXES="$ELASTIC_INDEXES $STAND_DATA-$region"
done
for index in $ELASTIC_INDEXES; do
  kc -n "$BASE_NAMESPACE" exec statefulset/elastic -- \
    curl -fsS -X DELETE "http://localhost:9200/$index" 2>/dev/null || true
done
with_deadline 300 kc -n "$BASE_NAMESPACE" exec my-cluster-combined-0 -- sh -c \
  "for topic in \$(bin/kafka-topics.sh --bootstrap-server localhost:9092 --list | grep -- '-$STAND_DATA\$'); do bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic \"\$topic\"; done"

# Consumers subscribe at pod start and do not all recover when a topic appears later: recreate
# the core set (partitions as in PlatformQueue.createTopics()) before deploying.
log "creating $STAND_NAME Kafka topics"
with_deadline 300 kc -n "$BASE_NAMESPACE" exec my-cluster-combined-0 -- sh -c \
  "for spec in tx:10 online-user-tx:10 fulltext:5 workspace:1 users:1 process:1 ai-queue:10 transcription-queue:10 user-notifications:10 held-notifications:10 notifications:2 love-queue:1 crm:1 billing-usage:1 subscription:1 payment-operation:1; do \
    topic=\${spec%%:*}; partitions=\${spec##*:}; \
    bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists \
      --topic \"\$topic-$STAND_DATA\" --partitions \"\$partitions\"; \
  done"

if [ "${STAND_REUSE:-0}" = 1 ] && kc get namespace "$STAND_NS" >/dev/null 2>&1; then
  # The stand database is gone: a running transactor/workspace would keep stale pools and
  # cached workspace handles, so drop every pod and let the deployments recreate them.
  log "restarting $STAND_NAME pods after the data wipe"
  kc -n "$STAND_NS" delete pods --all --wait=false >/dev/null 2>&1 || true
fi

"$SCRIPT_DIR/test-up.sh" "$STAND_NAME" "$STAND_RUNTIME"

# Stale Playwright storage state from a previous stand sends the suites back to the
# login screen; the fresh stand re-authenticates in the setup project.
rm -rf "$REPO_ROOT/tests/sanity/.auth"
[ "$STAND_NAME" = ws ] && rm -rf "$REPO_ROOT/ws-tests/sanity/.auth"

# The tool pod dies with the calling shell (the trap below runs in whoever sourced this file),
# so tests/tool-pg.sh still has it for sync-indexes at the end of a tests/prepare-pg.sh run.
cleanup_tool_pod() {
  kc -n "$STAND_NS" delete pod stand-tool --wait=false >/dev/null 2>&1 || true
}
trap cleanup_tool_pod EXIT

# Tool image, same contract as the stand images: STAND_VERSION (tag, default values global.version),
# STAND_IMAGE_REGISTRY, STAND_IMAGE_NAMESPACE, STAND_TOOL_IMAGE (full override), STAND_PUSH_IMAGES (0/1).
if [ -z "${STAND_PUSH_IMAGES:-}" ]; then
  case "$STAND_RUNTIME" in
    existing) PUSH_TOOL=0 ;;
    *)        PUSH_TOOL=1 ;;
  esac
else
  PUSH_TOOL="$STAND_PUSH_IMAGES"
fi
TOOL_IMAGE=
if [ "$PUSH_TOOL" != 1 ]; then
  TOOL_IMAGE="${STAND_TOOL_IMAGE:-}"
  if [ -z "$TOOL_IMAGE" ]; then
    TOOL_VERSION="${STAND_VERSION:-}"
    if [ -z "$TOOL_VERSION" ]; then
      TOOL_VERSION="$(grep -h '^  version:' "${VALUES_FILES[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
    fi
    TOOL_VERSION="${TOOL_VERSION:-latest}"
    if [ -n "$STAND_IMAGE_REGISTRY" ]; then
      TOOL_IMAGE="$STAND_IMAGE_REGISTRY/$STAND_IMAGE_NAMESPACE/tool:$TOOL_VERSION"
    else
      TOOL_IMAGE="$STAND_IMAGE_NAMESPACE/tool:$TOOL_VERSION"
    fi
  fi
  log "using pullable stand-tool image $TOOL_IMAGE (no Docker push)"
else
  # The local build is always tagged intabiafusion/<svc> by docker_build.sh; the stand
  # namespace only changes where the cluster pulls it from.
  TOOL_IMAGE_PUSH="$REGISTRY_PUSH/$STAND_IMAGE_NAMESPACE/tool:latest"
  docker image inspect intabiafusion/tool:latest >/dev/null 2>&1 || \
    die "intabiafusion/tool:latest is missing; build it first"
  docker tag intabiafusion/tool:latest "$TOOL_IMAGE_PUSH" >/dev/null
  docker push "$TOOL_IMAGE_PUSH" >/dev/null
  TOOL_IMAGE="$REGISTRY_PULL/$STAND_IMAGE_NAMESPACE/tool:latest"
fi

log "building the stand tool bundles"
# Same invocations as dev/test-base/run.sh and the dev/tool "bundle" script: bundles are
# gitignored, so a fresh checkout (CI) has none - build before copying into the pod.
(cd "$REPO_ROOT/dev/test-base" && node "$REPO_ROOT/common/scripts/esbuild.js" \
  --entry=src/main.ts --keep-names=true --external=snappy --sourcemap=external >/dev/null)
(cd "$REPO_ROOT/dev/tool" && node "$REPO_ROOT/common/scripts/esbuild.js" \
  --entry=src/__start.ts --keep-names=true --external=snappy --sourcemap=external \
  --define:MODEL_VERSION --define:GIT_REVISION >/dev/null)

log "starting stand-tool pod in namespace $STAND_NS"
cleanup_tool_pod
kc apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: stand-tool
  namespace: $STAND_NS
spec:
  restartPolicy: Never
  containers:
  - name: stand-tool
    image: $TOOL_IMAGE
    imagePullPolicy: Always
    command: ["sh", "-c", "sleep 3600"]
    env:
    - name: NODE_EXTRA_CA_CERTS
      value: /etc/ssl/platform-ca/tls.crt
    volumeMounts:
    - name: platform-ca
      mountPath: /etc/ssl/platform-ca
      readOnly: true
  volumes:
  - name: platform-ca
    secret:
      secretName: fusion-local-ca
      defaultMode: 420
EOF
kc -n "$STAND_NS" wait --for=condition=Ready pod/stand-tool --timeout=180s

kc -n "$STAND_NS" exec stand-tool -- mkdir -p \
  /workspace/dev/test-base/bundle /workspace/dev/tool/bundle /workspace/common/scripts /workspace/tests
kc cp "$REPO_ROOT/dev/test-base/bundle/bundle.js" "$STAND_NS/stand-tool:/workspace/dev/test-base/bundle/bundle.js"
kc cp "$REPO_ROOT/dev/tool/bundle/bundle.js" "$STAND_NS/stand-tool:/workspace/dev/tool/bundle/bundle.js"
kc cp "$REPO_ROOT/common/scripts/show_version.js" "$STAND_NS/stand-tool:/workspace/common/scripts/show_version.js"
if [ "$STAND_NAME" = sanity ]; then
  # Dumps restored into the seeded workspaces + the prod index set.
  kc cp "$REPO_ROOT/tests/sanity-ws" "$STAND_NS/stand-tool:/workspace/tests/sanity-ws"
  kc cp "$REPO_ROOT/tests/meetings-ws" "$STAND_NS/stand-tool:/workspace/tests/meetings-ws"
  kc cp "$REPO_ROOT/tests/indexes.yaml" "$STAND_NS/stand-tool:/workspace/tests/indexes.yaml"
fi

MODEL_VERSION="$(node "$REPO_ROOT/common/scripts/show_version.js")"
export MODEL_VERSION
log "seeding $STAND_NAME inside $STAND_NS/stand-tool"
kc -n "$STAND_NS" exec stand-tool -- env \
  K8S_TOOL_IN_POD=1 STAND_BACKEND=k3s K8S_STAND="$STAND_NAME" \
  STAND_HTTPS_PORT="$STAND_HTTPS_PORT" MODEL_VERSION="$MODEL_VERSION" \
  node --max-old-space-size=8096 /workspace/dev/test-base/bundle/bundle.js "$STAND_NAME" seed
