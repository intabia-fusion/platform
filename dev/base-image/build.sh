#!/usr/bin/env bash
set -eo pipefail

# Default version if not set
VERSION=${VERSION:-"latest"}
NS="${DOCKER_NAMESPACE:-intabiafusion}"

docker build -t $NS/base:${VERSION} -f base.Dockerfile ${DOCKER_EXTRA} .
docker build -t $NS/base-slim:${VERSION} -f slim.Dockerfile ${DOCKER_EXTRA} .
docker build -t $NS/rekoni-base:${VERSION} -f rekoni.Dockerfile ${DOCKER_EXTRA} .
docker build -t $NS/print-base:${VERSION} -f print.Dockerfile ${DOCKER_EXTRA} .
docker build -t $NS/front-base:${VERSION} -f front.Dockerfile ${DOCKER_EXTRA} .
docker build -t $NS/preview-base:${VERSION} -f preview.Dockerfile ${DOCKER_EXTRA} .
# Built from the love-agent package dir - it needs that package.json and pnpm-lock.yaml.
docker build -t $NS/love-agent-base:${VERSION} -f love-agent.Dockerfile --build-arg BASE_VERSION=${VERSION} ${DOCKER_EXTRA} ../../services/ai-bot/love-agent
# Built from the stream package dir - it needs that module's go.mod and go.sum.
docker build -t $NS/go-base:${VERSION} -f go.Dockerfile ${DOCKER_EXTRA} ../../foundations/stream
docker build -t $NS/stream-base:${VERSION} -f stream.Dockerfile ${DOCKER_EXTRA} .
