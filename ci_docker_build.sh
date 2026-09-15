#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

# Only the commit tag here; the release tag is published by ci_push_release.sh.
export DOCKER_SKIP_RELEASE_TAG=1

pnpm install --frozen-lockfile
pnpm docker:build
pnpm docker:push
