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
# Roll both releases back: the previous revision by default, or one given explicitly.
#   ./scripts/rollback.sh            # на ревизию назад
#   ./scripts/rollback.sh 3          # на ревизию 3
#   ./scripts/rollback.sh --list     # история обоих релизов, ничего не меняет
#
# Порядок обратный apply: platform, затем platform-base. Приложение откатывается первым, чтобы
# инфраструктура (CRD, операторы) не оказалась новее приложения, которое ждёт старых.
set -euo pipefail

NS="${NS:-platform}"
NS_BASE="${NS_BASE:-platform-base}"
[ "${SINGLE_NAMESPACE:-0}" = 1 ] && NS_BASE="$NS"
TIMEOUT="${HELM_TIMEOUT:-15m}"
KUBECONFIG="${KUBECONFIG:-$HOME/.kube/config}"
export KUBECONFIG

command -v helm >/dev/null 2>&1 || { echo "helm is required" >&2; exit 2; }

history() { helm -n "$1" history "$2" -o json; }

if [ "${1:-}" = --list ]; then
  printf '== %s/platform\n' "$NS"
  helm -n "$NS" history platform
  printf '\n== %s/platform-base\n' "$NS_BASE"
  helm -n "$NS_BASE" history platform-base
  exit 0
fi

TARGET="${1:-previous}"
case "$TARGET" in
  previous)
    PREV="$(history "$NS" platform | python3 -c 'import json,sys; h=json.load(sys.stdin); print(h[-2]["revision"] if len(h)>1 else "")')"
    [ -n "$PREV" ] || { echo "platform has a single revision, nothing to roll back" >&2; exit 1; }
    TARGET="$PREV"
    ;;
  ''|*[!0-9]*) echo "usage: $0 [revision|--list]" >&2; exit 2 ;;
esac

echo ">> rollback platform to revision $TARGET in $NS"
helm -n "$NS" rollback platform "$TARGET" --wait --timeout "$TIMEOUT"
echo ">> rollback platform-base to revision $TARGET in $NS_BASE"
helm -n "$NS_BASE" rollback platform-base "$TARGET" --wait --timeout "$TIMEOUT"

echo
helm -n "$NS" history platform | tail -3
helm -n "$NS_BASE" history platform-base | tail -3
