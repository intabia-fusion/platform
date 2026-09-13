#!/bin/bash

set -eo pipefail

export project_dir=$(pwd)
echo "=== Exported Variables ==="
echo "project_dir: $project_dir"

cd ${project_dir}

# Formatting...
export target_branch=${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-'develop'}
echo "target_branch: $target_branch"

pnpm format:branch --branch ${target_branch}

# Check files formatting
echo '================================================================'
echo 'Checking for diff files'
echo '================================================================'
git diff '*.js' '*.ts' '*.svelte' '*.json' '*.yaml' | cat
[ -z "$(git diff --name-only '*.js' '*.ts' '*.svelte' '*.json' '*.yaml' | cat)" ]
echo '================================================================'