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
# Stand claims. A compose stand and a k8s stand share the host Docker VM and the test ports, so
# they exclude each other. Several k8s stands coexist in dual (STAND_MODE is enforced by the k8s
# layer); there is one compose project, so extra compose claims are nested claims on the same
# stand. Every claim is its own file, so releasing one never touches another.
#
#   stand-lock.sh acquire <compose|k3s> <stand>   # before bringing a stand up
#   stand-lock.sh release <compose|k3s> <stand>   # when that claim is done
#   stand-lock.sh clear <compose|k3s>             # drop every claim of one backend
#   stand-lock.sh held <compose|k3s> <stand>      # exit 0 when that claim is alive
#   stand-lock.sh status
#
# A claim records the runtime and namespace, so liveness is checked against the actual stand and
# not against Docker alone: a k3d/kind cluster is local, an existing cluster lives behind kubectl.
# STAND_SKIP_LOCK=1 skips the lock, STAND_SKIP_RESOURCE_CHECK=1 skips the resource check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCK_DIR="${STAND_LOCK_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/fusion-stand}"
LEGACY_LOCK_FILE="$LOCK_DIR/active"
COMPOSE_PROJECT="${STAND_COMPOSE_PROJECT:-sanity}"
K3D_SERVER_CONTAINER="${STAND_K3D_SERVER_CONTAINER:-k3d-fusion-server-0}"
KIND_CONTROL_CONTAINER="${STAND_KIND_CONTROL_CONTAINER:-fusion-kind-control-plane}"
K3D_CONTEXT="${STAND_K3D_CONTEXT:-k3d-fusion}"
KIND_CONTEXT="${STAND_KIND_CONTEXT:-kind-fusion-kind}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Container memory and free disk the backend needs; both are read from Docker, not the host, since
# that is the memory the stand lives in.
min_mem_gb() { [ "$1" = compose ] && echo "${STAND_MIN_MEM_GB:-6}" || echo "${STAND_MIN_MEM_GB:-10}"; }
min_disk_gb() { [ "$1" = compose ] && echo "${STAND_MIN_DISK_GB:-15}" || echo "${STAND_MIN_DISK_GB:-25}"; }

docker_available() { command -v docker >/dev/null 2>&1; }

compose_running() {
  docker_available || return 1
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" 2>/dev/null)" ]
}

k3d_running() {
  docker_available || return 1
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$K3D_SERVER_CONTAINER"
}

kind_running() {
  docker_available || return 1
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$KIND_CONTROL_CONTAINER"
}

local_cluster_running() { k3d_running || kind_running; }

stop_hint() {
  case "$1" in
    compose) echo "cd tests && docker compose -p $COMPOSE_PROJECT down --volumes" ;;
    k3s) echo "pnpm -w stand:test:down $2 (or stand:dev:down)" ;;
  esac
}

runtime_of() {
  local backend="$1"
  if [ "$backend" = compose ]; then
    printf 'compose'
  else
    printf '%s' "${STAND_RUNTIME:-k3d}"
  fi
}

context_of() {
  local runtime="$1" ctx="${STAND_LOCK_CONTEXT:-${KUBE_CONTEXT:-}}"
  if [ -z "$ctx" ]; then
    case "$runtime" in
      k3d) ctx="$K3D_CONTEXT" ;;
      kind) ctx="$KIND_CONTEXT" ;;
    esac
  fi
  printf '%s' "$ctx"
}

# The namespace a claim belongs to. The k8s layer passes the exact one; direct callers
# (tests/dotest.sh, dev/test-base/run.sh) fall back to the stand values.
namespace_of() {
  local stand="$1" runtime="$2" dir files=()
  if [ -n "${STAND_LOCK_NAMESPACE:-}" ]; then
    printf '%s' "$STAND_LOCK_NAMESPACE"
    return 0
  fi
  if [ -n "${STAND_NAMESPACE:-}" ]; then
    printf '%s' "$STAND_NAMESPACE"
    return 0
  fi
  case "$stand" in ''|*[!A-Za-z0-9_.-]*) return 0 ;; esac
  dir="$REPO_ROOT/deployment/kubernetes/stands/$stand"
  [ -f "$dir/values.yaml" ] || return 0
  files=("$dir/values.yaml")
  case "$runtime" in
    kind) [ -f "$dir/values.kind.yaml" ] && files+=("$dir/values.kind.yaml") ;;
    existing) [ -f "$dir/values.existing.yaml" ] && files+=("$dir/values.existing.yaml") ;;
  esac
  grep -h '^  namespace:' "${files[@]}" | tail -1 | awk '{print $2}' | tr -d '"'
}

