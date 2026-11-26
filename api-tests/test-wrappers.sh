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
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo/api-tests/api" "$tmp/repo/api-tests/backup" "$tmp/repo/deployment/kubernetes/scripts" "$tmp/repo/deployment/kubernetes/cluster" "$tmp/bin"
cp "$root/api-tests/api/package.json" "$tmp/repo/api-tests/api/"
cp "$root/api-tests/backup/package.json" "$tmp/repo/api-tests/backup/"
cp "$root"/deployment/kubernetes/scripts/*.sh "$tmp/repo/deployment/kubernetes/scripts/"
cp "$root/deployment/kubernetes/cluster/versions.env" "$tmp/repo/deployment/kubernetes/cluster/"
cp -R "$root/deployment/kubernetes/stands" "$tmp/repo/deployment/kubernetes/"
cat > "$tmp/bin/kubectl" <<'MOCK'
#!/bin/sh
echo "kubectl:$*" >> "$TEST_CALLS"
case "$*" in
  *"get namespace "*)
    [ "$TEST_UP" = 1 ] && echo namespace/fusion-api
    exit 0 ;;
  *"get configmap api-stand-incomplete"*)
    [ "${TEST_INCOMPLETE:-0}" = 1 ] && echo configmap/api-stand-incomplete
    exit 0 ;;
  *"get deployment account"*) [ "$TEST_UP" = 1 ] && exit 0 ;;
esac
exit 1
MOCK
cat > "$tmp/repo/deployment/kubernetes/scripts/prepare-test-stand.sh" <<'MOCK'
#!/bin/sh
echo "prepare:$*" >> "$TEST_CALLS"
MOCK
cat > "$tmp/bin/k3d" <<'MOCK'
#!/bin/sh
printf 'NAME\nfusion\n'
MOCK
cat > "$tmp/bin/node" <<'MOCK'
#!/bin/sh
exit 1
MOCK
cat > "$tmp/bin/sleep" <<'MOCK'
#!/bin/sh
exit 0
MOCK
cat > "$tmp/bin/jest" <<'MOCK'
#!/bin/sh
printf 'jest:%s:%s:%s\n' "${API_STAND:-unset}" "${API_STAND_PREPARED:-unset}" "$*" >> "$TEST_CALLS"
MOCK
chmod +x "$tmp/bin/"* "$tmp/repo/deployment/kubernetes/scripts/prepare-test-stand.sh"

# The `node` stub exits 1, so package.json is parsed as JSON, not by running it through node.
package_script() {
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    print(json.load(f)['scripts'][sys.argv[2]])
PY
}

export PATH="$tmp/bin:$PATH" TEST_CALLS="$tmp/calls" STAND_HTTPS_PORT=443 STAND_RUNTIME=k3d
export STAND_CONFIG_DIR="$tmp/config" K8S_KAFKA_PORT=19876
for package in api backup; do
  cd "$tmp/repo/api-tests/$package"
  case "$package" in api) script=api-test:k8s ;; backup) script=backup-test:k8s ;; esac
  command="$(package_script package.json "$script")"
  [ -n "$command" ]
  for mode in unset keep stop external; do
    for up in 0 1; do
      : > "$TEST_CALLS"
      export TEST_UP="$up"
      expected=0
      [ "$mode" = external ] || [ "$up" = 1 ] || expected=1
      if [ "$mode" = unset ]; then
        env -u API_STAND bash -c "$command --json --outputFile=report.json"
      else
        API_STAND="$mode" bash -c "$command --json --outputFile=report.json"
      fi
      grep -q "^jest:$mode:$expected:.*--json --outputFile=report.json" "$TEST_CALLS"
      [ "$(grep -c '^prepare:' "$TEST_CALLS" || true)" = "$expected" ]
      if grep -q 'my-cluster-kafka-bootstrap' "$TEST_CALLS"; then
        echo "$package ($mode) waited for Kafka before Jest" >&2
        exit 1
      fi
    done
  done
done

# Compose wrappers run Jest directly: no stand preparation, the arguments reach Jest unchanged.
for package in api backup; do
  cd "$tmp/repo/api-tests/$package"
  case "$package" in api) script=api-test ;; backup) script=backup-test ;; esac
  command="$(package_script package.json "$script")"
  [ -n "$command" ]
  : > "$TEST_CALLS"
  env -u API_STAND_PREPARED API_STAND=keep bash -c "$command --json --outputFile=report.json"
  grep -q '^jest:keep:unset:.*--json --outputFile=report.json' "$TEST_CALLS"
  if grep -q '^prepare:' "$TEST_CALLS"; then
    echo "$package compose wrapper prepared the stand" >&2
    exit 1
  fi
done

cd "$tmp/repo/api-tests/api"
script=api-test:k8s
command="$(package_script package.json "$script")"
: > "$TEST_CALLS"
export TEST_UP=1 TEST_INCOMPLETE=1
if API_STAND=keep bash -c "$command" >/dev/null 2>&1; then
  echo "incomplete stand was accepted" >&2
  exit 1
fi
if grep -qE '^(prepare|jest):' "$TEST_CALLS"; then
  echo "incomplete stand was modified or passed to Jest" >&2
  exit 1
fi
echo "API and backup k8s wrappers prepare before Jest only when needed; compose wrappers pass arguments"
