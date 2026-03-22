#!/usr/bin/env bash

export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export STORAGE_CONFIG="datalake|http://localhost:4031"
export ACCOUNTS_URL=http://localhost:3003
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:3334","internal":"ws://transactor0:3334"},{"external":"ws://localhost:3335","internal":"ws://transactor1:3335"}],"collaborators":[{"external":"ws://localhost:3079","internal":"ws://collaborator0:3079"},{"external":"ws://localhost:3080","internal":"ws://collaborator1:3080"}]}}}'
export ACCOUNT_DB_URL=postgresql://root@localhost:26258/defaultdb?sslmode=disable
export MONGO_URL=mongodb://localhost:27018
export ELASTIC_URL=http://localhost:9201
export SERVER_SECRET=secret
export DB_URL=postgresql://root@localhost:26258/defaultdb?sslmode=disable
export QUEUE_CONFIG='localhost:19093;-staging'

BUNDLE_PATH="../dev/tool/bundle/bundle.js"
if [ -f "./bundle.js" ]; then
  BUNDLE_PATH="./bundle.js"
fi
node ${TOOL_OPTIONS} ${BUNDLE_PATH} "$@"
