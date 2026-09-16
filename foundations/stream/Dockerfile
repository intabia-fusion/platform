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

# Pinned to a published tag, like the other pods do with intabiafusion/base.
ARG BASE_VERSION=v20260917

# --platform=$BUILDPLATFORM keeps the toolchain native: a linux/arm64 target is
# cross-compiled instead of running the whole Go build under QEMU. go-base
# carries the module cache and a prewarmed stdlib for both target arches.
FROM --platform=$BUILDPLATFORM intabiafusion/go-base:${BASE_VERSION} AS base

FROM base AS builder

WORKDIR /app
ENV CGO_ENABLED=0

COPY . ./

ARG TARGETOS
ARG TARGETARCH

# The cache mounts are seeded from go-base, so a cold build still starts warm.
RUN --mount=type=cache,target=/go/pkg/mod,from=base,source=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build,from=base,source=/root/.cache/go-build \
    set -xe && GOOS=${TARGETOS:-linux} GOARCH=${TARGETARCH:-amd64} go build -o /go/bin/stream ./cmd/stream

# Final runtime image. stream-base already carries ffmpeg and the stream user,
# so nothing has to run under emulation for a foreign target arch.
FROM intabiafusion/stream-base:${BASE_VERSION}

COPY --from=builder --chown=stream:stream /go/bin/stream /stream

EXPOSE 1080
USER stream

ENTRYPOINT ["/stream"]
