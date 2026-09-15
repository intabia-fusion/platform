ARG BASE_VERSION=latest
FROM intabiafusion/base:${BASE_VERSION}
WORKDIR /usr/src/app

RUN npm install -g pnpm

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_CONFIG_DANGEROUSLY_ALLOW_ALL_BUILDS=true

ARG NPM_REGISTRY
RUN [ -z "$NPM_REGISTRY" ] || pnpm config set registry "$NPM_REGISTRY"

# Dependency tree is baked here so the per-commit love-agent build stays off the npm registry.
COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm install --frozen-lockfile --ignore-scripts=false
