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
# Stand locks. The host-wide claims (common/scripts/stand-lock.sh) keep a compose stand and any
# k8s stand apart; several k8s stands may be claimed together in dual. STAND_MODE=single adds the
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
  local stand="$1" other ns other_ns reason
  ns="$(stand_namespace "$stand" 2>/dev/null || true)"
  # The claim records the namespace, so liveness of this stand is checked against kubectl for the
  # existing runtime and against the cluster container for k3d/kind.
  STAND_LOCK_NAMESPACE="$ns" "$STAND_LOCK_SCRIPT" acquire k3s "$stand"
  [ "$(stand_mode)" = single ] || return 0
  for other in $STAND_LOCK_STANDS; do
    [ "$other" = "$stand" ] && continue
    reason=""
    other_ns="$(stand_namespace "$other" 2>/dev/null || true)"
    if [ -n "$other_ns" ] && kc get namespace "$other_ns" >/dev/null 2>&1 && \
       [ -n "$(kc -n "$other_ns" get pods --field-selector=status.phase=Running -o name 2>/dev/null)" ]; then
      reason="is still running in $other_ns"
    elif "$STAND_LOCK_SCRIPT" held k3s "$other"; then
      # Covers the window between the claim and the namespace creation.
      reason="holds a claim on this host"
    fi
    [ -n "$reason" ] || continue
    "$STAND_LOCK_SCRIPT" release k3s "$stand" || true
    die "STAND_MODE=single: '$other' $reason. Stop it first: $(stand_lock_down_command "$other")"
  done
  log "stand lock: $stand (STAND_MODE=single)"
}

# STAND_LOCK_KEEP=1 keeps the claim: an enclosing prepare calls down mid-run and still owns it.
stand_lock_release() {
  [ "${STAND_LOCK_KEEP:-0}" = 1 ] && return 0
  "$STAND_LOCK_SCRIPT" release k3s "$1" || true
  return 0
}
