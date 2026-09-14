#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

cd ${project_dir}
pnpm svelte-check