record_path() { printf '%s/%s--%s.lock' "$LOCK_DIR" "$1" "$2"; }

REC_BACKEND=""; REC_STAND=""; REC_RUNTIME=""; REC_NAMESPACE=""; REC_CONTEXT=""; REC_PID=""
parse_record() {
  REC_BACKEND=""; REC_STAND=""; REC_RUNTIME=""; REC_NAMESPACE=""; REC_CONTEXT=""; REC_PID=""
  IFS='|' read -r REC_BACKEND REC_STAND REC_RUNTIME REC_NAMESPACE REC_CONTEXT REC_PID _ < "$1" || true
}

# exists | absent | unknown. A failed kubectl call is unknown, never absent: an unreachable
# cluster must not make another stand's claim look stale.
namespace_state() {
  local ns="$1" ctx="$2" out args=()
  command -v kubectl >/dev/null 2>&1 || { printf 'unknown'; return 0; }
  if [ -n "$ctx" ]; then args+=(--context "$ctx"); fi
  if out="$(kubectl "${args[@]}" get namespace "$ns" --ignore-not-found -o name 2>/dev/null)"; then
    if [ -n "$out" ]; then printf 'exists'; else printf 'absent'; fi
  else
    printf 'unknown'
  fi
}

owner_gone() {
  # The prepare/deploy command exits once the stand is up, so the pid says nothing about the
  # stand. Reality does; when reality cannot be checked, the claim is kept (not stale).
  local backend="$1" runtime="$2" ns="$3" ctx="$4"
  case "$backend" in
    compose)
      docker_available || return 1
      ! compose_running
      ;;
    k3s)
      case "${runtime:-k3d}" in
        k3d)
          docker_available || return 1
          ! k3d_running
          ;;
        kind)
          docker_available || return 1
          ! kind_running
          ;;
        existing)
          [ -n "$ns" ] || return 1
          [ "$(namespace_state "$ns" "$ctx")" = absent ]
          ;;
        *) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

# A claim from the single-owner layout: "backend stand pid started", with no runtime, namespace or
# context, so only a positive signal proves it live. Docker unavailable, or k3s with the existing
# runtime (a record cannot name the namespace to ask kubectl about), leaves it unproven and live.
legacy_claim_gone() {
  case "$1" in
    compose) owner_gone compose "" "" "" ;;
    k3s)
      docker_available || return 1
      local_cluster_running && return 1
      [ "$(runtime_of k3s)" = existing ] && return 1
      return 0
      ;;
    *) return 1 ;;
  esac
}

LEGACY_BACKEND=""; LEGACY_STAND=""; LEGACY_PID=""
parse_legacy() {
  [ -f "$LEGACY_LOCK_FILE" ] || return 1
  LEGACY_BACKEND=""; LEGACY_STAND=""; LEGACY_PID=""
  read -r LEGACY_BACKEND LEGACY_STAND LEGACY_PID _ < "$LEGACY_LOCK_FILE" || true
}

