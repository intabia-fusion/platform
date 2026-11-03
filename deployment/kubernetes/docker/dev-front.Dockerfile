#
# Copyright © 2026 Intabia Fusion.
#
# Licensed under the Eclipse Public License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License. You may
# obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Dev front image: webpack dev-server toolchain for `pnpm -w stand:dev:front`.
# Build context is the repo root (see .dockerignore). The repo itself is NOT
# baked in for serving - at runtime the host repo is bind-mounted over /repo
# for HMR/source editing, and /repo/node_modules is a named volume seeded
# from this image, so Linux-native binaries (esbuild, swc) never touch the
# macOS host. Rebuild only when the lockfile or toolchain changes.

FROM node:24-bookworm-slim

WORKDIR /repo

# pnpm store lives inside the node_modules named volume (seeded from this
# image), so pnpm sees a consistent store/modules state at runtime.
ENV npm_config_store_dir=/repo/node_modules/.pnpm-store

RUN npm install --global corepack@0.35.0 && corepack enable

# node-gyp for native deps (bufferutil, utf-8-validate).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY . /repo

# Seed the named volume that shadows /repo/node_modules at runtime: install,
# record the lockfile hash (skips reinstall in the container until the lockfile
# changes) and make the tree writable for the runtime user.
RUN pnpm install --frozen-lockfile --prefer-offline \
 && sha256sum pnpm-lock.yaml | awk '{print $1}' > node_modules/.fusion-front-lock \
 && chown -R node:node /repo/node_modules

EXPOSE 8080

USER node
