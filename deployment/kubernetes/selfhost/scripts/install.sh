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
# Install or upgrade the platform from the published charts.
#   PROFILE=bundled PLATFORM_VERSION=v0.8.37 ./scripts/install.sh
#   PROFILE=external PLATFORM_VERSION=v0.8.37 ./scripts/install.sh
# Both helm releases are idempotent: the same command upgrades an existing installation.
#
# DIFF=1 renders the same two releases as a helm diff instead of applying them (needs the
# helm-diff plugin); scripts/diff.sh is a wrapper for it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

PROFILE="${PROFILE:-bundled}"
case "$PROFILE" in bundled|external) ;; *) echo "PROFILE must be bundled or external" >&2; exit 2 ;; esac
VERSION="${PLATFORM_VERSION:-${1:-}}"
[ -n "$VERSION" ] || { echo "usage: PLATFORM_VERSION=vX.Y.Z PROFILE=bundled|external $0" >&2; exit 2; }
# Chart version defaults to the image tag; CHART_VERSION lets a prerelease chart (0.8.73-rc2)
# run the release images (v0.8.73).
CHART_VERSION="${CHART_VERSION:-${VERSION#v}}"
CHARTS_URL="${CHARTS_URL:-https://intabia-fusion.github.io/platform-charts}"
NS="${NS:-platform}"
NS_BASE="${NS_BASE:-platform-base}"
# Both charts in one namespace: SINGLE_NAMESPACE=1 (e.g. a customer-owned "acme" namespace).
[ "${SINGLE_NAMESPACE:-0}" = 1 ] && NS_BASE="$NS"
TIMEOUT="${HELM_TIMEOUT:-15m}"

# DRY_RUN=1 prints the helm commands instead of running them.
run() {
  if [ "${DRY_RUN:-0}" = 1 ]; then
    printf '+ %s\n' "$*"
  else
    "$@"
  fi
}

command -v helm >/dev/null 2>&1 || { echo "helm is required" >&2; exit 2; }

# DIFF=1: same releases through helm-diff, nothing is applied and --wait makes no sense.
HELM_UPGRADE=(helm upgrade --install)
WAIT_ARGS=(--wait)
CREATE_ARGS=(--create-namespace)
TIMEOUT_ARGS=(--timeout "$TIMEOUT")
if [ "${DIFF:-0}" = 1 ]; then
  helm plugin list 2>/dev/null | awk '{print $1}' | grep -qx diff || {
    echo "helm-diff is required for DIFF=1: helm plugin install https://github.com/databus23/helm-diff" >&2
    exit 2
  }
  HELM_UPGRADE=(helm diff upgrade --install)
  # helm diff renders a chart: create-namespace, --wait and --timeout are upgrade-only flags.
  WAIT_ARGS=()
  CREATE_ARGS=()
  TIMEOUT_ARGS=()
fi

BASE_ARGS=()
PLATFORM_ARGS=()
[ -f "values/secrets-base.yaml" ] && BASE_ARGS+=(-f "values/secrets-base.yaml")
[ -f "values/secrets-platform.yaml" ] && PLATFORM_ARGS+=(-f "values/secrets-platform.yaml")

# Base profile: bundled (everything inside), external (all managed), or bundled + selected
# external overlays: EXTERNAL=postgres,s3 keeps Kafka/elastic/redis/mailpit inside.
BASE_FILES=(-f "values/base-bundled.yaml")
if [ "$PROFILE" = external ]; then
  BASE_FILES=(-f "values/base-external.yaml")
elif [ -n "${EXTERNAL:-}" ]; then
  IFS=',' read -ra EXTERNAL_PARTS <<< "$EXTERNAL"
  for part in "${EXTERNAL_PARTS[@]}"; do
    overlay="values/external/$part.yaml"
    [ -f "$overlay" ] || { echo "unknown EXTERNAL component '$part' (see values/external/)" >&2; exit 2; }
    BASE_FILES+=(-f "$overlay")
  done
fi

chart_ref() {
  local name="$1"
  if [ -n "${CHARTS_DIR:-}" ]; then
    printf '%s/%s-%s.tgz' "$CHARTS_DIR" "$name" "$CHART_VERSION"
  else
    printf 'platform-charts/%s' "$name"
  fi
}

# --version only applies to repository charts; a local .tgz carries its version already.
VERSION_ARGS=()
[ -z "${CHARTS_DIR:-}" ] && VERSION_ARGS=(--version "$CHART_VERSION")

if [ -z "${CHARTS_DIR:-}" ]; then
  run helm repo add platform-charts "$CHARTS_URL" --force-update >/dev/null
  run helm repo update platform-charts >/dev/null
fi

echo ">> platform-base $CHART_VERSION ($PROFILE) in $NS_BASE"
run "${HELM_UPGRADE[@]}" platform-base "$(chart_ref platform-base)" \
  "${VERSION_ARGS[@]}" \
  -n "$NS_BASE" "${CREATE_ARGS[@]}" \
  "${BASE_FILES[@]}" "${BASE_ARGS[@]}" \
  "${TIMEOUT_ARGS[@]}" "${WAIT_ARGS[@]}"

echo ">> platform $CHART_VERSION ($PROFILE) in $NS"
run "${HELM_UPGRADE[@]}" platform "$(chart_ref platform)" \
  "${VERSION_ARGS[@]}" \
  -n "$NS" "${CREATE_ARGS[@]}" \
  -f "values/platform-$PROFILE.yaml" "${PLATFORM_ARGS[@]}" \
  --set "global.namespace=$NS" \
  --set "global.baseNamespace=$NS_BASE" \
  --set "global.version=$VERSION" \
  "${TIMEOUT_ARGS[@]}" "${WAIT_ARGS[@]}"

if [ "${DRY_RUN:-0}" = 1 ]; then
  echo ">> dry run: see the commands above"
  exit 0
fi
if [ "${DIFF:-0}" = 1 ]; then
  echo ">> diff done, nothing applied"
  exit 0
fi
HOST="$(helm -n "$NS" get values platform -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["global"]["hostUrl"])')"
echo
echo ">> installed $VERSION: https://$HOST"
echo "   next: create the first workspace (see README, 'First workspace')"
