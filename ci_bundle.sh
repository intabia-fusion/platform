#!/bin/bash

set -eo pipefail

node common/scripts/check-versions.js
node common/scripts/check-layers.js
pnpm install --frozen-lockfile
pnpm model-version
pnpm bundle

# @intabia-fusion/api tarball, published as a job artifact
cd dev/api
node scripts/build-bundle.js
cd bundle
npm ci
npx tsc
npm pack
