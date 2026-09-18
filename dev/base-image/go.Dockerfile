# Go toolchain base for the Go services.
#
# Everything a per-commit build would otherwise fetch or recompile from
# scratch lives here: golangci-lint, the CGO toolchain that `go test -race`
# needs, the module cache and a prewarmed stdlib for both target arches.
# Built from a Go module dir (see build.sh) so go.mod/go.sum are available.
FROM golang:1.27.1

ENV GO111MODULE=on
ENV GOBIN=/bin
ENV PATH=$PATH:$GOBIN
ENV GOMODCACHE=/go/pkg/mod
ENV GOCACHE=/root/.cache/go-build

# gcc/libc6-dev are only needed by `go test -race`, which requires CGO.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/*

ARG GOLANGCI_LINT_VERSION=v2.13.2
RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/HEAD/install.sh \
    | sh -s -- -b /bin ${GOLANGCI_LINT_VERSION}

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

# Prewarm the build cache for both target arches so cross-compiles start warm.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build std \
    && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build std
