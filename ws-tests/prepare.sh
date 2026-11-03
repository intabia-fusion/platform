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
# Brings up the ws/api stand on the configured cluster and seeds it. Only the stand data is wiped.
# Usage: ./prepare.sh [ws|api], then cd sanity && pnpm run uitest:k8s.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAND_NAME="${STAND:-ws}"
case "$STAND_NAME" in
  ws|api) ;;
  *) echo "usage: ./prepare.sh [ws|api]" >&2; exit 2 ;;
esac

exec bash "$SCRIPT_DIR/../deployment/kubernetes/scripts/prepare-test-stand.sh" "$STAND_NAME" "$@"
