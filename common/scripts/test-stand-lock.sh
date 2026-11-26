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
# Offline checks for the stand claims: a temporary STAND_LOCK_DIR and stubbed docker/kubectl/k3d.
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
lock_script="$script_dir/stand-lock.sh"
k8s_dir="$script_dir/../../deployment/kubernetes/scripts"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/config" "$tmp/lock"

cat > "$tmp/bin/docker" <<'STUB'
#!/usr/bin/env bash
[ "${STUB_DOCKER_BROKEN:-0}" = 1 ] && exit 1
case "$*" in
  *info*)
    case "$*" in
      *MemTotal*) echo 17179869184 ;;
      *NCPU*) echo 8 ;;
    esac
    ;;
  *ps*)
    case "$*" in
      *com.docker.compose.project*)
        [ "${STUB_COMPOSE:-0}" = 1 ] && echo cid
        ;;
      *'{{.Names}}'*)
        [ "${STUB_K3D:-0}" = 1 ] && echo k3d-fusion-server-0
        [ "${STUB_KIND:-0}" = 1 ] && echo fusion-kind-control-plane
        ;;
    esac
    ;;
esac
exit 0
STUB

cat > "$tmp/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
[ "${STUB_KUBECTL_FAIL:-0}" = 1 ] && exit 1
ns=""; prev=""
for arg in "$@"; do
  if [ "$prev" = namespace ]; then ns="$arg"; break; fi
  prev="$arg"
done
if [ -n "$ns" ]; then
  case " ${STUB_NAMESPACES:-} " in *" $ns "*) echo "namespace/$ns" ;; esac
  exit 0
fi
prev=""
for arg in "$@"; do
  if [ "$prev" = -n ]; then ns="$arg"; break; fi
  prev="$arg"
done
case " $* " in
  *" get pods "*)
    if [ -n "$ns" ]; then
      case " ${STUB_RUNNING_NS:-} " in *" $ns "*) echo pod/stand ;; esac
    fi
    ;;
esac
exit 0
STUB

cat > "$tmp/bin/k3d" <<'STUB'
#!/usr/bin/env bash
echo 'NAME SERVERS AGENTS LOADBALANCER'
STUB

chmod +x "$tmp/bin/docker" "$tmp/bin/kubectl" "$tmp/bin/k3d"
export PATH="$tmp/bin:$PATH"
export STAND_CONFIG_DIR="$tmp/config"

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

fresh() {
  rm -rf "$tmp/lock"
  mkdir -p "$tmp/lock"
  export STAND_LOCK_DIR="$tmp/lock"
  unset STAND_RUNTIME STAND_PUSH_IMAGES STAND_NAMESPACE STAND_LOCK_NAMESPACE STAND_MODE KUBE_CONTEXT
  export STUB_DOCKER_BROKEN=0 STUB_COMPOSE=0 STUB_K3D=0 STUB_KIND=0 STUB_KUBECTL_FAIL=0
  export STUB_NAMESPACES="" STUB_RUNNING_NS=""
}

record_count() { find "$STAND_LOCK_DIR" -name '*.lock' | wc -l | tr -d ' '; }
has_record() { [ -f "$STAND_LOCK_DIR/$1--$2.lock" ]; }

expect_ok() {
  if ! "$lock_script" "$@" >"$tmp/out" 2>&1; then
    cat "$tmp/out" >&2
    fail "expected success: $*"
  fi
}

expect_fail() {
  if "$lock_script" "$@" >"$tmp/out" 2>&1; then
    cat "$tmp/out" >&2
    fail "expected failure: $*"
  fi
}

run_k8s_lock() {
  (
    export STAND_RUNTIME=k3d STAND_MODE="${STAND_MODE:-dual}" KUBE_CONTEXT=test
    # shellcheck source=/dev/null
    source "$k8s_dir/lib.sh"
    stand_lock_acquire "$1"
  )
}

run_k8s_release() {
  (
    export STAND_RUNTIME=k3d STAND_MODE="${STAND_MODE:-dual}" KUBE_CONTEXT=test
    # shellcheck source=/dev/null
    source "$k8s_dir/lib.sh"
    stand_lock_release "$1"
  )
}

