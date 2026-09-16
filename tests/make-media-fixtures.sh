#!/usr/bin/env bash
# Generates the sanity media fixtures with tools already baked into the stand images, so nothing
# is downloaded and no host ffmpeg/libreoffice is required. Idempotent per file.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/sanity/tests/files"
PREFIX="${DOCKER_REGISTRY:+${DOCKER_REGISTRY}/}${DOCKER_NAMESPACE:-intabiafusion}"
TAG="${DOCKER_TAG:-latest}"
# Run as the calling user: the images default to their own non-root user, which cannot write into
# a checkout owned by the CI runner, and root would leave files the runner cannot clean up.
AS_CALLER=(--user "$(id -u):$(id -g)")

# 720p so the transcoder produces sub-levels instead of a single rendition, 3 seconds so it stays
# around 60KB and one HLS segment per level.
if [ ! -f "${OUT_DIR}/fake-video.mp4" ]; then
  docker run --rm "${AS_CALLER[@]}" --entrypoint ffmpeg -v "${OUT_DIR}:/out" "${PREFIX}/stream:${TAG}" \
    -hide_banner -loglevel error \
    -f lavfi -i "testsrc=duration=3:size=1280x720:rate=15" \
    -f lavfi -i "sine=frequency=440:duration=3" \
    -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
    -y /out/fake-video.mp4
  echo "generated fake-video.mp4"
fi

# A real .docx, converted by the same libreoffice the preview pod runs, so the preview test
# exercises docx -> pdf -> png end to end.
if [ ! -f "${OUT_DIR}/fake-doc.docx" ]; then
  docker run --rm "${AS_CALLER[@]}" --entrypoint sh -v "${OUT_DIR}:/out" "${PREFIX}/preview:${TAG}" -c '
    set -e
    tmp=$(mktemp -d)
    export HOME="$tmp"
    printf "Sanity preview fixture\n\nGenerated for the docx preview test.\n" > "$tmp/fake-doc.txt"
    # explicit profile: an arbitrary uid has no passwd entry, so libreoffice cannot derive one from HOME
    libreoffice -env:UserInstallation=file://$tmp/profile --headless --convert-to docx:"MS Word 2007 XML" --outdir "$tmp" "$tmp/fake-doc.txt" >/dev/null
    cp "$tmp/fake-doc.docx" /out/fake-doc.docx
  '
  echo "generated fake-doc.docx"
fi
