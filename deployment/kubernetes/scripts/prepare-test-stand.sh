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
# Reset and seed a test stand (sanity|ws|qms|api) against the lib.sh config: remove, wipe data
# (db, region dbs, buckets, index, topics), deploy, seed via stand-tool. SOURCEd or executed.
set -euo pipefail
STAND_NAME="${1:?usage: prepare-test-stand.sh <sanity|ws|qms|api> [k3d|kind|existing]}"
case "$STAND_NAME" in
  sanity|ws|qms|api) ;;
  *) echo "usage: prepare-test-stand.sh <sanity|ws|qms|api> [k3d|kind|existing]" >&2; exit 2 ;;
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

# The data reset below runs inside the in-cluster components: the CNPG primary,
# statefulset/s3, statefulset/elastic and the broker pod (Strimzi or Redpanda). External
# components live outside the cluster, so refuse before base-up touches the stand. The modes
# are resolved the same way base-up renders them: explicit env, then stands/base/values.yaml,
# then the chart defaults.
PG_MODE="${POSTGRES_MODE:-$(base_values_mode postgres)}"
PG_MODE="${PG_MODE:-internal}"
S3_MODE="$(base_values_mode s3)"
S3_MODE="${S3_MODE:-silo}"
ELASTIC_MODE="$(base_values_mode elastic)"
ELASTIC_MODE="${ELASTIC_MODE:-internal}"
KAFKA_MODE="${KAFKA_MODE:-strimzi}"
export KAFKA_MODE
EXTERNAL_COMPONENTS=()
[ "$PG_MODE" != external ] || EXTERNAL_COMPONENTS+=("postgres.mode=external")
[ "$KAFKA_MODE" != external ] || EXTERNAL_COMPONENTS+=("kafka.mode=external")
[ "$S3_MODE" != external ] || EXTERNAL_COMPONENTS+=("s3.mode=external")
[ "$ELASTIC_MODE" != external ] || EXTERNAL_COMPONENTS+=("elastic.mode=external")
if [ ${#EXTERNAL_COMPONENTS[@]} -ne 0 ]; then
  die "prepare-test-stand.sh cannot prepare a stand with ${EXTERNAL_COMPONENTS[*]}: the data wipe and seed run inside the CNPG primary, statefulset/s3, statefulset/elastic and the broker pod. Only internal PostgreSQL, S3, Elasticsearch and strimzi|redpanda Kafka are supported; switch stands/base/values.yaml back to the internal components or prepare this stand by hand."
fi

"$SCRIPT_DIR/base-up.sh" "$STAND_RUNTIME"

# Claim the stand before the destructive steps below. deploy.sh acquires again once the stand is
# ready; the claim stays with the live stand and is released by down.sh, not here. The downs below
# run with STAND_LOCK_KEEP=1 so the nested down does not drop this claim mid-prepare.
stand_lock_acquire "$STAND_NAME"

# In-cluster broker address for the tool pod (dev/test-base/src/k8s.ts reads it): the base's
# Kafka mode picks the Strimzi or Redpanda Service; external was refused above.
KAFKA_BOOTSTRAP="$(base_kafka_bootstrap)"

log "removing the previous $STAND_NAME stand"
if [ "$STAND_NAME" = api ]; then
  guard_down_namespace "$STAND_NAME" "$STAND_NS" 1
  existing_ns="$(kc get namespace "$STAND_NS" --ignore-not-found -o name)" || die "cannot inspect api namespace '$STAND_NS'"
  if [ "${STAND_PREPARE_OWNED:-0}" = 1 ]; then
    kc create namespace "$STAND_NS" || die "cannot claim api namespace '$STAND_NS'"
  elif [ -n "$existing_ns" ] && [ "${STAND_REUSE:-0}" != 1 ]; then
    kc -n "$STAND_NS" create configmap api-stand-incomplete --dry-run=client -o yaml | kc apply -f -
    STAND_LOCK_KEEP=1 "$SCRIPT_DIR/test-down.sh" "$STAND_NAME" "$STAND_RUNTIME" --yes
    kc create namespace "$STAND_NS" || die "cannot reclaim api namespace '$STAND_NS'"
  elif [ -z "$existing_ns" ]; then
    kc create namespace "$STAND_NS" || die "cannot claim api namespace '$STAND_NS'"
  fi
  kc -n "$STAND_NS" create configmap api-stand-incomplete --dry-run=client -o yaml | kc apply -f -
elif [ "${STAND_REUSE:-0}" = 1 ] && kc get namespace "$STAND_NS" >/dev/null 2>&1; then
  # STAND_REUSE=1: upgrade in place; the data wipe below requires a pod restart anyway.
  log "keeping namespace $STAND_NS (STAND_REUSE=1): upgrade in place"
else
  STAND_LOCK_KEEP=1 "$SCRIPT_DIR/test-down.sh" "$STAND_NAME" "$STAND_RUNTIME" --yes
fi

# Kafka admin calls can wedge while the broker recovers; a bounded run fails the prepare with a
# message instead of hanging dotest until someone kills it.
with_deadline() {
  local secs="$1"; shift
  local rc=0
  perl -e '
    my $seconds = shift;
    my $pid = fork // die "fork: $!\n";
    if ($pid == 0) { exec @ARGV or die "exec: $!\n" }
    $SIG{ALRM} = sub { kill "KILL", $pid; waitpid $pid, 0; exit 124 };
    alarm $seconds;
    waitpid $pid, 0;
    alarm 0;
    exit(($? & 127) ? 128 + ($? & 127) : $? >> 8);
  ' "$secs" "$@" || rc=$?
  [ "$rc" != 124 ] || die "timed out after ${secs}s: $*"
  [ "$rc" = 0 ] || die "command failed (exit $rc): $*"
}

log "resetting $STAND_NAME data (databases, buckets, index, Kafka topics)"
PG_POD="$(postgres_primary_pod)"
kc -n "$BASE_NAMESPACE" exec "$PG_POD" -- sh -c \
  "dropdb -U postgres --if-exists --force '$STAND_DATA' || exit; for db in $REGION_DBS; do dropdb -U postgres --if-exists --force \"\$db\" || exit; done"
# The silo pod's `local` alias carries no keys; use the platform credentials explicitly,
# otherwise the wipe is a silent no-op and old blobs pile up across runs.
S3_AK="$(kc -n "$BASE_NAMESPACE" get secret platform-base -o jsonpath='{.data.S3_ACCESS_KEY}' | base64 -d)" || die "S3: cannot read access key"
S3_SK="$(kc -n "$BASE_NAMESPACE" get secret platform-base -o jsonpath='{.data.S3_SECRET_KEY}' | base64 -d)" || die "S3: cannot read secret key"
[ -n "$S3_AK" ] && [ -n "$S3_SK" ] || die "S3: platform-base credentials are empty"
kc -n "$BASE_NAMESPACE" exec -i statefulset/s3 -- sh -s -- "$S3_AK" "$S3_SK" "$STAND_DATA" <<'S3_RESET' || die "S3: data cleanup failed"
mc alias set wipe http://127.0.0.1:9000 "$1" "$2" >/dev/null || exit
buckets=$(mc ls wipe) || exit
for bucket in "$3" "$3-chunks" "$3-backups" "$3-love-recordings"; do
  for entry in $buckets; do
    [ "$entry" = "$bucket/" ] || continue
    mc rm -r --force "wipe/$bucket" || exit
  done
done
S3_RESET
# Elastic: the stand index plus one index per non-default region (fulltext<region>).
ELASTIC_INDEXES="$STAND_DATA"
for region in $REGION_IDS; do
  ELASTIC_INDEXES="$ELASTIC_INDEXES $STAND_DATA-$region"
done
for index in $ELASTIC_INDEXES; do
  status="$(kc -n "$BASE_NAMESPACE" exec statefulset/elastic -- \
    curl -sS -o /dev/null -w '%{http_code}' -X DELETE "http://localhost:9200/$index")" || die "Elasticsearch: failed to delete $index"
  [ "$status" = 200 ] || [ "$status" = 404 ] || die "Elasticsearch: delete $index returned HTTP $status"
done
if [ "$KAFKA_MODE" = redpanda ]; then
  # Redpanda has no Kafka distribution: rpk is its admin tool. `rpk topic list` is a text table,
  # so the names are matched token by token against the stand suffix.
  with_deadline 300 kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" exec -i deployment/redpanda -- sh -s -- "$STAND_DATA" <<'RPK_RESET'
topics=$(rpk topic list --brokers localhost:9092) || exit
for name in $topics; do
  case "$name" in *-"$1") rpk topic delete --brokers localhost:9092 "$name" || exit ;; esac
done
RPK_RESET
else
  with_deadline 300 kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" exec my-cluster-combined-0 -- sh -c \
    "topics=\$(bin/kafka-topics.sh --bootstrap-server localhost:9092 --list) || exit; for topic in \$topics; do case \"\$topic\" in *-$STAND_DATA) bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic \"\$topic\" || exit ;; esac; done"
fi

# Consumers subscribe at pod start and do not all recover when a topic appears later: recreate
# the core set (partitions as in PlatformQueue.createTopics()) before deploying.
log "creating $STAND_NAME Kafka topics"
if [ "$KAFKA_MODE" = redpanda ]; then
  # rpk exits non-zero when the topic is still there; the delete above is asynchronous, so an
  # existing topic is the expected result of a retry, same as --if-not-exists below.
  with_deadline 300 kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" exec -i deployment/redpanda -- sh -s -- "$STAND_DATA" <<'RPK_TOPICS'
# Keep the topic/partition list in sync with the Strimzi branch below.
for spec in tx:10 online-user-tx:10 fulltext:5 workspace:1 users:1 process:1 ai-queue:10 transcription-queue:10 user-notifications:10 held-notifications:10 notifications:2 love-queue:1 crm:1 billing-usage:1 subscription:1 payment-operation:1; do
  topic=${spec%%:*}
  partitions=${spec##*:}
  # rpk prints a per-topic failure as a table row on stdout (create.go uses out.NewTable/os.Stdout)
  # and request-level failures on stderr; capture both so the retry check sees either.
  out=$(rpk topic create --brokers localhost:9092 -r 1 -p "$partitions" "$topic-$1" 2>&1) || {
    case "$out" in *TOPIC_ALREADY_EXISTS*) ;; *) echo "$out" >&2; exit 1 ;; esac
  }