# dual: two k8s stands coexist, and releasing one keeps the other.
fresh
export STUB_K3D=1
expect_ok acquire k3s dev
expect_ok acquire k3s sanity
has_record k3s dev || fail 'dual: dev claim missing'
has_record k3s sanity || fail 'dual: sanity claim missing'
[ "$(record_count)" = 2 ] || fail 'dual: expected two claims'
expect_ok release k3s dev
has_record k3s dev && fail 'dual: dev claim not released'
has_record k3s sanity || fail 'dual: release removed the neighbor claim'

# dual through the k8s layer: no global acquire before the mode is known.
fresh
export STUB_K3D=1 STAND_MODE=dual
run_k8s_lock dev >/dev/null
run_k8s_lock sanity >/dev/null
has_record k3s dev || fail 'dual k8s: dev claim missing'
has_record k3s sanity || fail 'dual k8s: sanity claim missing'

# compose and k8s exclude each other in both directions.
fresh
export STUB_COMPOSE=1
expect_ok acquire compose sanity
expect_fail acquire k3s dev
has_record k3s dev && fail 'compose -> k3s conflict left a claim'
grep -q "compose stand 'sanity' is claimed" "$tmp/out" || fail 'compose -> k3s conflict message'

fresh
export STUB_K3D=1
expect_ok acquire k3s sanity
expect_fail acquire compose sanity
has_record compose sanity && fail 'k3s -> compose conflict left a claim'
grep -q "k3s stand 'sanity' is claimed" "$tmp/out" || fail 'k3s -> compose conflict message'

# single: a running neighbor namespace blocks the second stand through the k8s layer.
fresh
export STUB_K3D=1 STAND_MODE=single
run_k8s_lock dev >/dev/null
has_record k3s dev || fail 'single: dev claim missing'
# Before the first namespace exists the claim alone must block the second stand.
if run_k8s_lock sanity >"$tmp/out" 2>&1; then
  fail 'single: second k8s stand should be blocked by the claim'
fi
grep -q 'holds a claim' "$tmp/out" || fail 'single: missing claim block message'
has_record k3s sanity && fail 'single: blocked stand left a claim'
# A stand started without a claim is still caught by its namespace.
export STUB_NAMESPACES="fusion-dev" STUB_RUNNING_NS="fusion-dev"
if run_k8s_lock sanity >"$tmp/out" 2>&1; then
  fail 'single: second k8s stand should be blocked by the namespace'
fi
grep -q 'still running in fusion-dev' "$tmp/out" || fail 'single: missing namespace block message'
has_record k3s sanity && fail 'single: namespace-blocked stand left a claim'
has_record k3s dev || fail 'single: blocked stand removed the first claim'

# Repeated and nested claims: idempotent same key, release touches only its own claim. Compose is
# not up yet (dotest acquires before the build), so the outer claim must not be pruned.
fresh
export STUB_COMPOSE=0
expect_ok acquire compose dotest
expect_ok acquire compose sanity
expect_ok acquire compose sanity
[ "$(record_count)" = 2 ] || fail 'nested: repeated acquire duplicated a claim'
expect_ok release compose sanity
has_record compose sanity && fail 'nested: sanity claim not released'
has_record compose dotest || fail 'nested: release removed the outer claim'
expect_ok release compose dotest
[ "$(record_count)" = 0 ] || fail 'nested: claims left after release'

fresh
export STUB_K3D=0
expect_ok acquire k3s dotest
expect_ok acquire k3s sanity
expect_ok release k3s sanity
has_record k3s dotest || fail 'nested k3s: release removed the dotest claim'

# existing runtime without push: no Docker required, and a live claim is not stale.
fresh
export STAND_RUNTIME=existing STAND_PUSH_IMAGES=0 STUB_DOCKER_BROKEN=1 STUB_NAMESPACES="fusion-dev"
expect_ok acquire k3s dev
has_record k3s dev || fail 'existing: claim missing'
"$lock_script" status >"$tmp/out" 2>&1
grep -q 'k3s/dev.*state held' "$tmp/out" || fail 'existing: live claim reported stale without Docker'

