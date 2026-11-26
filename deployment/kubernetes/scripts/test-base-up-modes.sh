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
# Offline checks for base-up mode gating: the CloudNativePG operator follows postgres.mode, not
# KAFKA_MODE, and POSTGRES_MODE never turns an external stand internal. kubectl, helm and curl are
# stubs; no cluster or registry is touched.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
repo="$tmp/repo/deployment/kubernetes"
mkdir -p "$repo" "$tmp/bin" "$tmp/state" "$tmp/tmp" "$repo/certs" "$repo/stands/base"
cp -R "$root/deployment/kubernetes/scripts" "$repo/"
cp -R "$root/deployment/kubernetes/cluster" "$repo/"
printf '# the mode checks read only the mode keys\n' > "$repo/stands/base/values.yaml"
cat > "$repo/certs/gen.sh" <<'STUB'
#!/bin/sh
exit 0
STUB
cat > "$tmp/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STATE/calls"
case " $* " in
  *" get crd "*) echo True ;;
  *" get cluster postgres -o jsonpath={.status.readyInstances}"*) echo 2 ;;
  *" get cluster postgres -o jsonpath={.spec.instances}"*) echo 2 ;;
  *" get nodes -o wide "*) echo 'node Ready' ;;
  *" apply -f - "*) cat >/dev/null ;;
esac
exit 0
STUB
cat > "$tmp/bin/helm" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STATE/helm"
case " $* " in *" version --short "*) echo v4.2.4+g3900f43 ;; esac
exit 0
STUB
cat > "$tmp/bin/curl" <<'STUB'
#!/usr/bin/env bash
cat <<'YAML'
kind: Deployment
metadata:
  name: sealed-secrets-controller
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: clusters.postgresql.cnpg.io
YAML
STUB
chmod +x "$tmp/bin/"* "$repo/certs/gen.sh"
base_up="$repo/scripts/base-up.sh"
export STATE="$tmp/state" PATH="$tmp/bin:$PATH" TMPDIR="$tmp/tmp" STAND_RUNTIME=existing
export KUBE_CONTEXT=isolated STAND_CONFIG_DIR="$tmp/config" STAND_PUSH_IMAGES=0

run_base_up() { # <case> [VAR=value...]
  local name="$1"; shift
  : > "$STATE/calls"; : > "$STATE/helm"
  env "$@" bash "$base_up" existing > "$tmp/$name.log" 2>&1 || {
    echo "FAIL: $name: base-up exited non-zero" >&2; tail -20 "$tmp/$name.log" >&2; exit 1
  }
}

expect_log() { grep -q "$2" "$tmp/$1.log" || { echo "FAIL: $1: log lacks '$2'" >&2; exit 1; }; }
expect_no_log() { ! grep -q "$2" "$tmp/$1.log" || { echo "FAIL: $1: log has '$2'" >&2; exit 1; }; }
expect_helm() { grep -q -- "$2" "$STATE/helm" || { echo "FAIL: $1: helm lacks '$2'" >&2; exit 1; }; }
expect_no_helm() { ! grep -q -- "$2" "$STATE/helm" || { echo "FAIL: $1: helm has '$2'" >&2; exit 1; }; }
expect_kubectl() { grep -q -- "$2" "$STATE/calls" || { echo "FAIL: $1: kubectl lacks '$2'" >&2; exit 1; }; }
expect_no_kubectl() { ! grep -q -- "$2" "$STATE/calls" || { echo "FAIL: $1: kubectl has '$2'" >&2; exit 1; }; }
expect_cnpg() {
  expect_log "$1" 'installing/updating CloudNativePG operator'
  expect_kubectl "$1" 'fusion-cnpg'
}
expect_no_cnpg() {
  expect_no_log "$1" 'CloudNativePG'
  expect_no_kubectl "$1" 'fusion-cnpg'
}

# The original bug: redpanda and external Kafka skipped the CNPG operator entirely.
run_base_up redpanda KAFKA_MODE=redpanda
expect_cnpg redpanda
expect_kubectl redpanda 'rollout status deployment/redpanda'
expect_helm redpanda 'kafka.mode=redpanda'
expect_no_helm redpanda 'postgres.mode'

run_base_up external-kafka KAFKA_MODE=external
expect_cnpg external-kafka
expect_no_kubectl external-kafka 'wait kafka my-cluster'
expect_no_kubectl external-kafka 'status deployment/redpanda'

run_base_up strimzi KAFKA_MODE=strimzi
expect_cnpg strimzi
expect_kubectl strimzi 'wait kafka my-cluster'

run_base_up no-pg-override KAFKA_MODE=redpanda
expect_no_helm no-pg-override 'postgres.mode'

run_base_up external-pg KAFKA_MODE=redpanda POSTGRES_MODE=external
expect_no_cnpg external-pg
expect_helm external-pg 'postgres.mode=external'
expect_kubectl external-pg 'rollout status deployment/redpanda'

# postgres.mode: external in the stand values must stay external without an explicit override.
printf 'postgres:\n  mode: external\n' > "$repo/stands/base/values.yaml"
run_base_up values-external-pg KAFKA_MODE=redpanda
expect_no_cnpg values-external-pg
expect_no_helm values-external-pg 'postgres.mode'

: > "$STATE/calls"
if POSTGRES_MODE=sidecar bash "$base_up" existing > "$tmp/bad-mode.log" 2>&1; then
  echo 'FAIL: POSTGRES_MODE=sidecar was accepted' >&2; exit 1
fi
grep -q 'POSTGRES_MODE must be internal or external' "$tmp/bad-mode.log"
test ! -s "$STATE/calls"
echo 'base-up mode checks passed'
