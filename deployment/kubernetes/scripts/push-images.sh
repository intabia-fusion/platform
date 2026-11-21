#!/usr/bin/env bash
# Push the images a stand needs into the cluster registry: render its helm values, collect the
# intabiafusion/* images and push the locally built ones under global.version (--check: verify only).
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

# Render with the stand values to collect exactly the images the stand uses; the CI overlay only
# satisfies the mandatory contract addresses offline and does not affect image names.
mapfile -t VALUES_FILES < <(stand_values_files "$STAND")
VAL_ARGS=()
for f in "${VALUES_FILES[@]}"; do VAL_ARGS+=(-f "$f"); done
[ -f "$K8S_DIR/stands/ci/render-check.yaml" ] && VAL_ARGS+=(-f "$K8S_DIR/stands/ci/render-check.yaml")
# STAND_VERSION overrides the values' global.version (CI publishes commit-SHA tags, not latest).
STAND_VERSION="${STAND_VERSION:-$(grep -h '^  version:' "${VALUES_FILES[@]}" | tail -1 | awk '{print $2}' | tr -d '"')}"
STAND_VERSION="${STAND_VERSION:-latest}"
IMAGES="$(helmc template "fusion-$STAND" "$K8S_DIR/charts/platform" \
    "${VAL_ARGS[@]}" --set global.imageRegistry="$REGISTRY_PULL" \
    --set "global.version=$STAND_VERSION" --set "global.imageNamespace=$STAND_IMAGE_NAMESPACE" 2>/dev/null | awk '
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
to_push=()
for img in $IMAGES; do
  case "$img" in
    # Local builds are always tagged intabiafusion/<svc> by docker_build.sh, whatever the
    # stand pulls them under.
    */"$STAND_IMAGE_NAMESPACE"/*) dockerrepo="intabiafusion/${img##*/"$STAND_IMAGE_NAMESPACE"/}" ;;
    "$STAND_IMAGE_NAMESPACE"/*)   dockerrepo="intabiafusion/${img#"$STAND_IMAGE_NAMESPACE"/}" ;;
    *) continue ;;                      # public base images: pulled by the cluster
  esac
  repo="${dockerrepo%%:*}"
  tag="${dockerrepo#*:}"
  [ "$tag" = "$repo" ] && tag="latest"
  # images pinned to their own tag (e.g. pulse:v0.7.340) are pulled from their origin
  if [ "$tag" != "$STAND_VERSION" ]; then
    echo ">> skip $repo:$tag (pinned tag, cluster pulls from origin)"
    continue
  fi
  if ! docker image inspect "$repo:$tag" >/dev/null 2>&1; then
    missing+=("$repo:$tag")
    continue
  fi
  [ "$CHECK" = 1 ] && continue
  to_push+=("$repo:$tag")
done

if [ ${#missing[@]} -gt 0 ]; then
  warn "missing locally built images:"
  printf '   %s\n' "${missing[@]}" >&2
  echo "build them first: pnpm docker:build" >&2
  exit 1
fi
[ "$CHECK" = 1 ] && echo ">> all images for '$STAND' are present locally"
if [ ${#to_push[@]} -gt 0 ]; then
  # Dockerd handles parallel pushes; a warm registry ends up at ~8 s for 40 images at 12
  # jobs (29 s sequential, 16 s at 4). Override with PUSH_JOBS.
  PUSH_JOBS="${PUSH_JOBS:-12}"
  PODMAN=0
  [ "${KIND_EXPERIMENTAL_PROVIDER:-}" = podman ] && PODMAN=1

  push_one() {
    local img="$1"
    local repo="${img%%:*}" tag="${img#*:}"
    local target="$REGISTRY_PUSH/$repo"
    docker tag "$repo:$tag" "$target:$tag" >/dev/null || return 1
    if [ "$PODMAN" = 1 ]; then
      podman push --tls-verify=false "$target:$tag" >/dev/null 2>&1 || { echo "!! push failed: $target:$tag" >&2; return 1; }
    else
      docker push "$target:$tag" >/dev/null 2>&1 || { echo "!! push failed: $target:$tag" >&2; return 1; }
    fi
  }
  export -f push_one
  export REGISTRY_PUSH PODMAN

  for img in "${to_push[@]}"; do
    echo ">> push $REGISTRY_PUSH/${img%%:*}:${img#*:}"
  done
  printf '%s\n' "${to_push[@]}" | xargs -P "$PUSH_JOBS" -n1 bash -c 'push_one "$0"'
fi

exit 0
