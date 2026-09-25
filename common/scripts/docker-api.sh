#!/bin/bash
# Images for the ws-tests stand the api-tests and backup-tests run against - the services in
# ws-tests/docker-compose.yaml and nothing else. No web UI: front is built with an empty dist/,
# since the api-tests only need its /config.json, and the webpack bundle is most of the build.
set -eo pipefail

./common/scripts/node_modules/.bin/compile-all . --parallel 4 --docker-build --esbuild-emit \
--to @hcengineering/pod-server \
--to @hcengineering/pod-account \
--to @hcengineering/pod-workspace \
--to @hcengineering/pod-collaborator \
--to @hcengineering/pod-fulltext \
--to @hcengineering/pod-stats \
--to @hcengineering/pod-backup \
--to @hcengineering/pod-datalake \
--to @hcengineering/pod-billing \
--to @hcengineering/pod-stream \
--to @hcengineering/pod-worker \
--to @hcengineering/pod-webhook \
--to @hcengineering/pod-db-migrator \
--to @hcengineering/rekoni-service \
--to @hcengineering/pod-ai-bot \
--to @hcengineering/pod-activity \
--to @hcengineering/pod-mail \
--to @hcengineering/tool

./common/scripts/node_modules/.bin/compile-all . --parallel 4 --bundle --esbuild-emit --to @hcengineering/pod-front
cd pods/front
rm -rf dist
mkdir dist
../../common/scripts/docker_build.sh front