# kind: the control-plane container is the live marker.
fresh
export STAND_RUNTIME=kind STUB_KIND=1
expect_ok acquire k3s dev
has_record k3s dev || fail 'kind: claim missing'
expect_fail acquire compose sanity
grep -q "k3s stand 'dev' is claimed" "$tmp/out" || fail 'kind: live claim not enforced'
export STUB_KIND=0
expect_ok acquire compose sanity
has_record compose sanity || fail 'kind: stopped cluster claim stayed live'

# A down nested in prepare keeps the claim: STAND_LOCK_KEEP=1 must not release it, so the claim
# still blocks the other backend across the removal phase. A plain down releases it.
fresh
export STUB_K3D=1
run_k8s_lock sanity >/dev/null
STAND_LOCK_KEEP=1 run_k8s_release sanity >/dev/null
has_record k3s sanity || fail 'keep: nested down released the claim'
expect_fail acquire compose sanity
grep -q "k3s stand 'sanity' is claimed" "$tmp/out" || fail 'keep: held claim did not block compose'
export STUB_K3D=0
run_k8s_release sanity >/dev/null
has_record k3s sanity && fail 'plain release kept the claim'
expect_ok acquire compose sanity
has_record compose sanity || fail 'plain release: compose claim missing'

# The single-owner $LOCK_DIR/active from the previous layout is a claim too: a live record blocks
# the other backend, a stale one is ignored, and acquire never deletes the file.
fresh
export STUB_K3D=1
printf 'k3s sanity 123 1\n' > "$STAND_LOCK_DIR/active"
expect_fail acquire compose sanity
grep -q 'legacy k3s claim' "$tmp/out" || fail 'legacy k3s live: missing block message'
has_record compose sanity && fail 'legacy k3s live: blocked acquire left a claim'
[ -f "$STAND_LOCK_DIR/active" ] || fail 'legacy k3s live: acquire removed the record'

fresh
export STUB_K3D=0
printf 'k3s sanity 123 1\n' > "$STAND_LOCK_DIR/active"
expect_ok acquire compose dotest
has_record compose dotest || fail 'legacy k3s stale: record still blocked compose'
grep -q 'ignoring stale legacy claim k3s/sanity' "$tmp/out" || fail 'legacy k3s stale: not reported'
[ -f "$STAND_LOCK_DIR/active" ] || fail 'legacy k3s stale: record deleted'

fresh
export STUB_COMPOSE=1
printf 'compose dotest 123 1\n' > "$STAND_LOCK_DIR/active"
expect_fail acquire k3s dev
grep -q 'legacy compose claim' "$tmp/out" || fail 'legacy compose live: missing block message'
has_record k3s dev && fail 'legacy compose live: blocked acquire left a claim'
[ -f "$STAND_LOCK_DIR/active" ] || fail 'legacy compose live: acquire removed the record'
export STUB_COMPOSE=0
expect_ok acquire compose sanity
[ -f "$STAND_LOCK_DIR/active" ] || fail 'legacy compose: same-backend acquire removed the record'

# A legacy k3s record on an existing cluster names no namespace, so kubectl cannot prove it gone.
fresh
export STAND_RUNTIME=existing STUB_K3D=0 STUB_KIND=0
printf 'k3s dev 123 1\n' > "$STAND_LOCK_DIR/active"
expect_fail acquire compose sanity
grep -q 'legacy k3s claim' "$tmp/out" || fail 'legacy k3s existing: unproven claim treated as stale'

# base-down style cleanup: every k3s claim goes, the compose claim and legacy compose stay.
fresh
export STUB_K3D=1
expect_ok acquire k3s dev
expect_ok acquire k3s sanity
expect_ok clear k3s
[ "$(record_count)" = 0 ] || fail 'clear k3s: claims left behind'

fresh
export STUB_COMPOSE=1
expect_ok acquire compose dotest
printf 'k3s|dev|k3d|fusion-dev||123|1\n' > "$STAND_LOCK_DIR/k3s--dev.lock"
printf 'compose dotest 123 1\n' > "$STAND_LOCK_DIR/active"
expect_ok clear k3s
has_record compose dotest || fail 'clear k3s: removed the compose claim'
has_record k3s dev && fail 'clear k3s: k3s claim left behind'
[ -f "$STAND_LOCK_DIR/active" ] || fail 'clear k3s: removed the legacy compose claim'

echo 'stand lock checks passed'
