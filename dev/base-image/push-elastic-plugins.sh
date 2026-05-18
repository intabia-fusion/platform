#!/usr/bin/env bash
set -e

IMAGE="intabiafusion/elastic-plugins"
TAG="${1:-8.19.1-slim}"

# FROM_IMAGE=true — build from existing full image (no CDN needed)
# default — install plugins from scratch (requires CDN access)
if [ "${FROM_IMAGE:-false}" = "true" ]; then
  DOCKERFILE="elastic-plugins-from-image.Dockerfile"
  echo "Building ${IMAGE}:${TAG} from existing image (no CDN download)..."
else
  DOCKERFILE="elastic-plugins.Dockerfile"
  echo "Building ${IMAGE}:${TAG} with plugin download from CDN..."
fi

docker buildx create --name elastic-builder --use 2>/dev/null || docker buildx use elastic-builder

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f "${DOCKERFILE}" \
  -t "${IMAGE}:${TAG}" \
  --push \
  .

echo "Done: ${IMAGE}:${TAG}"
