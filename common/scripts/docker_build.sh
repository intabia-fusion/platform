#!/usr/bin/env bash
set -eo pipefail

version=$(git rev-parse HEAD)

# Check for cleanup flag from environment
cleanup=false
if [ "$DOCKER_BUILD_CLEANUP" = "true" ]; then
  cleanup=true
fi

echo "Building version: $version"

# Add PACKAGE_HASH label if provided (for caching)
if [ -n "$PACKAGE_HASH" ]; then
  docker build --build-arg BUILD_ID="$version" --label "BUILD_ID=$version" --label "PACKAGE_HASH=$PACKAGE_HASH" -t "$1" -t "$1:$version" ${DOCKER_EXTRA} .
else
  docker build --build-arg BUILD_ID="$version" --label "BUILD_ID=$version" -t "$1" -t "$1:$version" ${DOCKER_EXTRA} .
fi

if [ "$cleanup" = true ]; then
  echo "Cleaning up build artifacts..."

  if [ -d "bundle" ]; then
    echo "  Removing bundle/"
    rm -rf bundle
  fi

  if [ -d "dist" ]; then
    echo "  Removing dist/"
    rm -rf dist
  fi

  if [ -d ".rush" ]; then
    echo "  Removing .rush/"
    rm -rf .rush
  fi

  echo "  Size after cleanup: $(du -sh . 2>/dev/null | cut -f1)"
fi
