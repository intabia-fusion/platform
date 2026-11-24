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
# Stand locks. The host-wide lock (common/scripts/stand-lock.sh) keeps one stand per host across
# backends: a compose stand and a k3d cluster cannot run together. STAND_MODE=single adds the
# k8s-only rule on top - one stand namespace at a time. Sourced by lib.sh; callers are deploy.sh
# (acquire) and down.sh (release).

STAND_LOCK_SCRIPT="$K8S_DIR/../../common/scripts/stand-lock.sh"
STAND_LOCK_STANDS="sanity dev ws api qms"

stand_mode() { printf '%s' "${STAND_MODE:-dual}"; }

stand_lock_down_command() {
  case "$1" in
    dev) printf 'pnpm -w stand:dev:down' ;;
    *) printf 'pnpm -w stand:test:down %s' "$1" ;;
  esac
}

stand_lock_acquire() {
  local stand="$1"
  "$STAND_LOCK_SCRIPT" acquire k3s "$stand"
  [ "$(stand_mode)" = single ] || return 0
  local other ns
  for other in $STAND_LOCK_STANDS; do
    [ "$other" = "$stand" ] && continue
    ns="$(stand_namespace "$other" 2>/dev/null || true)"
    [ -n "$ns" ] || continue
    if kc get namespace "$ns" >/dev/null 2>&1 && \
       [ -n "$(kc -n "$ns" get pods --field-selector=status.phase=Running -o name 2>/dev/null)" ]; then
      "$STAND_LOCK_SCRIPT" release k3s "$stand" || true
      die "STAND_MODE=single: '$other' is still running in $ns. Stop it first: $(stand_lock_down_command "$other")"
    fi
  done
  log "stand lock: $stand (STAND_MODE=single)"
}

stand_lock_release() {
  "$STAND_LOCK_SCRIPT" release k3s "$1" || true
  return 0
}
