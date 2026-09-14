#!/usr/bin/env bash
set -eo pipefail

# Publishes a built image: $1 - component name, $2 - "staging" for a staging tag.
# Registry and namespace come from DOCKER_REGISTRY / DOCKER_NAMESPACE.

component=$1
if [ -z "$component" ]; then
  echo "Error: component name is empty." >&2
  exit 1
fi

case "$component" in */*) image="$component" ;; *) image="${DOCKER_NAMESPACE:-intabiafusion}/$component" ;; esac
rev_version=$(git rev-parse HEAD)
source_image="$image:$rev_version"
target_repo="${DOCKER_REGISTRY:+$DOCKER_REGISTRY/}$image"
tag_version=$(git tag --points-at HEAD | head -1)

upload() {
  local target="$target_repo:$1"
  echo "Tagging '$source_image' as '$target'"
  docker tag "$source_image" "$target"

  for n in {1..25}; do
    docker push "$target" && return 0
    echo "Docker failed to push $target, wait 5 seconds"
    sleep 5
  done
  echo "25 push attempts failed, exiting with failure $target" >&2
  exit 1
}

if [ "$2" = "staging" ]; then
  # staging derives from the last release, not from a tag on this very commit
  tag_version=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
  if [ -z "$tag_version" ]; then
    echo "Error: no git tag found, cannot derive a staging version." >&2
    exit 1
  fi
  a=( ${tag_version//./ } )
  c=$(( ${a[2]//[^0-9]/} + 1 ))
  upload "${a[0]}.${a[1]}.${c}-staging"
  exit 0
fi

upload "$rev_version"

# The release tag is published by a separate manual step, so a build never marks a release.
if [ "$DOCKER_SKIP_RELEASE_TAG" = "1" ]; then
  echo "DOCKER_SKIP_RELEASE_TAG=1 - published by commit only."
elif [ -n "$tag_version" ]; then
  upload "$tag_version"
else
  echo "HEAD carries no tag - published by commit only."
fi
