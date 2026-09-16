# Go docker builds (foundations/stream)

## Why the multiplatform build was slow

`FROM golang:1.26.2` without `--platform=$BUILDPLATFORM` means that under
`DOCKER_EXTRA='--platform=linux/amd64,linux/arm64'` (set by `.gitlab-ci.yml` on
tags) the whole Go toolchain runs emulated under QEMU for the foreign arch.
Fixed by pinning the toolchain to the build platform and cross-compiling with
`GOOS/GOARCH=$TARGETOS/$TARGETARCH` (`CGO_ENABLED=0`, so cross-compile is free).

The runtime stage cannot use `$BUILDPLATFORM` - it must match the target - so
its `apk add ffmpeg` was the remaining emulated work. Moved into the prebuilt
`intabiafusion/stream-base` image, leaving only a `COPY` in that stage.

## Dead stages

The old Dockerfile had `deps`, `linter` and `tester` stages. Nothing in the
final image depended on them, and BuildKit prunes unreferenced stages, so they
never ran. Removed.

Go lint and tests currently run in **no** active CI pipeline:
`foundations/stream/.github/workflows/main.yaml` is nested, and GitHub only
reads the repo-root `.github`; `.gitlab-ci.yml` / `ci_test.sh` have no Go step.

## Base images

- `go.Dockerfile` -> `intabiafusion/go-base`: golangci-lint, gcc/libc6-dev (for
  `go test -race`), the module cache for stream's `go.sum`, prewarmed stdlib
  for amd64 + arm64. Built with `../../foundations/stream` as context so
  `go.mod`/`go.sum` are reachable (same trick as `love-agent.Dockerfile`).
- `stream.Dockerfile` -> `intabiafusion/stream-base`: alpine + ffmpeg + the
  `stream` user.

Cache mounts in the stream build use `from=base,source=...` so a cold builder
seeds the module and build caches from the base image instead of an empty dir.

## Toolchain bump (2026-09-16)

Go 1.26.2 -> 1.27.1, golangci-lint v2.5.0 -> v2.13.2, `FROM alpine` pinned to
`alpine:3.24` (ffmpeg 8.1.2). `go.mod` `go` directive and `.golangci.yaml`
`run.go` follow. `go mod tidy` was a no-op, `go build`/`go test ./...` pass.

The linter bump is not optional: v2.5.0 is built with Go 1.25 and refuses a
`run.go: "1.27"` config, and panics in `goanalysis` on Go 1.27 sources.

v2.13.2 surfaced 25 pre-existing `goconst` findings (`min-len: 2`,
`min-occurrences: 3`, `run.tests: true` is an aggressive combination). Nothing
ran the linter before, so these were debt, not a regression. Cleared:

- Production code got constants where a typo would be a silent bug: the
  resolution ladder labels in `resconv` (the same strings key three parallel
  maps), `codecH264`/`codecAAC`/`codecCopy` in `profile`, and two distinct
  `"hls"` constants in `mediaconvert` - `formatHLS` is the ffmpeg `-f` muxer
  name, `metaKeyHLS` is the storage metadata key players read the playlist
  from. Deliberately not merged into one.
- Tests got `goconst.ignore-tests: true` instead: repeated literals are what
  makes a table-driven test readable.

`golangci-lint run` is now clean (0 issues) and `go test ./...` passes.

Go dependencies are deliberately left stale (aws-sdk-go-v2/s3 v1.77 vs v1.113,
fasthttp v1.59 vs v1.74, tusd v2.6 vs v2.10, otel v1.38 vs v1.46).

Node stays on 24: `.nvmrc` is `v24` and the whole monorepo targets that LTS,
even though `node:26` exists.
