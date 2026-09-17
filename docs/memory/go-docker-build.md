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

## node:24 is bookworm (2026-09-16)

`node:24` and `node:24-slim` still resolve to Debian 12 bookworm, which is oldstable
and frozen. Rebuilding a node-based base image therefore bumps only node itself -
v20260309 -> v20260916 moved node 24.20.0 -> 24.21.0 and nothing else in
`preview-base`. `golang:1.27.1` is already trixie.

`preview-base` switched to `node:24-trixie`: ffmpeg 5.1.9 -> 7.1.5, libreoffice
7.4.7 -> 25.2.3, poppler 22.12 -> 25.03. The flags the preview pod passes
(`pods/preview/src/utils/ffmpeg.ts`, `libreoffice.ts`) all still exist.
Verified A/B beside a live stand without touching it: same `bundle.js` copied from
`intabiafusion/preview:latest` onto the trixie base, run on the `sanity_default`
network, and `tests/sanity/tests/drive/preview.spec.ts` pointed at it with
`PREVIEW_URL`. Removing the libreoffice binary turns the docx case into a 500, so
the test is not vacuous.

**`pods/preview/Dockerfile` still pins `preview-base:v20260309`.** Bump it only after
a base tag containing the trixie change is published - pinning an unpublished tag
is exactly what broke uitest on PR #450.

LibreOffice is not a substitute for Chromium as an HTML -> PDF renderer: on the same
page it dropped flexbox, grid, table borders/width and border-radius, all of which
Chromium kept. Details and the print-service direction in
`../foundation-tasks/docs/collab/2026-09-16-101-print-service-pdf.md`.

`rekoni-base` also moved to `node:24-trixie` (poppler 22.12 -> 25.03 for the
`pdftotext -layout` call in `services/rekoni/src/extractors/pdf.ts`). Checked on a
real 10-page Cyrillic PDF with a table and diagrams: identical 786 words, one line
shifted by a single space; `sharp` and `pdfjs-dist` load. `antiword` and `unrtf` are
the same upstream versions in trixie. `html2text` is installed there but nothing in
`services/rekoni/src` calls it. Same caveat as preview: bump
`services/rekoni/Dockerfile`'s base pin only after the tag is published.

Print on prod (2026-09-16): `print()` in `services/print/pod-print/src/print.ts`
opens the page and calls `goto` before its `try/finally`, so a navigation timeout
leaks the tab; a few leaks wedge the shared Chromium (`Target.createTarget timed out`)
and `getBrowser` never relaunches a browser that is still `connected`. Tracked as
TSK-2026-09-16-108/109 in `../foundation-tasks/docs/collab/2026-09-16-101-print-service-pdf.md`.

## v20260917 pin bump (2026-09-17)

Switched to `v20260917`: `pods/preview` (trixie: ffmpeg 7.1.5, libreoffice 25.2.3, poppler 25.03),
`services/rekoni` (trixie, poppler 25.03), `services/print/pod-print` (Chromium 151 -> 152) and
`services/ai-bot/love-agent` (deps baked against the current lock). Each verified A/B next to a live
stand with the stand's own bundle copied onto the new base, so only the base differs:
- preview: `preview.spec.ts` via `PREVIEW_URL`, 4/4.
- rekoni: `POST /toText` on a real 10-page PDF, identical 786-word sequence to the stand pod.
- print: same guest document, 10 pages, identical text, `Skia/PDF m151` -> `m152`, 6s. The A/B print
  pod shares nginx's network namespace like the stand one, so it needs `PORT` to avoid 4005.
- love-agent: on `v20260309` the pod's `pnpm install --frozen-lockfile` re-resolved `+305 -216` packages
  in 10.6s (base was baked with pnpm 11 against an older lock); on `v20260917` it is a 94ms no-op.

Then every remaining pin followed (27 `base-slim`, 10 `base`, 2 `front-base`, and `foundations/stream`
`BASE_VERSION`), so the whole repo is on `v20260917`. For those images the only change is node
24.20.0 -> 24.21.0: not a security release, but module ABI is unchanged (`modules 137`), it carries
OpenSSL 3.5.8, root certs NSS 3.126, Undici 7.29.1 (our `fetch`) and memory-safety fixes (http2
use-after-free on `rst_stream`, buffer string-write offset overflow, `mkdtemp` out-of-bounds write).
Native modules baked into the bases (`bufferutil`, `utf-8-validate`, `snappy`, `msgpackr`,
`msgpackr-extract`, `sharp` where installed) load on the new tags.

