#!/usr/bin/env bash

export MODEL_VERSION=$(node ../common/scripts/show_version.js)
export STORAGE_CONFIG="datalake|http://localhost:4030"
export DB_URL=postgresql://postgres:postgres@localhost:5432/postgres
export ACCOUNT_DB_URL=postgresql://postgres:postgres@localhost:5432/postgres
export ACCOUNTS_URL=http://localhost:3000
export REGION_CONFIG_JSON='{"regions":{"":{"transactors":[{"external":"ws://localhost:3333","internal":"ws://localhost:3333"},{"external":"ws://localhost:3332","internal":"ws://localhost:3332"}],"collaborators":[{"external":"ws://localhost:3079","internal":"ws://localhost:3079"}]},"cockroach":{"transactors":[{"external":"ws://localhost:3332","internal":"ws://localhost:3332"}],"collaborators":[{"external":"ws://localhost:3079","internal":"ws://localhost:3079"}]}}}'
export ELASTIC_URL=http://localhost:9200
export SERVER_SECRET=secret
export QUEUE_CONFIG=localhost:19092

# Restore workspace contents in mongo/elastic
node ../dev/tool/bundle/bundle.js "$@"
