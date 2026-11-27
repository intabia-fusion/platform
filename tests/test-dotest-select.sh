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
# Offline checks for tests/dotest.sh: which preparation it picks per STAND_BACKEND/CLEAN, how the
# reset between iterations reaches the stand (in-cluster reseed for k3s, restore for Compose), and
# the claim release on exit. pnpm, node, the stand scripts and the lock command are stubs: no
# build, Docker, cluster or Playwright runs. tests/restore-pg.sh is the real one; only
# dev/test-base/run.sh below it and with-stand-env.sh are stubbed, so the backend routing is
# exercised as written.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/tests/sanity/runs" "$tmp/common/scripts" "$tmp/deployment/kubernetes/scripts" \
    "$tmp/dev/test-base" "$tmp/bin"
cp "$here/dotest.sh" "$here/restore-pg.sh" "$tmp/tests/"
touch "$tmp/tests/sanity/runs/run-file"

stub() {
    local path="$1"
    shift
    printf '#!/usr/bin/env bash\n%s\n' "$*" > "$path"
    chmod +x "$path"
}

stub "$tmp/bin/pnpm" 'printf "pnpm %s\n" "$*" >> "$CALLS"'
stub "$tmp/bin/node" 'printf "node %s\n" "$*" >> "$CALLS"'
stub "$tmp/tests/prepare-pg.sh" 'printf "prepare-pg %s\n" "$*" >> "$CALLS"; exit "${STUB_PREPARE_RC:-0}"'
stub "$tmp/dev/test-base/run.sh" '
printf "test-base %s backend=%s runtime=%s wrapped=%s\n" "$*" "${STAND_BACKEND:-unset}" "${STAND_RUNTIME:-unset}" "${STAND_ENV_WRAPPED:-0}" >> "$CALLS"'
stub "$tmp/deployment/kubernetes/scripts/prepare-test-stand.sh" \
    'printf "prepare-test-stand %s reuse=%s\n" "$*" "${STAND_REUSE:-0}" >> "$CALLS"'
stub "$tmp/deployment/kubernetes/scripts/push-images.sh" 'printf "push-images %s\n" "$*" >> "$CALLS"'
# Records the call, marks the environment it hands to the command, then runs it like the real one.
stub "$tmp/deployment/kubernetes/scripts/with-stand-env.sh" '
printf "with-stand-env %s\n" "$*" >> "$CALLS"
export STAND_ENV_WRAPPED=1
stand="$1"; shift
case "${1:-}" in k3d|kind|existing) shift ;; esac
exec "$@"'
stub "$tmp/common/scripts/stand-lock.sh" '
printf "lock %s\n" "$*" >> "$CALLS"
if [ "$1" = acquire ] && [ "${STUB_ACQUIRE_RC:-0}" != 0 ]; then exit "$STUB_ACQUIRE_RC"; fi'

fail() { echo "FAIL: $CASE: $*" >&2; sed 's/^/  /' "$state/out" >&2; exit 1; }
has() { grep -qxF -- "$1" "$calls" || fail "missing call '$1'"; }
hasnt() { if grep -qxF -- "$1" "$calls"; then fail "unexpected call '$1'"; fi; }
nomatch() { if grep -Eq -- "$1" "$calls"; then fail "unexpected call matching '$1'"; fi; }
count() { grep -cxF -- "$1" "$calls" || true; }
pos() { grep -nxF -- "$1" "$calls" | head -1 | cut -d: -f1; }
lastpos() { grep -nxF -- "$1" "$calls" | tail -1 | cut -d: -f1; }
before() {
    local a b
    a="$(pos "$1")"
    b="$(pos "$2")"
    [ -n "$a" ] && [ -n "$b" ] && [ "$a" -lt "$b" ] || fail "'$1' does not come before '$2'"
}

# run_dotest <case> <iterations> [env assignments...]
run_dotest() {
    CASE="$1"
    local iterations="$2" rc=0
    shift 2
    state="$tmp/$CASE"
    calls="$state/calls"
    rm -rf "$state"
    mkdir -p "$state"
    (cd "$tmp/tests" && env -u CLEAN -u STAND_BACKEND -u STAND_RUNTIME -u STAND_REUSE \
        PATH="$tmp/bin:$PATH" STATE="$state" CALLS="$calls" "$@" \
        bash ./dotest.sh "$iterations") > "$state/out" 2>&1 || rc=$?
    LAST_RC=$rc
}

# Compose, CLEAN=0: full prepare, no restore on the first run, claim released at the end.
run_dotest compose-reuse 1
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
has "lock acquire compose dotest"
has "prepare-pg "
nomatch '^test-base '
hasnt "prepare-test-stand "
has "lock release compose dotest"
before "prepare-pg " "pnpm run uitest:telemetry --workers 5"
before "pnpm run uitest:telemetry --workers 5" "lock release compose dotest"