check_resources() {
  local backend="$1" runtime mem_bytes mem_gb disk_kb disk_gb ncpu need_mem need_disk
  [ "${STAND_SKIP_RESOURCE_CHECK:-0}" = 1 ] && return 0
  runtime="$(runtime_of "$backend")"
  if [ "$backend" = k3s ] && [ "$runtime" = existing ] && [ "${STAND_PUSH_IMAGES:-0}" != 1 ]; then
    printf 'resources: existing cluster, local Docker checks skipped\n'
    return 0
  fi
  docker_available || die "docker is not available"
  mem_bytes="$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo 0)"
  ncpu="$(docker info --format '{{.NCPU}}' 2>/dev/null || echo 0)"
  mem_gb=$((mem_bytes / 1024 / 1024 / 1024))
  disk_kb="$(df -Pk "$REPO_ROOT" | awk 'NR==2 {print $4}')"
  disk_gb=$((disk_kb / 1024 / 1024))
  need_mem="$(min_mem_gb "$backend")"
  need_disk="$(min_disk_gb "$backend")"
  printf 'resources: docker mem %s GiB (need %s), cpus %s (need 4), disk %s GiB free (need %s)\n' \
    "$mem_gb" "$need_mem" "$ncpu" "$disk_gb" "$need_disk"
  [ "$mem_gb" -ge "$need_mem" ] || die "not enough memory for a $backend stand: $mem_gb GiB < $need_mem GiB (raise Docker Desktop memory or set STAND_MIN_MEM_GB)"
  [ "$ncpu" -ge 4 ] || die "not enough cpus for a $backend stand: $ncpu < 4"
  [ "$disk_gb" -ge "$need_disk" ] || die "not enough disk for a $backend stand: $disk_gb GiB free < $need_disk GiB"
}

valid_backend() {
  case "$1" in compose|k3s) ;; *) die "unknown backend '$1' (compose|k3s)" ;; esac
}

valid_stand() {
  case "$1" in
    ''|*[!A-Za-z0-9_.-]*) die "invalid stand name '$1' (letters, digits, '.', '_', '-')" ;;
  esac
}

