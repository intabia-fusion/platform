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
# Publish packaged charts into the platform-charts repository (GitHub Pages serves docs/).
#   publish-charts.sh vX.Y.Z [--init] [--no-push]
# --init seeds values/scripts/README into an empty repository.
# CI passes CHARTS_TOKEN; a developer can rely on their git credentials.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$K8S_DIR/../.." && pwd)"

VERSION=""
INIT=0
PUSH=1
PRUNE=0
KEEP=3
while [ $# -gt 0 ]; do
  case "$1" in
    --init) INIT=1 ;;
    --no-push) PUSH=0 ;;
    --prune) PRUNE=1 ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) VERSION="$1" ;;
  esac
  shift
done
VERSION="${VERSION:-$(git -C "$REPO_ROOT" describe --tags --abbrev=0)}"
[ -n "$VERSION" ] || { echo "usage: $0 [vX.Y.Z] [--init] [--no-push] [--prune [--keep N]]" >&2; exit 2; }

CHARTS_DIR="${CHARTS_DIR:-$REPO_ROOT/../platform-charts}"
CHARTS_URL="${CHARTS_URL:-https://intabia-fusion.github.io/platform-charts}"
REPO_HTTPS="https://github.com/intabia-fusion/platform-charts.git"
if [ -n "${CHARTS_TOKEN:-}" ]; then
  CLONE_URL="https://x-access-token:${CHARTS_TOKEN}@github.com/intabia-fusion/platform-charts.git"
else
  CLONE_URL="${CHARTS_REPO_URL:-$REPO_HTTPS}"
fi

if [ ! -d "$CHARTS_DIR/.git" ]; then
  echo ">> cloning platform-charts into $CHARTS_DIR"
  git clone --depth 1 "$CLONE_URL" "$CHARTS_DIR"
else
  if git -C "$CHARTS_DIR" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
    if [ -z "$(git -C "$CHARTS_DIR" status --porcelain)" ]; then
      git -C "$CHARTS_DIR" pull --ff-only >/dev/null
    else
      echo ">> local changes in $CHARTS_DIR: skipping pull"
    fi
  fi
fi

mkdir -p "$CHARTS_DIR/docs"
if [ "$INIT" = 1 ]; then
  echo ">> seeding the repository layout (existing files are kept)"
  mkdir -p "$CHARTS_DIR/values" "$CHARTS_DIR/scripts"
  # values/ and scripts/ are maintained upstream and updated on every --init; README.md and
  # .gitignore are seeded once so local notes are not overwritten.
  cp -R "$K8S_DIR/selfhost/values/." "$CHARTS_DIR/values/"
  cp -R "$K8S_DIR/selfhost/scripts/." "$CHARTS_DIR/scripts/"
  [ -e "$CHARTS_DIR/README.md" ] || cp "$K8S_DIR/selfhost/README.md" "$CHARTS_DIR/README.md"
  [ -e "$CHARTS_DIR/.gitignore" ] || cp "$K8S_DIR/selfhost/.gitignore" "$CHARTS_DIR/.gitignore"
fi

bash "$SCRIPT_DIR/package-charts.sh" "$VERSION" "$CHARTS_DIR/docs" >/dev/null
# Regenerate from every tgz present: old versions stay in the index.
helm repo index "$CHARTS_DIR/docs" --url "$CHARTS_URL" >/dev/null

# Old releases stay by default: --version pins and rollbacks need them. --prune keeps only the
# newest KEEP versions per chart (drop rc/debug builds after a GA release).
if [ "$PRUNE" = 1 ]; then
  python3 - "$CHARTS_DIR/docs" "$KEEP" <<'PY'
import re
import sys
from pathlib import Path

docs = Path(sys.argv[1])
keep = int(sys.argv[2])
if keep < 1:
    sys.exit('--keep must be >= 1')
semver = re.compile(r'^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$')


def key(version):
    m = semver.match(version)
    if m is None:
        return (0, 0, 0, 0, ())
    major, minor, patch, pre = m.groups()
    parts = tuple((0, int(p)) if p.isdigit() else (1, p) for p in (pre or '').split('.') if p != '')
    # a release sorts after its pre-releases
    return (int(major), int(minor), int(patch), 0 if pre else 1, parts)


charts = {}
for path in docs.glob('*.tgz'):
    name = path.name[: -len('.tgz')]
    for chart in ('platform-base', 'platform', 'monitoring'):
        if name.startswith(chart + '-'):
            charts.setdefault(chart, []).append((name[len(chart) + 1:], path))
            break

removed = 0
for items in charts.values():
    items.sort(key=lambda item: key(item[0]), reverse=True)
    for _, path in items[keep:]:
        print(f'prune {path.name}')
        path.unlink()
        removed += 1
print(f'pruned {removed} chart file(s), kept {keep} per chart')
PY
  helm repo index "$CHARTS_DIR/docs" --url "$CHARTS_URL" >/dev/null
fi

ENTRIES="$(grep -c '^ *version:' "$CHARTS_DIR/docs/index.yaml" || true)"
echo ">> packaged $VERSION; index has $ENTRIES chart versions"

if [ "$PUSH" != 1 ]; then
  echo ">> --no-push: changes are in $CHARTS_DIR"
  exit 0
fi

cd "$CHARTS_DIR"
if ! git status --porcelain | grep -q .; then
  echo ">> nothing to publish: $VERSION is already in the repository"
  exit 0
fi
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-platform-ci}" \
  -c user.email="${GIT_AUTHOR_EMAIL:-ci@intabia-fusion.local}" \
  commit -m "charts: $VERSION" >/dev/null
git push origin HEAD >/dev/null
echo ">> pushed charts $VERSION to platform-charts"
