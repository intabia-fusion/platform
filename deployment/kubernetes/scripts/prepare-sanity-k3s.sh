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
# Reset and seed the sanity stand in Kubernetes. Called (sourced) by
# tests/prepare-pg.sh; uses the active stand configuration from lib.sh:
# STAND_RUNTIME/KUBECONFIG/KUBE_CONTEXT/STAND_NAMESPACE (pnpm -w stand:configure).
# The actual work lives in prepare-test-stand.sh, shared with the ws/api stands.
set -euo pipefail
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

# Local LiveKit (started later by tests/prepare-pg.sh) posts webhooks to the stand.
SANITY_HOST="$(stand_host sanity)"
_STAND_HTTPS_PORT="$(published_https_port)"
export LIVEKIT_WEBHOOK_URL="https://${SANITY_HOST}:${_STAND_HTTPS_PORT}/_love/webhook"
export LIVEKIT_REDIS_ADDRESS=

# shellcheck source=prepare-test-stand.sh
source "$SCRIPT_DIR/prepare-test-stand.sh" sanity ${STAND_RUNTIME:+"$STAND_RUNTIME"}
