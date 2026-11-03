#!/usr/bin/env bash
# Push the images a stand needs into the cluster registry.
#
#   push-images.sh <stand> [k3d|kind|existing] [--check]
#
# Renders the stand's helm values, collects the intabiafusion/* images, and pushes
# the locally built ones under their current tag (global.version, default latest).
# Base images (postgres, elastic, ...) come from public registries and are skipped.
# With --check only verifies presence locally and exits non-zero on the first gap.
#
# existing runtime: nothing is pushed unless STAND_REGISTRY is set; without it the
# images must already be pullable by the cluster and the script only reports.
set -euo pipefail
STAND="${1:?usage: push-images.sh <stand> [runtime] [--check]}"; shift || true
[ $# -ge 1 ] && case "$1" in k3d|kind|existing) STAND_RUNTIME="$1"; shift ;; esac
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1

if [ "$STAND_RUNTIME" = existing ] && [ -z "${STAND_REGISTRY:-}" ]; then
  warn "existing runtime without STAND_REGISTRY: assuming images are pullable, nothing to push"
  exit 0
fi

# Render with the stand values to collect exactly the images the stand uses.
# The CI overlay only satisfies the mandatory contract addresses for offline
# rendering - it does not affect image names.
mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
VAL_ARGS=()
for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
[ -f "$K8S_DIR/stands/ci/render-check.yaml" ] && VAL_ARGS+=(-f "$K8S_DIR/stands/ci/render-check.yaml")
STAND_VERSION="$(grep -h '^  version:' "${VALUES_FILES[@]}" | tail -1 | awk '{print $2}' | tr -d '"')"
STAND_VERSION="${STAND_VERSION:-latest}"
IMAGES="$(helmc template "fusion-$STAND" "$K8S_DIR/charts/platform" \
    "${VAL_ARGS[@]}" --set global.imageRegistry="$REGISTRY_PULL" 2>/dev/null | awk '
  /^---/ { kind=""; replicas=1 }
  /^kind: / { kind=$2 }
  /^  replicas: / { if (kind=="Deployment") replicas=$2 }
  /image: / {
    # only workloads that actually run: deployments with replicas > 0 and jobs
    if ((kind=="Deployment" && replicas != 0) || kind=="Job") {
      img=$2; gsub(/"/,"",img); print img
    }
  }
' | sort -u)"

missing=()
for img in $IMAGES; do
  case "$img" in
    */intabiafusion/*) dockerrepo="intabiafusion/${img##*/intabiafusion/}" ;;
    intabiafusion/*)   dockerrepo="$img" ;;
    *) continue ;;                      # public base images: pulled by the cluster
  esac
  repo="${dockerrepo%%:*}"
  tag="${dockerrepo#*:}"
  [ "$tag" = "$repo" ] && tag="latest"
  # images pinned to their own tag (e.g. pulse:v0.7.340) are pulled by the
  # cluster straight from their origin - only push what the stand version runs
  if [ "$tag" != "$STAND_VERSION" ]; then
    echo ">> skip $repo:$tag (pinned tag, cluster pulls from origin)"
    continue
  fi
  if ! docker image inspect "$repo:$tag" >/dev/null 2>&1; then
    missing+=("$repo:$tag")
    continue
  fi
  [ "$CHECK" = 1 ] && continue
  target="$REGISTRY_PUSH/$repo"
  docker tag "$repo:$tag" "$target:$tag" >/dev/null
  echo ">> push $target:$tag"
  if [ "${KIND_EXPERIMENTAL_PROVIDER:-}" = podman ]; then
    podman push --tls-verify=false "$target:$tag" >/dev/null
  else
    docker push "$target:$tag" >/dev/null
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  warn "missing locally built images:"
  printf '   %s\n' "${missing[@]}" >&2
  echo "build them first: pnpm docker:build" >&2
  exit 1
fi
[ "$CHECK" = 1 ] && echo ">> all images for '$STAND' are present locally"
exit 0