# Compose, CLEAN=1: same full prepare - the containers must match the images just built.
run_dotest compose-clean 1 CLEAN=1
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
has "prepare-pg "
nomatch '^test-base '
hasnt "prepare-test-stand "
has "lock release compose dotest"

# Compose, second iteration: the plain Compose restore between runs, prepare once.
run_dotest compose-iterations 2
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
[ "$(count "prepare-pg ")" = 1 ] || fail "prepare-pg called $(count "prepare-pg ") times"
[ "$(count "pnpm run uitest:telemetry --workers 5")" = 2 ] || fail "runs: $(count "pnpm run uitest:telemetry --workers 5")"
has "test-base sanity restore backend=compose runtime=unset wrapped=0"
[ "$(count "test-base sanity restore backend=compose runtime=unset wrapped=0")" = 1 ] || fail "restore count"
nomatch '^with-stand-env .*dev/test-base/run\.sh'
restore_line="$(grep -nE '^test-base sanity restore ' "$calls" | cut -d: -f1)"
[ "$restore_line" -gt "$(pos "pnpm run uitest:telemetry --workers 5")" ] || fail "restore before the first run"
[ "$restore_line" -lt "$(lastpos "pnpm run uitest:telemetry --workers 5")" ] || fail "restore after the second run"
has "lock release compose dotest"

# k3s, CLEAN=0: in-place prepare with STAND_REUSE=1, runtime left to lib.sh when unset. No push
# here: prepare-test-stand.sh -> deploy.sh pushes once base-up has created the registry.
run_dotest k3s-reuse 1 STAND_BACKEND=k3s
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
has "lock acquire k3s dotest"
has "prepare-test-stand sanity reuse=1"
hasnt "prepare-pg "
nomatch '^test-base '
hasnt "push-images sanity"
has "with-stand-env sanity pnpm run uitest:telemetry --workers 5"
before "prepare-test-stand sanity reuse=1" "with-stand-env sanity pnpm run uitest:telemetry --workers 5"
has "lock release k3s dotest"

# k3s, CLEAN=1: full prepare without STAND_REUSE, explicit runtime passed through.
run_dotest k3s-clean 1 STAND_BACKEND=k3s CLEAN=1 STAND_RUNTIME=k3d
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
has "prepare-test-stand sanity k3d reuse=0"
nomatch '^test-base '
has "lock release k3s dotest"

# k3s, second iteration: the restore runs under with-stand-env with the queue disabled, because
# the broker advertises in-cluster DNS. prepare runs once; the restore sits between the runs.
run_dotest k3s-iterations 2 STAND_BACKEND=k3s STAND_RUNTIME=k3d
[ "$LAST_RC" = 0 ] || fail "exit $LAST_RC"
[ "$(count "prepare-test-stand sanity k3d reuse=1")" = 1 ] || fail "prepare-test-stand count: $(count "prepare-test-stand sanity k3d reuse=1")"
[ "$(count "pnpm run uitest:telemetry --workers 5")" = 2 ] || fail "runs: $(count "pnpm run uitest:telemetry --workers 5")"
[ "$(count "test-base sanity restore backend=k3s runtime=k3d wrapped=1")" = 1 ] || fail "restore count"
prepare="$(pos "prepare-test-stand sanity k3d reuse=1")"
restore="$(pos "test-base sanity restore backend=k3s runtime=k3d wrapped=1")"
run_first="$(pos "with-stand-env sanity pnpm run uitest:telemetry --workers 5")"
run_last="$(lastpos "with-stand-env sanity pnpm run uitest:telemetry --workers 5")"
[ "$prepare" -lt "$run_first" ] || fail "prepare after the first run"
[ "$run_first" -lt "$restore" ] || fail "restore before the first run"
[ "$restore" -lt "$run_last" ] || fail "restore after the second run"
hasnt "push-images sanity"
has "lock release k3s dotest"

# A direct k3s restore goes through with-stand-env and reaches the tool with backend=k3s.
state="$tmp/k3s-restore"
calls="$state/calls"
mkdir -p "$state"
(cd "$tmp/tests" && STAND_BACKEND=k3s CALLS="$calls" bash ./restore-pg.sh sanity) >"$state/out" 2>&1 || \
    fail "restore-pg.sh rejected a k3s stand"
grep -qxF 'test-base sanity restore backend=k3s runtime=unset wrapped=1' "$calls" || \
    fail "restore-pg.sh did not run the k3s restore"

# A failed prepare still releases the claim and keeps the failure exit code.
run_dotest compose-fail 1 STUB_PREPARE_RC=1
[ "$LAST_RC" != 0 ] || fail "a failed prepare exited 0"
has "lock release compose dotest"
nomatch '^pnpm run uitest:telemetry'

# A refused acquire (another record holds the host) must not release anything.
run_dotest acquire-refused 1 STUB_ACQUIRE_RC=1
[ "$LAST_RC" != 0 ] || fail "a refused acquire exited 0"
has "lock acquire compose dotest"
hasnt "lock release compose dotest"
hasnt "prepare-pg "

echo "dotest selection: all checks passed"
