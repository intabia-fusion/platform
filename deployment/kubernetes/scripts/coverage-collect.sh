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
# Collect V8 coverage profiles of a STAND_COVERAGE=true stand into a host
# directory, in the layout `pnpm coverage:stand` consumes:
#
#   coverage-collect.sh <stand> [k3d|kind|existing] <dest-dir>
#
# Pods only write their V8 profile as they exit, so the stand is scaled down
# first (SIGTERM -> graceful exit -> profile flush into the shared PVC), then a
# throwaway collector pod copies /coverage out through kubectl. The caller is
# expected to take the stand down afterwards (the PVC dies with the namespace).
set -euo pipefail
STAND="${1:?usage: coverage-collect.sh <stand> [runtime] <dest-dir>}"; shift || true
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
DEST="${1:?usage: coverage-collect.sh <stand> [runtime] <dest-dir>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

NS="$(stand_namespace "$STAND")"
[ -n "$NS" ] || die "cannot resolve namespace for stand '$STAND'"
kc -n "$NS" get pvc stand-coverage >/dev/null 2>&1 || \
  die "no stand-coverage PVC in $NS - was the stand deployed with STAND_COVERAGE=true?"

# Collector image: platform-base already pulled the postgres image, so this works
# on clusters without general internet access as well.
PG_IMAGE="${POSTGRES_IMAGE:-postgres:18.1}"
POD=stand-coverage-collector
cleanup() {
  kc -n "$NS" delete pod "$POD" --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "scaling down $STAND deployments so pods flush their coverage profiles"
kc -n "$NS" scale deployment --all --replicas=0
# A stand-tool pod left behind by an interrupted prepare has no profiles but would
# keep `wait --for=delete pod --all` hanging.
kc -n "$NS" delete pod stand-tool --wait=false >/dev/null 2>&1 || true
if ! kc -n "$NS" wait --for=delete pod --all --timeout=240s >/dev/null 2>&1; then
  warn "some pods did not exit within 240s; their profiles are lost"
  kc -n "$NS" get pods || true
fi

cleanup
kc apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $POD
  namespace: $NS
spec:
  restartPolicy: Never
  containers:
  - name: collector
    image: $PG_IMAGE
    command: ["sh", "-c", "sleep 600"]
    volumeMounts:
    - name: coverage
      mountPath: /coverage
  volumes:
  - name: coverage
    persistentVolumeClaim:
      claimName: stand-coverage
EOF
kc -n "$NS" wait --for=condition=Ready "pod/$POD" --timeout=120s

log "copying profiles to $DEST"
mkdir -p "$DEST"
kc -n "$NS" exec "$POD" -- tar -C /coverage -czf - . | tar -C "$DEST" -xzf -

cleanup
trap - EXIT
log "coverage profiles collected into $DEST"
