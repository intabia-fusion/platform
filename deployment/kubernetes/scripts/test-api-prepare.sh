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
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo/deployment/kubernetes/scripts" "$tmp/repo/deployment/kubernetes/cluster" "$tmp/repo/dev/test-base" "$tmp/repo/dev/tool" "$tmp/repo/common/scripts" "$tmp/repo/tests/sanity" "$tmp/bin" "$tmp/state"
cp "$root"/deployment/kubernetes/scripts/*.sh "$tmp/repo/deployment/kubernetes/scripts/"
cp "$root/deployment/kubernetes/cluster/versions.env" "$tmp/repo/deployment/kubernetes/cluster/"
cp -R "$root/deployment/kubernetes/stands" "$tmp/repo/deployment/kubernetes/"
cat > "$tmp/repo/deployment/kubernetes/scripts/base-up.sh" <<'MOCK'
#!/bin/sh
exit 0
MOCK
cat > "$tmp/repo/deployment/kubernetes/scripts/test-up.sh" <<'MOCK'
#!/bin/sh
exit 0
MOCK
cat > "$tmp/repo/deployment/kubernetes/scripts/test-down.sh" <<'MOCK'
#!/bin/sh
rm -rf "$STATE/ns" "$STATE/marker"
MOCK
cat > "$tmp/bin/kubectl" <<'MOCK'
#!/usr/bin/env bash
set -e
args=" $* "
printf '%s\n' "$args" >> "$STATE/calls"
case "$args" in
  *" create namespace fusion-api "*) mkdir "$STATE/ns" ;;
  *" get namespace fusion-api "*)
    if [ "${TEST_RACE:-0}" = 1 ]; then
      mkdir "$STATE/seen.$TEST_RUN"
      while [ ! -d "$STATE/seen.first" ] || [ ! -d "$STATE/seen.second" ]; do sleep 0.01; done
      exit 0
    fi
    if [ -d "$STATE/ns" ]; then echo namespace/fusion-api; elif [[ "$args" != *--ignore-not-found* ]]; then exit 1; fi ;;
  *" create configmap api-stand-incomplete "*) echo marker ;;
  *" delete configmap api-stand-incomplete "*) rm -rf "$STATE/marker" ;;
  *" get configmap api-stand-incomplete "*) [ ! -d "$STATE/marker" ] || echo configmap/api-stand-incomplete ;;
  *" apply -f - "*) input="$(cat)"; [ "$input" != marker ] || mkdir -p "$STATE/marker" ;;
  *" get pod "*) echo postgres-0 ;;
  *" get secret platform-base "*) echo eA== ;;
  *" exec postgres-0 "*)
    mkdir "$STATE/reset.$TEST_RUN"
    while [ ! -f "$STATE/release" ]; do sleep 0.05; done
    [ "${TEST_FAIL:-}" != wipe ] ;;
  *" exec statefulset/elastic "*) echo 200 ;;
  *" exec stand-tool -- env "*) [ "${TEST_FAIL:-}" != seed ] ;;
  *) cat >/dev/null || true ;;
esac
MOCK
for name in helm node; do
  cat > "$tmp/bin/$name" <<'MOCK'
#!/bin/sh
exit 0
MOCK
done
chmod +x "$tmp/bin/"* "$tmp/repo/deployment/kubernetes/scripts/"*.sh
export STATE="$tmp/state" PATH="$tmp/bin:$PATH" STAND_RUNTIME=existing KUBE_CONTEXT=isolated
export STAND_CONFIG_DIR="$tmp/config" STAND_HTTPS_PORT=443 NODE_EXTRA_CA_CERTS=/dev/null STAND_PUSH_IMAGES=0
prepare="$tmp/repo/deployment/kubernetes/scripts/prepare-test-stand.sh"
TEST_RUN=first TEST_RACE=1 STAND_PREPARE_OWNED=1 bash "$prepare" api > "$tmp/first.log" 2>&1 &
first=$!
TEST_RUN=second TEST_RACE=1 STAND_PREPARE_OWNED=1 bash "$prepare" api > "$tmp/second.log" 2>&1 &
second=$!
for _ in $(seq 1 500); do
  [ ! -d "$STATE/reset.first" ] && [ ! -d "$STATE/reset.second" ] || break
  sleep 0.01
done
[ -d "$STATE/seen.first" ] && [ -d "$STATE/seen.second" ]
if [ -d "$STATE/reset.first" ] && [ -d "$STATE/reset.second" ]; then
  touch "$STATE/release"
  wait "$first" || true
  wait "$second" || true
  echo "concurrent auto prepares both reached reset" >&2
  exit 1
fi
[ -d "$STATE/reset.first" ] || [ -d "$STATE/reset.second" ] || { cat "$tmp/first.log" "$tmp/second.log"; exit 1; }
[ -d "$STATE/marker" ] || { echo "reset started without incomplete marker" >&2; exit 1; }
touch "$STATE/release"
first_rc=0; wait "$first" || first_rc=$?
second_rc=0; wait "$second" || second_rc=$?
[ "$first_rc" != "$second_rc" ]
[ "$first_rc" = 0 ] || [ "$second_rc" = 0 ]
[ ! -d "$STATE/marker" ]
rm -rf "$STATE/reset."* "$STATE/marker"
mkdir -p "$STATE/ns"
if TEST_RUN=early TEST_FAIL=wipe STAND_REUSE=1 bash "$prepare" api > "$tmp/early.log" 2>&1; then
  echo "wipe failure unexpectedly succeeded" >&2; exit 1
fi
[ -d "$STATE/marker" ]
TEST_RUN=earlyretry STAND_REUSE=1 bash "$prepare" api > "$tmp/earlyretry.log" 2>&1 || { cat "$tmp/earlyretry.log"; exit 1; }
[ ! -d "$STATE/marker" ]
for reuse in 0 1; do
  rm -rf "$STATE/reset."* "$STATE/marker"
  mkdir -p "$STATE/ns"
  if TEST_RUN="fail$reuse" TEST_FAIL=seed STAND_REUSE="$reuse" bash "$prepare" api > "$tmp/fail$reuse.log" 2>&1; then
    echo "seed failure unexpectedly succeeded" >&2; exit 1
  fi
  [ -d "$STATE/marker" ]
  TEST_RUN="retry$reuse" STAND_REUSE="$reuse" bash "$prepare" api > "$tmp/retry$reuse.log" 2>&1 || { cat "$tmp/retry$reuse.log"; exit 1; }
  [ ! -d "$STATE/marker" ]
done
: > "$STATE/calls"
if TEST_RUN=guard STAND_NAMESPACE=platform-base STAND_REUSE=1 bash "$prepare" api > "$tmp/guard.log" 2>&1; then
  echo "platform-base namespace was accepted" >&2; exit 1
fi
if grep -qE 'create (namespace|configmap)' "$STATE/calls"; then
  echo "platform-base guard ran after a write" >&2; exit 1
fi
echo "API namespace claim, incomplete marker, failure and retry passed"
