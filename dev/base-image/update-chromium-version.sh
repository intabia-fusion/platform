#!/usr/bin/env bash
# Resolve latest chromium-common version available in node:24 base image
# and update CHROMIUM_VERSION ARG in print.Dockerfile.
# Run manually when print-base build fails due to version pin going stale.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKERFILE="${SCRIPT_DIR}/print.Dockerfile"

BASE_IMAGE="$(grep -E '^FROM ' "${DOCKERFILE}" | head -1 | awk '{print $2}')"
echo "Base image: ${BASE_IMAGE}"

VERSION="$(docker run --rm "${BASE_IMAGE}" bash -c \
  "apt-get update -qq >/dev/null 2>&1 && apt-cache madison chromium-common 2>/dev/null | head -1 | awk '{print \$3}'")"

if [[ -z "${VERSION}" ]]; then
  echo "ERROR: failed to resolve chromium-common version" >&2
  exit 1
fi

echo "Latest chromium-common: ${VERSION}"

CURRENT="$(grep -E '^ARG CHROMIUM_VERSION=' "${DOCKERFILE}" | sed -E 's/.*"([^"]+)".*/\1/')"
echo "Current pinned:        ${CURRENT}"

if [[ "${CURRENT}" == "${VERSION}" ]]; then
  echo "Already up to date."
  exit 0
fi

sed -i.bak -E "s|^(ARG CHROMIUM_VERSION=)\"[^\"]+\"|\1\"${VERSION}\"|" "${DOCKERFILE}"
rm -f "${DOCKERFILE}.bak"
echo "Updated print.Dockerfile: ${CURRENT} -> ${VERSION}"