cmd_acquire() {
  local backend="$1" stand="$2" own file owner_backend owner_stand runtime ns ctx tmp
  [ "${STAND_SKIP_LOCK:-0}" = 1 ] && return 0
  valid_backend "$backend"
  valid_stand "$stand"

  check_resources "$backend"
  runtime="$(runtime_of "$backend")"

  mkdir -p "$LOCK_DIR"

  own="$(record_path "$backend" "$stand")"
  if [ -f "$own" ]; then
    printf 'lock: %s/%s already held\n' "$backend" "$stand"
    return 0
  fi

  # k3s claims coexist (dual); a compose claim and a k8s claim do not. A stale claim of the other
  # backend is ignored, never removed here: an acquire must not delete another caller's record.
  for file in "$LOCK_DIR"/*.lock; do
    [ -e "$file" ] || continue
    parse_record "$file"
    [ "$REC_BACKEND" = "$backend" ] && continue
    if owner_gone "$REC_BACKEND" "$REC_RUNTIME" "$REC_NAMESPACE" "$REC_CONTEXT"; then
      printf 'lock: ignoring stale claim %s/%s\n' "$REC_BACKEND" "$REC_STAND"
      continue
    fi
    owner_backend="$REC_BACKEND"
    owner_stand="$REC_STAND"
    die "$owner_backend stand '$owner_stand' is claimed on this host. Stop it: $(stop_hint "$owner_backend" "$owner_stand")"
  done

  # The single-owner layout record is another claim: a live one blocks the other backend, a stale
  # one is ignored. Never removed here, same as the per-stand records.
  if parse_legacy; then
    [ -n "$LEGACY_BACKEND" ] || \
      die "legacy claim file $LEGACY_LOCK_FILE is empty or unreadable; inspect it and remove it by hand"
    if [ "$LEGACY_BACKEND" != "$backend" ]; then
      if legacy_claim_gone "$LEGACY_BACKEND"; then
        printf 'lock: ignoring stale legacy claim %s/%s\n' "$LEGACY_BACKEND" "${LEGACY_STAND:--}"
      else
        die "legacy $LEGACY_BACKEND claim '${LEGACY_STAND:--}' is still live ($LEGACY_LOCK_FILE). Stop it: $(stop_hint "$LEGACY_BACKEND" "$LEGACY_STAND"), or drop the record: $0 clear $LEGACY_BACKEND"
      fi
    fi
  fi

  if [ "$backend" = compose ] && local_cluster_running; then
    die "a local k8s cluster is running ($K3D_SERVER_CONTAINER / $KIND_CONTROL_CONTAINER); stop it first: pnpm -w stand:base:down --delete-data"
  fi
  if [ "$backend" = k3s ] && compose_running; then
    die "a compose stand is running (project $COMPOSE_PROJECT); stop it first: $(stop_hint compose)"
  fi

  ns="$(namespace_of "$stand" "$runtime")"
  ctx="$(context_of "$runtime")"
  tmp="$own.tmp.$$"
  printf '%s|%s|%s|%s|%s|%s|%s\n' "$backend" "$stand" "$runtime" "$ns" "$ctx" "$$" "$(date +%s)" > "$tmp"
  mv -f "$tmp" "$own"
  printf 'lock: %s/%s acquired\n' "$backend" "$stand"
}

cmd_release() {
  local backend="$1" stand="$2" own
  valid_backend "$backend"
  valid_stand "$stand"
  own="$(record_path "$backend" "$stand")"
  if [ -f "$own" ]; then
    rm -f "$own"
    printf 'lock: %s/%s released\n' "$backend" "$stand"
  fi
}

# True when the claim exists and its stand is still alive. Used by the k8s single-mode check
# before the stand namespace has been created.
cmd_held() {
  local backend="$1" stand="$2" own
  valid_backend "$backend"
  valid_stand "$stand"
  own="$(record_path "$backend" "$stand")"
  [ -f "$own" ] || return 1
  parse_record "$own"
  ! owner_gone "$REC_BACKEND" "$REC_RUNTIME" "$REC_NAMESPACE" "$REC_CONTEXT"
}

cmd_clear() {
  local backend="$1" file count=0 legacy_backend
  valid_backend "$backend"
  for file in "$LOCK_DIR/$backend--"*.lock; do
    [ -e "$file" ] || continue
    rm -f "$file"
    count=$((count + 1))
  done
  # A claim from the single-owner layout (one `active` file); only the requested backend goes.
  # Format: `backend stand pid started`, with no runtime, namespace or context.
  if [ -f "$LEGACY_LOCK_FILE" ]; then
    read -r legacy_backend _ < "$LEGACY_LOCK_FILE" || true
    if [ "${legacy_backend:-}" = "$backend" ]; then
      rm -f "$LEGACY_LOCK_FILE"
      count=$((count + 1))
    fi
  fi
  printf 'lock: cleared %s %s claim(s)\n' "$count" "$backend"
}

cmd_status() {
  local file found=0 state
  if [ -d "$LOCK_DIR" ]; then
    for file in "$LOCK_DIR"/*.lock; do
      [ -e "$file" ] || continue
      found=1
      parse_record "$file"
      state=held
      owner_gone "$REC_BACKEND" "$REC_RUNTIME" "$REC_NAMESPACE" "$REC_CONTEXT" && state=stale
      printf 'lock: %s/%s pid %s state %s runtime %s ns %s\n' \
        "$REC_BACKEND" "$REC_STAND" "$REC_PID" "$state" "$REC_RUNTIME" "${REC_NAMESPACE:--}"
    done
  fi
  [ "$found" = 1 ] || echo "lock: free"
  if parse_legacy; then
    if [ -z "$LEGACY_BACKEND" ]; then
      printf 'lock: legacy file %s is empty or unreadable\n' "$LEGACY_LOCK_FILE"
    else
      state=held
      legacy_claim_gone "$LEGACY_BACKEND" && state=stale
      printf 'lock: legacy %s/%s pid %s state %s\n' \
        "$LEGACY_BACKEND" "${LEGACY_STAND:--}" "${LEGACY_PID:--}" "$state"
    fi
  fi
  compose_running && echo "compose: running (project $COMPOSE_PROJECT)" || echo "compose: stopped"
  k3d_running && echo "k3d: cluster running" || echo "k3d: cluster stopped"
  kind_running && echo "kind: cluster running" || echo "kind: cluster stopped"
}

case "${1:-}" in
  acquire) [ $# -ge 3 ] || die "usage: stand-lock.sh acquire <compose|k3s> <stand>"; cmd_acquire "$2" "$3" ;;
  release) [ $# -ge 3 ] || die "usage: stand-lock.sh release <compose|k3s> <stand>"; cmd_release "$2" "$3" ;;
  clear) [ $# -ge 2 ] || die "usage: stand-lock.sh clear <compose|k3s>"; cmd_clear "$2" ;;
  held) [ $# -ge 3 ] || die "usage: stand-lock.sh held <compose|k3s> <stand>"; cmd_held "$2" "$3" ;;
  status) cmd_status ;;
  *) die "usage: stand-lock.sh <acquire|release|clear|held|status> [backend] [stand]" ;;
esac
