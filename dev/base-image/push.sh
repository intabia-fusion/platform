#!/usr/bin/env bash
set -eo pipefail

# Default version if not set
VERSION=${VERSION:-"latest"}
NS="${DOCKER_NAMESPACE:-intabiafusion}"

docker push $NS/base:${VERSION}
docker push $NS/base-slim:${VERSION}
docker push $NS/rekoni-base:${VERSION}
docker push $NS/print-base:${VERSION}
docker push $NS/front-base:${VERSION}
docker push $NS/preview-base:${VERSION}
docker push $NS/love-agent-base:${VERSION}
