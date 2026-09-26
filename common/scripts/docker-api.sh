#!/bin/bash
# Images for the stand the api-tests and backup-tests run against - the services in
# api-tests/docker-compose.yaml and nothing else. No web UI: front runs as `front-api` with an empty
# dist/, since the api-tests only need its /config.json, and the webpack bundle is most of the build.
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
# Built next to pods/front, not in it: its dist/ holds the web UI a full `pnpm docker` packs, and
# `front` is the image the Playwright stands run.
ctx=$(mktemp -d)
trap 'rm -rf "$ctx"' EXIT
mkdir "$ctx/bundle" "$ctx/dist"
cp pods/front/Dockerfile "$ctx/"
cp pods/front/bundle/bundle.js pods/front/bundle/bundle.js.map "$ctx/bundle/"
docker build ${DOCKER_EXTRA} -t "${DOCKER_NAMESPACE:-intabiafusion}/front-api" "$ctx"
