#!/usr/bin/env bash
# Same as tool-pg.sh but connects DIRECT to postgres (session mode), bypassing
# pgbouncer. Use for bulk loaders (generate-big): reserve-ctx needs a pinned
# connection across a tx's triggers, which pgbouncer's transaction pooling breaks
# (causing the fill to hang). Direct session connections keep reserve-ctx correct.

export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export STORAGE_CONFIG="datalake|http://localhost:8083/_datalake"
export ACCOUNTS_URL=http://localhost:8083/_account
export PLATFORM_URL=http://localhost:8083
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:8083/_tr0","internal":"ws://localhost:8083/_tr0"}],"collaborators":[{"external":"ws://localhost:8083/_cl0","internal":"ws://localhost:8083/_cl0"}]}}}'
export ACCOUNT_DB_URL=postgresql://postgres:postgres@localhost:5433/postgres
export SERVER_SECRET=secret
export DB_URL=postgresql://postgres:postgres@localhost:5433/postgres
export QUEUE_CONFIG='localhost:19093;-staging'

BUNDLE_PATH="../dev/tool/bundle/bundle.js"
if [ -f "./bundle.js" ]; then
  BUNDLE_PATH="./bundle.js"
fi
node ${TOOL_OPTIONS} ${BUNDLE_PATH} "$@"
