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
# Single-stand lock (STAND_MODE=single in deployment/kubernetes/.env): one stand holds the VM at a
# time. dual leaves the lock alone - sanity and dev are sized to run together.
# Sourced by lib.sh; callers are deploy.sh (acquire) and down.sh (release).

STAND_LOCK_FILE="$K8S_DIR/.stand/active"
STAND_LOCK_STANDS="sanity dev ws api qms"

stand_mode() { printf '%s' "${STAND_MODE:-dual}"; }

stand_lock_owner() { cat "$STAND_LOCK_FILE" 2>/dev/null || true; }

stand_lock_down_command() {
  case "$1" in
    dev) printf 'pnpm -w stand:dev:down' ;;
    *) printf 'pnpm -w stand:test:down %s' "$1" ;;
  esac
}

stand_lock_acquire() {
  local stand="$1"
  [ "$(stand_mode)" = single ] || return 0
  local owner
  owner="$(stand_lock_owner)"
  if [ -n "$owner" ] && [ "$owner" != "$stand" ]; then
    die "STAND_MODE=single: '$owner' holds the stand lock. Stop it first: $(stand_lock_down_command "$owner"), or set STAND_MODE=dual in deployment/kubernetes/.env"
  fi
  if [ -z "$owner" ]; then
    local other ns
    for other in $STAND_LOCK_STANDS; do
      [ "$other" = "$stand" ] && continue
      ns="$(stand_namespace "$other" 2>/dev/null || true)"
      [ -n "$ns" ] || continue
      if kc get namespace "$ns" >/dev/null 2>&1 && \
         [ -n "$(kc -n "$ns" get pods --field-selector=status.phase=Running -o name 2>/dev/null)" ]; then
        die "STAND_MODE=single: '$other' is still running in $ns. Stop it first: $(stand_lock_down_command "$other")"
      fi
    done
  fi
  mkdir -p "$(dirname "$STAND_LOCK_FILE")"
  printf '%s\n' "$stand" > "$STAND_LOCK_FILE"
  log "stand lock: $stand (STAND_MODE=single)"
}

stand_lock_release() {
  local stand="$1"
  if [ "$(stand_lock_owner)" = "$stand" ]; then
    rm -f "$STAND_LOCK_FILE"
    log "stand lock released: $stand"
  fi
  return 0
}
