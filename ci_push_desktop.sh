#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

pnpm install --frozen-lockfile

cd desktop-package

pnpm run bundle:server
../common/scripts/docker_build.sh desktop-distro
../common/scripts/docker_tag.sh desktop-distro