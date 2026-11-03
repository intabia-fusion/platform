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
# Scale the dev stand to zero: every Deployment and StatefulSet in the resolved
# dev namespace goes to replicas=0. The Helm release, Services, Ingress, PVCs,
# platform-base and all data stay untouched - nothing is deleted or created.
# Idempotent: an already-paused stand passes through.
#
#   dev-pause.sh [k3d|kind|existing]
#
# Resume: pnpm -w stand:dev:resume (dev-up.sh --no-push) or stand:dev:up.
# Note: the fusion-dev-front webpack container (stand:dev:front) is a plain
# Docker container, pause does not stop it - stop it separately with
# stand:dev:front:down if needed.
set -euo pipefail
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
[ $# -eq 0 ] || { echo "usage: dev-pause.sh [k3d|kind|existing]" >&2; exit 2; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_tools
ensure_cluster
NS="$(stand_namespace dev)"
[ -n "$NS" ] || die "cannot resolve the dev namespace - check stands/dev values"
[ "$NS" != "$BASE_NAMESPACE" ] || die "refusing to pause '$NS': that is the platform-base namespace"

kc get namespace "$NS" >/dev/null 2>&1 || { log "namespace $NS does not exist - nothing to pause"; exit 0; }

deploys="$(kc -n "$NS" get deployments -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
sts="$(kc -n "$NS" get statefulsets -o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true)"
if [ -z "$deploys$sts" ]; then
  log "no Deployments or StatefulSets in $NS - nothing to pause"
  exit 0
fi

# Idempotent: scaling an already-0 workload is a no-op.
[ -z "$deploys" ] || kc -n "$NS" scale --replicas=0 deployment $deploys >/dev/null
[ -z "$sts" ] || kc -n "$NS" scale --replicas=0 statefulset $sts >/dev/null
log "scaled to 0 in $NS: $(echo $deploys $sts | tr ' ' ',')"

# Bounded wait for the pods to drain.
deadline=$((SECONDS + 180))
while [ -n "$(kc -n "$NS" get pods -o name 2>/dev/null || true)" ]; do
  if [ $SECONDS -ge $deadline ]; then
    warn "pods in $NS did not terminate within 180s"
    kc -n "$NS" get pods -o wide || true
    exit 1
  fi
  sleep 2
done
log "dev stand paused (namespace $NS, 0 pods)"
echo "resume with: pnpm -w stand:dev:resume (or stand:dev:up)"
