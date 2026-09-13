#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

if [ -z "$(git tag --points-at HEAD)" ]; then
  echo "Error: HEAD carries no tag, nothing to release." >&2
  exit 1
fi

pnpm install --frozen-lockfile
pnpm docker:push