done
RPK_TOPICS
else
  with_deadline 300 kubectl --context "$KUBE_CONTEXT" -n "$BASE_NAMESPACE" exec my-cluster-combined-0 -- sh -c \
    "for spec in tx:10 online-user-tx:10 fulltext:5 workspace:1 users:1 process:1 ai-queue:10 transcription-queue:10 user-notifications:10 held-notifications:10 notifications:2 love-queue:1 crm:1 billing-usage:1 subscription:1 payment-operation:1; do \
      topic=\${spec%%:*}; partitions=\${spec##*:}; \
      bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists \
        --topic \"\$topic-$STAND_DATA\" --partitions \"\$partitions\" || exit; \
    done"
fi

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
[ "$STAND_NAME" = qms ] && rm -rf "$REPO_ROOT/qms-tests/sanity/.auth"

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
  /workspace/dev/test-base/bundle /workspace/dev/tool/bundle /workspace/common/scripts /workspace/tests /workspace/qms-tests
kc cp "$REPO_ROOT/dev/test-base/bundle/bundle.js" "$STAND_NS/stand-tool:/workspace/dev/test-base/bundle/bundle.js"
kc cp "$REPO_ROOT/dev/tool/bundle/bundle.js" "$STAND_NS/stand-tool:/workspace/dev/tool/bundle/bundle.js"
kc cp "$REPO_ROOT/common/scripts/show_version.js" "$STAND_NS/stand-tool:/workspace/common/scripts/show_version.js"
if [ "$STAND_NAME" = sanity ]; then
  # Dumps restored into the seeded workspaces + the prod index set.
  kc cp "$REPO_ROOT/tests/sanity-ws" "$STAND_NS/stand-tool:/workspace/tests/sanity-ws"
  kc cp "$REPO_ROOT/tests/meetings-ws" "$STAND_NS/stand-tool:/workspace/tests/meetings-ws"
  kc cp "$REPO_ROOT/tests/indexes.yaml" "$STAND_NS/stand-tool:/workspace/tests/indexes.yaml"
elif [ "$STAND_NAME" = qms ]; then
  # dev/test-base/src/stands.ts restores it from the qms stand dir (qms-tests/).
  kc cp "$REPO_ROOT/qms-tests/sanity-ws-qms" "$STAND_NS/stand-tool:/workspace/qms-tests/sanity-ws-qms"
fi

MODEL_VERSION="$(node "$REPO_ROOT/common/scripts/show_version.js")"
export MODEL_VERSION
log "seeding $STAND_NAME inside $STAND_NS/stand-tool"
kc -n "$STAND_NS" exec stand-tool -- env \
  K8S_TOOL_IN_POD=1 STAND_BACKEND=k3s K8S_STAND="$STAND_NAME" \
  K8S_KAFKA_BOOTSTRAP="$KAFKA_BOOTSTRAP" \
  STAND_HTTPS_PORT="$STAND_HTTPS_PORT" MODEL_VERSION="$MODEL_VERSION" \
  node --max-old-space-size=8096 /workspace/dev/test-base/bundle/bundle.js "$STAND_NAME" seed

if [ "$STAND_NAME" = api ]; then
  kc -n "$STAND_NS" delete configmap api-stand-incomplete
fi
