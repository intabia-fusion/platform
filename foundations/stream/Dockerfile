# Copyright © 2025 Hardcore Engineering Inc.
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

FROM golang:1.26.2 AS base

WORKDIR /app

ENV GO111MODULE=on
ENV CGO_ENABLED=0
ENV GOBIN=/bin
ENV PATH=$PATH:$GOBIN
# Pin cache paths so every RUN sees the same locations that we mount as
# BuildKit caches below. Defaults already match, but setting them explicitly
# avoids surprises if the base image ever changes.
ENV GOMODCACHE=/go/pkg/mod
ENV GOCACHE=/root/.cache/go-build
ARG BUILDARCH=amd64

# Download modules once into a dedicated layer so they can be cached
FROM base AS deps

# Copy only go.mod and go.sum to leverage Docker layer caching
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download

# Linter stage: reuse downloaded modules from deps
FROM base AS linter

# Cache the golangci-lint binary across builds via a build cache mount.
RUN --mount=type=cache,target=/root/.cache/golangci-lint \
    curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh \
    | sh -s -- -b $(go env GOPATH)/bin v2.5.0

# Copy go.mod and go.sum for module resolution
COPY go.mod go.sum ./

# Copy full source for linting
COPY . ./

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/root/.cache/golangci-lint \
    golangci-lint run --verbose

# Tester stage: run the unit tests with the race detector.
# Runs in parallel with linter/builder — BuildKit schedules them concurrently.
FROM base AS tester

# CGO is required for -race.
ENV CGO_ENABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
COPY . ./

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test -race -count=1 ./...

# Builder stage: reuse modules and build caches, then compile
FROM base AS builder

# Copy go.mod and go.sum for module resolution
COPY go.mod go.sum ./

# Copy the rest of the source
COPY . ./

# Allow overriding target OS/ARCH at build time (optional)
ARG TARGETOS
ARG TARGETARCH

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    set -xe && GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -o /go/bin/stream ./cmd/stream

# Final runtime image
FROM alpine

RUN set -xe && apk add --no-cache ffmpeg
RUN apk add --no-cache ca-certificates jq bash \
    && addgroup -g 1000 stream \
    && adduser -u 1000 -G stream -s /bin/sh -D stream

COPY --from=builder /go/bin/stream /stream
RUN chown stream:stream /stream

EXPOSE 1080
USER stream

ENTRYPOINT ["/stream"]
