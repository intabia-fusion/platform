# Stream

[![X (formerly Twitter) Follow](https://img.shields.io/twitter/follow/huly_io?style=for-the-badge)](https://x.com/huly_io)
![GitHub License](https://img.shields.io/github/license/hcengineering/platform?style=for-the-badge)

`stream` is a Go service that ingests video, transcodes it into HLS, and uploads the
resulting segments to S3 or Datalake storage. It exposes an HTTP API for direct
uploads (TUS protocol) and consumes a Kafka queue for scheduled transcoding of
already-uploaded sources.

## What it does

1. **Ingest** — accepts a source video via one of two paths:
    - `POST /recording` — TUS-resumable upload (live recording path).
    - `POST /transcoding` — schedules a transcoding job for a source that
      already exists in storage. The job is placed on a queue and processed by a
      worker.
2. **Probe** — runs `ffprobe` to read the source metadata (codec, resolution,
   duration, audio presence).
3. **Plan** — selects a set of output profiles (resolutions + bitrates) based
   on the source resolution, see `internal/pkg/profile` and `internal/pkg/resconv`.
4. **Transcode** — runs `ffmpeg` to produce:
    - a thumbnail (first frame),
    - one HLS rendition per profile (one `ffmpeg` invocation, multiple `-map`
      outputs to share a single decode),
    - the master `.m3u8` manifest (see `internal/pkg/manifest`).
5. **Upload** — an async uploader (`internal/pkg/uploader`) streams each
   finished `.ts` segment and playlist to the configured storage backend
   (`s3://` or `datalake://`) with retries and bounded concurrency.
6. **Metadata** — patches the source record with the playlist URL, thumbnail
   URL, and video dimensions (when the storage backend supports metadata).

### Process model

- Transcoding work is CPU-bound and happens in an `ffmpeg` subprocess managed by
  `internal/pkg/executor`.
- `stdout` and `stderr` of every subprocess are streamed line-by-line through
  bounded **ring buffers** (64 KiB tail each). Memory use stays constant
  regardless of how long `ffmpeg` runs. On process failure, the last 64 KiB of
  `stderr` is emitted through the structured logger for diagnostics; on success
  nothing is retained.
- The **application log level** (`STREAM_LOG_LEVEL`) and the **ffmpeg log
  level** (`STREAM_FFMPEG_LOG_LEVEL`) are configured independently. `ffmpeg`
  defaults to `error` so per-frame debug output does not flood pod logs or
  overwhelm the log pipeline.
- `MAX_PARALLEL_TRANSCODING_COUNT` caps how many transcoding jobs run
  concurrently on a single service instance; `MAX_THREAD_COUNT` caps the
  `-threads` flag passed to each `ffmpeg`. Both default to `1` — tuned for a
  2 CPU / 2 GiB pod. Raise both on larger hardware.

### Key packages

| Path | Responsibility |
|------|----------------|
| `cmd/stream` | Entrypoint, config loading, OpenTelemetry setup. |
| `internal/pkg/api/v1/recording` | TUS upload handler. |
| `internal/pkg/api/v1/transcoding` | REST handler that schedules a transcoding job. |
| `internal/pkg/config` | Env-based configuration (see table below). |
| `internal/pkg/executor` | Subprocess execution with bounded stdout/stderr ring buffers. |
| `internal/pkg/mediaconvert` | `ffmpeg`/`ffprobe` orchestration: command builders, scheduler, transcoder, coordinator. |
| `internal/pkg/manifest` | HLS master playlist generation. |
| `internal/pkg/profile` | Output profile definitions (resolution, codec, CRF). |
| `internal/pkg/queue` | Kafka consumer/worker for scheduled jobs. |
| `internal/pkg/resconv` | Source resolution → target rendition ladder. |
| `internal/pkg/sharedpipe` | One-writer / many-readers in-memory pipe (used when a single upload must feed multiple consumers). |
| `internal/pkg/storage` | S3 and Datalake backends with a common `Storage` interface. |
| `internal/pkg/token` | JWT issuing / validation for datalake auth. |
| `internal/pkg/uploader` | Async worker pool that ships finished segments to storage. |

## Supported formats

- **Input:** any container/codec `ffmpeg` can decode. Explicitly tested:
  `mp4`, `webm`, `mkv` (including 4K HDR sources).
- **Output:** HLS (`.m3u8` playlist + `.ts` segments) with AVC/AAC.

## Installation

### Prerequisites

- [Go](https://golang.org/dl/) 1.26.2+
- [ffmpeg](https://www.ffmpeg.org/download.html) and `ffprobe` on `PATH`

### Build

```bash
go mod tidy
docker build . -t hcengineering/stream:latest
```

## Configuration

All configuration is via environment variables with the `STREAM_` prefix.
Defaults shown below match the in-code defaults.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `STREAM_LOG_LEVEL` | string | `info` | Log level of the Go service itself. |
| `STREAM_FFMPEG_LOG_LEVEL` | string | `error` | `-v` value passed to `ffmpeg`. Independent from the app log level. Values: `quiet`, `panic`, `fatal`, `error`, `warning`, `info`, `verbose`, `debug`, `trace`. |
| `STREAM_SERVER_SECRET` | string | — | Secret used to issue and verify service tokens. Required unless `STREAM_INSECURE=true`. |
| `STREAM_PPROF_ENABLED` | bool | `true` | Expose `net/http/pprof` on `localhost:6060`. |
| `STREAM_INSECURE` | bool | `false` | Skip authorization checks. Dev-only. |
| `STREAM_SERVE_URL` | string | `0.0.0.0:1080` | Listen address. |
| `STREAM_BASE_URL` | string | — | Public URL that serves streams (used when generating playlist URLs). |
| `STREAM_ENDPOINT_URL` | URL | `s3://127.0.0.1:9000` | S3 or Datalake endpoint. Scheme selects the backend: `s3://...` or `datalake://...`. |
| `STREAM_MAX_PARALLEL_TRANSCODING_COUNT` | int | `1` | Number of transcoding jobs that may run concurrently on one instance. |
| `STREAM_MAX_THREAD_COUNT` | int | `1` | Value passed as `-threads` to each `ffmpeg`. `0` lets `ffmpeg` auto-select. |
| `STREAM_OUTPUT_DIR` | string | `/tmp/transcoding/` | Working directory for in-progress transcoding output. |
| `STREAM_TIMEOUT` | duration | `5m` | Timeout for a single upload. |
| `STREAM_QUEUE_CONFIG` | string | — | Kafka queue configuration. |
| `STREAM_REGION` | string | — | Service region tag. |
| `STREAM_OTEL_ENABLED` | bool | `true` | Enable OpenTelemetry. |
| `STREAM_OTEL_SERVICE_NAME` | string | `stream` | Service name in telemetry. |
| `STREAM_OTEL_SERVICE_VERSION` | string | `1.0.0` | Service version in telemetry. |
| `STREAM_OTEL_TRACES_ENABLED` | bool | `true` | Enable OTel traces. |
| `STREAM_OTEL_METRICS_ENABLED` | bool | `true` | Enable OTel metrics. |
| `STREAM_OTEL_LOGS_ENABLED` | bool | `false` | Enable OTel logs. |

### S3-specific env

If `STREAM_ENDPOINT_URL` uses the `s3://` scheme:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

### Sizing guidance

The defaults (`MAX_PARALLEL_TRANSCODING_COUNT=1`, `MAX_THREAD_COUNT=1`) are
chosen for small 2 CPU / 2 GiB pods: slower, but reliably bounded memory.
For larger hardware raise both independently:

```
STREAM_MAX_PARALLEL_TRANSCODING_COUNT=2
STREAM_MAX_THREAD_COUNT=4
```

## Usage

### TUS upload

```bash
curl -X POST http://localhost:1080/recording \
     -H "Tus-Resumable: 1.0.0" \
     -H "Upload-Length: <file-size>" \
     --data-binary @path/to/your/file.mp4
```

A real TUS client is required for production usage. Example client code is
available in [tus-js-client](https://github.com/tus/tus-js-client/blob/main/demos/browser/video.html).

### Schedule a transcoding job

```bash
curl -X POST http://localhost:1080/transcoding \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{
         "source": "<input file name>",
         "format": "hls",
         "workspace": "test"
     }'
```

## Testing

Unit tests:

```bash
go test ./...
```

### Integration test with a real video file

A large-video integration test lives in
`internal/pkg/mediaconvert/integration_test.go`. It is opt-in because the
input can be many gigabytes:

```bash
STREAM_TEST_MKV="/path/to/source.mkv" \
STREAM_TEST_DURATION=60 \
    go test -run TestTranscodeRealMKV ./internal/pkg/mediaconvert/ -v -timeout=20m
```

The test transcodes a capped-duration slice of the input with a single 480p
profile on a single thread, then asserts:

- `ffmpeg` exits successfully,
- at least one `.ts` segment and one `.m3u8` playlist are written,
- Go heap growth stays below 256 MiB (validates that the executor ring buffer
  is keeping memory bounded).

### Stderr back-pressure test

`internal/pkg/executor/executor_test.go:TestCommandExecutor_BoundedMemoryOnNoisyStderr`
runs a subprocess that emits ~20 MiB of stderr and asserts that heap growth
stays under 4 MiB.

## Contributing

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request describing your changes.

## License

This project is licensed under the [Eclipse Public License v2.0](LICENSE).
