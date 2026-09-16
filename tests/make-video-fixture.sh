#!/usr/bin/env bash
# Generates the sanity video fixture with the ffmpeg already present in the stream image,
# so nothing has to be downloaded and no host ffmpeg is required.
# Idempotent: does nothing when the file is already there.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/sanity/tests/files"
OUT_NAME="fake-video.mp4"

if [ -f "${OUT_DIR}/${OUT_NAME}" ]; then
  echo "video fixture already present: ${OUT_DIR}/${OUT_NAME}"
  exit 0
fi

IMAGE="${DOCKER_REGISTRY:+${DOCKER_REGISTRY}/}${DOCKER_NAMESPACE:-intabiafusion}/stream:${DOCKER_TAG:-latest}"

# 720p so the transcoder produces sub-levels (720p -> 480p) instead of a single rendition,
# 3 seconds so it stays around 100KB and one HLS segment per level.
docker run --rm --entrypoint ffmpeg -v "${OUT_DIR}:/out" "${IMAGE}" \
  -hide_banner -loglevel error \
  -f lavfi -i "testsrc=duration=3:size=1280x720:rate=15" \
  -f lavfi -i "sine=frequency=440:duration=3" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  -y "/out/${OUT_NAME}"

echo "generated ${OUT_DIR}/${OUT_NAME} ($(du -h "${OUT_DIR}/${OUT_NAME}" | cut -f1))"
