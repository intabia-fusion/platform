#!/usr/bin/env bash
set -eo pipefail

# Publishes an image built without a version tag (docker:tbuild / docker:abuild).
#   $1 - component name, $2 - version tag (defaults to the current commit).

component=$1
if [ -z "$component" ]; then
  echo "Error: component name is empty." >&2
  exit 1
fi

case "$component" in */*) image="$component" ;; *) image="${DOCKER_NAMESPACE:-intabiafusion}/$component" ;; esac
version="${2:-$(git rev-parse HEAD)}"
target="${DOCKER_REGISTRY:+$DOCKER_REGISTRY/}$image:$version"

echo "Tagging release $image as $target"
docker tag "$image" "$target"

for n in {1..25}; do
  docker push "$target" && exit 0
  echo 'Docker failed to push, wait 5 seconds'
  sleep 5
done
echo "25 push attempts failed, exiting with failure $target" >&2
exit 1
