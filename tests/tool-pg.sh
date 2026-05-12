#!/usr/bin/env bash

export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export STORAGE_CONFIG="datalake|http://localhost:8083/_datalake"
export ACCOUNTS_URL=http://localhost:8083/_account
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:8083/_tr0","internal":"ws://localhost:8083/_tr0"},{"external":"ws://localhost:8083/_tr1","internal":"ws://localhost:8083/_tr1"}],"collaborators":[{"external":"ws://localhost:8083/_cl0","internal":"ws://localhost:8083/_cl0"},{"external":"ws://localhost:8083/_cl1","internal":"ws://localhost:8083/_cl1"}]}}}'
export ACCOUNT_DB_URL=postgresql://postgres:postgres@localhost:6433/postgres
export SERVER_SECRET=secret
export DB_URL=postgresql://postgres:postgres@localhost:6433/postgres
export QUEUE_CONFIG='localhost:19093;-staging'

BUNDLE_PATH="../dev/tool/bundle/bundle.js"
if [ -f "./bundle.js" ]; then
  BUNDLE_PATH="./bundle.js"
fi
node ${TOOL_OPTIONS} ${BUNDLE_PATH} "$@"
