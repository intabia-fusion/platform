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
# One stand per host, whichever backend runs it: a compose stand and a k3d cluster share the same
# Docker VM, and both suites talk to :8083 by default. The lock is a pid file, so a stand that died
# without going down does not block the next one; running containers of the other backend block
# regardless of what the file says.
#
#   stand-lock.sh acquire <compose|k3s> <stand>   # before bringing a stand up
#   stand-lock.sh release <compose|k3s> <stand>   # when the stand is gone
#   stand-lock.sh status
#
# STAND_SKIP_LOCK=1 skips the lock, STAND_SKIP_RESOURCE_CHECK=1 skips the resource check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCK_DIR="${STAND_LOCK_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/fusion-stand}"
LOCK_FILE="$LOCK_DIR/active"
COMPOSE_PROJECT="${STAND_COMPOSE_PROJECT:-sanity}"
K3D_SERVER_CONTAINER="${STAND_K3D_SERVER_CONTAINER:-k3d-fusion-server-0}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Container memory and free disk the backend needs; both are read from Docker, not the host, since
# that is the memory the stand lives in.
min_mem_gb() { [ "$1" = compose ] && echo "${STAND_MIN_MEM_GB:-6}" || echo "${STAND_MIN_MEM_GB:-10}"; }
min_disk_gb() { [ "$1" = compose ] && echo "${STAND_MIN_DISK_GB:-15}" || echo "${STAND_MIN_DISK_GB:-25}"; }

compose_running() {
  command -v docker >/dev/null 2>&1 || return 1
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" 2>/dev/null)" ]
}

k3s_running() {
  command -v docker >/dev/null 2>&1 || return 1
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$K3D_SERVER_CONTAINER"
}

stop_hint() {
  case "$1" in
    compose) echo "cd tests && docker compose -p $COMPOSE_PROJECT down --volumes" ;;
    k3s) echo "pnpm -w stand:test:down $2 (or stand:dev:down)" ;;
  esac
}

check_resources() {
  local backend="$1" mem_bytes mem_gb disk_kb disk_gb ncpu need_mem need_disk
  [ "${STAND_SKIP_RESOURCE_CHECK:-0}" = 1 ] && return 0
  command -v docker >/dev/null 2>&1 || die "docker is not available"
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

owner_gone() {
  # The prepare/deploy command exits once the stand is up, so the pid says nothing about the
  # stand. Reality does: no containers of that backend means the stand is gone.
  case "$1" in
    compose) ! compose_running ;;
    k3s) ! k3s_running ;;
    *) return 1 ;;
  esac
}

cmd_acquire() {
  local backend="$1" stand="$2" owner_backend owner_stand
  [ "${STAND_SKIP_LOCK:-0}" = 1 ] && return 0
  case "$backend" in compose|k3s) ;; *) die "unknown backend '$backend' (compose|k3s)" ;; esac

  check_resources "$backend"

  if [ -f "$LOCK_FILE" ]; then
    read -r owner_backend owner_stand _ < "$LOCK_FILE" || true
    if [ "$owner_backend" = "$backend" ] && [ "$owner_stand" = "$stand" ]; then
      printf 'lock: %s/%s already held\n' "$backend" "$stand"
    elif owner_gone "$owner_backend"; then
      printf 'lock: stale entry for %s/%s, taking over\n' "$owner_backend" "$owner_stand"
      rm -f "$LOCK_FILE"
    else
      die "$owner_backend stand '$owner_stand' is up. Stop it: $(stop_hint "$owner_backend" "$owner_stand")"
    fi
  fi

  if [ "$backend" = compose ] && k3s_running; then
    die "a k3d cluster is running ($K3D_SERVER_CONTAINER); stop it first: pnpm -w stand:base:down --delete-data"
  fi
  if [ "$backend" = k3s ] && compose_running; then
    die "a compose stand is running (project $COMPOSE_PROJECT); stop it first: $(stop_hint compose)"
  fi

  mkdir -p "$LOCK_DIR"
  printf '%s %s %s %s\n' "$backend" "$stand" "$$" "$(date +%s)" > "$LOCK_FILE"
  printf 'lock: %s/%s acquired\n' "$backend" "$stand"
}

cmd_release() {
  local backend="$1" stand="$2" owner_backend owner_stand
  [ -f "$LOCK_FILE" ] || return 0
  read -r owner_backend owner_stand _ < "$LOCK_FILE" || true
  if [ "$owner_backend" = "$backend" ] && [ "$owner_stand" = "$stand" ]; then
    rm -f "$LOCK_FILE"
    printf 'lock: %s/%s released\n' "$backend" "$stand"
  fi
}

cmd_status() {
  if [ -f "$LOCK_FILE" ]; then
    read -r owner_backend owner_stand pid started < "$LOCK_FILE" || true
    local state=held
    owner_gone "$owner_backend" && state=stale
    printf 'lock: %s/%s pid %s state %s\n' "$owner_backend" "$owner_stand" "$pid" "$state"
  else
    echo "lock: free"
  fi
  compose_running && echo "compose: running (project $COMPOSE_PROJECT)" || echo "compose: stopped"
  k3s_running && echo "k3d: cluster running" || echo "k3d: cluster stopped"
}

case "${1:-}" in
  acquire) [ $# -ge 3 ] || die "usage: stand-lock.sh acquire <compose|k3s> <stand>"; cmd_acquire "$2" "$3" ;;
  release) [ $# -ge 3 ] || die "usage: stand-lock.sh release <compose|k3s> <stand>"; cmd_release "$2" "$3" ;;
  status) cmd_status ;;
  *) die "usage: stand-lock.sh <acquire|release|status> [backend] [stand]" ;;
esac
