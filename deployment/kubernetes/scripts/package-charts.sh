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
# Package the platform charts with the release version, ready for a Helm repo.
#   package-charts.sh [vX.Y.Z] [outdir]
# Version defaults to the latest git tag; the chart version drops the leading v.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

VERSION="${1:-$(git -C "$REPO_ROOT" describe --tags --abbrev=0)}"
[ -n "$VERSION" ] || { echo "usage: $0 [vX.Y.Z] [outdir]" >&2; exit 2; }
CHART_VERSION="${VERSION#v}"
OUT="${2:-$REPO_ROOT/dist/charts}"

command -v helm >/dev/null 2>&1 || { echo "helm is required" >&2; exit 2; }
mkdir -p "$OUT"

echo ">> packaging charts $CHART_VERSION into $OUT"
# The chart ships the hand-tuned indexes as files/indexes.yaml; copy them from the repository so a
# release never carries indexes older than this commit.
cp "$REPO_ROOT/tests/indexes.yaml" "$K8S_DIR/charts/platform/files/indexes.yaml"
helm lint "$K8S_DIR/charts/platform-base" >/dev/null
# The platform chart resolves the base contract with lookup; offline lint needs the fake one.
helm lint "$K8S_DIR/charts/platform" -f "$K8S_DIR/stands/ci/render-check.yaml" >/dev/null
helm package --version "$CHART_VERSION" --app-version "$CHART_VERSION" \
  --destination "$OUT" "$K8S_DIR/charts/platform-base" >/dev/null
helm package --version "$CHART_VERSION" --app-version "$CHART_VERSION" \
  --destination "$OUT" "$K8S_DIR/charts/platform" >/dev/null

ls -1 "$OUT"/*-"$CHART_VERSION".tgz
