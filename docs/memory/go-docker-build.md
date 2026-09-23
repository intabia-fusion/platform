# Go docker builds (foundations/stream)

Область: [Сборка и инструменты](../getting-started.md)

`foundations/stream/Dockerfile` builds `--platform=$BUILDPLATFORM` and cross-compiles with `GOOS=$TARGETOS GOARCH=$TARGETARCH` (`CGO_ENABLED=0`), so a multiplatform build never runs the Go toolchain emulated under QEMU. The runtime stage can't use `$BUILDPLATFORM` (must match the target), so its `apk add ffmpeg` is native work - moved into the prebuilt `intabiafusion/stream-base` image, leaving only a `COPY` in that stage.

Go lint and tests run in **no** active CI pipeline: `foundations/stream/.github/workflows/main.yaml` is nested and GitHub only reads the repo-root `.github/workflows/`; none of those files run a Go step.

Base images: `dev/base-image/go.Dockerfile` -> `intabiafusion/go-base` (golangci-lint, gcc/libc6-dev for `go test -race`, prewarmed module cache + stdlib for amd64/arm64, built with `foundations/stream` as context so `go.mod`/`go.sum` are reachable); `dev/base-image/stream.Dockerfile` -> `intabiafusion/stream-base` (alpine + ffmpeg + `stream` user). The stream build's cache mounts use `from=base,source=...` so a cold builder seeds module/build caches from the base image instead of an empty dir.

golangci-lint must track the Go toolchain minor: a linter built against an older Go panics in `goanalysis` on sources from a newer one, and refuses a `run.go` config newer than its own build. Repo is on Go 1.27.1 / golangci-lint v2.13.2 (`foundations/stream/go.mod`, `foundations/stream/.golangci.yaml`).

`node` and `node:24-slim` resolve to Debian 12 bookworm (oldstable, frozen) - rebuilding a node-based base image on those tags therefore bumps only Node itself. `dev/base-image/preview.Dockerfile` and `rekoni.Dockerfile` use `node:24-trixie` instead to get current ffmpeg/libreoffice/poppler/tools.

LibreOffice is not a substitute for Chromium as an HTML -> PDF renderer: on the same page it drops flexbox, grid, table borders/width and border-radius that Chromium keeps.

All prebuilt base images (`base`, `base-slim`, `front-base`, `preview-base`, `rekoni-base`, `print-base`, `love-agent-base`, and `foundations/stream`'s `BASE_VERSION`) are pinned to the same tag across every Dockerfile that references one - grep `FROM intabiafusion/.*-base:` to find the current tag before bumping just one image; a base tag must be published before any Dockerfile is pinned to it (an unpublished tag broke uitest on PR #450).

Go dependencies in `foundations/stream` are deliberately held back (verify against `go.mod` before assuming a CVE applies): `aws-sdk-go-v2/service/s3`, `fasthttp`, `tusd/v2`, `go.opentelemetry.io/otel` are all several minors behind upstream latest.

## Связанные документы

- [../getting-started.md](../getting-started.md) - build commands.
