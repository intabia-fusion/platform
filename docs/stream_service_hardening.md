# Stream Service Hardening — session progress

Branch: `FUSIO-324`. Goal: make `foundations/stream` reliable on k8s
(3 nodes × 2 CPU × 2 GB) without OOM / log flood, plus fill test gaps.

## Done

### Reliability / performance
- **Bounded stderr/stdout memory** — `internal/pkg/executor/executor.go` replaced
  unbounded `bytes.Buffer` with 64KB ring buffer (`MaxStderrTailBytes`). Streams
  ffmpeg output to logger via `bufio.Scanner`, emits stderr tail only on failure.
  - Test: `TestCommandExecutor_BoundedMemoryOnNoisyStderr` (20MB stderr → <4MB heap).
- **Split app vs ffmpeg log levels** — `config.Config.LogLevel=info` (app),
  new `FfmpegLogLevel=error` (ffmpeg `-v`). Resolved via
  `mediaconvert.resolveFfmpegLogLevel` in scheduler.go / transcoder.go.
- **Single-threaded defaults** — `MaxParallelTranscodingCount=1`,
  `MaxThreadCount=1`. Knobs remain configurable for larger hardware.
- **sharedpipe data race fix** — `Write()` copies input buffer before
  publishing the chunk (`internal/pkg/sharedpipe/shared_pipe.go`).
- **Config bug** — fixed broken struct tag for `BaseURL` (stray quote inside
  `desc`, envconfig failed to parse silently).

### Build
- **Go 1.26.2** — bumped in `go.mod`, `.golangci.yaml`, `.github/workflows/main.yaml`,
  `Dockerfile`.
- **Docker BuildKit caches** — `Dockerfile` uses `--mount=type=cache` for
  `GOMODCACHE`, `GOCACHE`, `golangci-lint`. New `tester` stage runs
  `go test -race -count=1 ./...` (CGO on, gcc installed).
- **golangci-lint** integrated (v2.5.0). Config at `.golangci.yaml`.
- **goheader relaxed** — template now accepts either
  `Hardcore Engineering Inc.` or `Intabia Fusion.` via regex values
  (`COPYRIGHT_LINE`). New files use Intabia Fusion per repo policy.

### Tests added
- `internal/pkg/executor/executor_test.go` — ring-buffer memory bound.
- `internal/pkg/uploader/uploader_test.go` — 5 cases (happy, retries,
  give-up, cancel rollback, nil-storage panic). Linux-only (inotify).
- `internal/pkg/mediaconvert/integration_test.go` — real MKV transcode,
  opt-in via `STREAM_TEST_MKV` env + `-t <dur>`. Validates .ts/.m3u8 +
  heap < 256MB.
- `internal/pkg/api/v1/transcoding/handler_test.go` — 7 cases: path
  validation, auth, malformed JSON, unsupported format, HLS
  case-insensitive, queue full (429), large body.
- `internal/pkg/storage/datalake_test.go` — 17 cases against
  `httptest.Server`: Put/Get/Stat/Delete/SetParent, auth header,
  content-type detection, URL-join edge, NewStorageByURL validation.

### Docs
- `foundations/stream/README.md` rewritten — pipeline, packages, sizing,
  env vars, test coverage.
- `docs/stream_integration.md` — how platform talks to stream
  (direct recording + meeting recording flows, ASCII diagrams).
  Corrected: HLS lands in **datalake**, not S3 directly. Playback via
  `DATALAKE_URL`, stream is not in the read path.

## Pending

- **#11 Scheduler/Transcoder e2e** — fake ffmpeg + fake datalake,
  exercise the full `processTask` pipeline (token → stat → get → transcode
  → upload → set parent → result publish). No real ffmpeg needed if we
  inject a fake binary path.
- **#14 TUS upload test in `ws-tests/api-tests`** — hit
  `http://localhost:8083/_stream/recording` via `tus-js-client`. Stack already
  runs stream + datalake per `ws-tests/docker-compose.yaml:2-14`. Reuse
  workspace token setup from `storage.test.ts`. Cases: happy path upload
  → blob in datalake, resumable abort/resume, reject without token.
- **Earlier deferred** — sharedpipe chunk release after all readers read
  (requires API change to track reader count; left for later).
- **Recording handler tests** — hard to unit-test (tusd handler wraps
  `mediaconvert.StreamCoordinator` which needs ffmpeg). Covered better by
  `#14` end-to-end.

## Transcoding quality — how it works

Not a pending item, captured here for future reference.

- Profiles live in `internal/pkg/profile/profile.go`. Each has
  `Height`, `CRF`, `VideoCodec`, `AudioCodec`, `Scale`.
- CRF table (libx264, lower = better): 360p=28, 480p=27, 720p=25,
  1080p=23, 1440p=23, 2160p=22, 4320p=22.
- Encoder preset is **hard-coded** to `veryfast`
  (`mediaconvert/command.go:147`). No config knob.
- Segment settings also fixed: `-hls_time 5`, `-g 60`,
  `-preset veryfast`, `split_by_time+temp_file`, `-hls_list_size 0`.
- Profile selection: `DefaultTranscodingProfiles` in `strategy.go`
  picks original (copy if codec is HLS-friendly, transcode otherwise) +
  sublevels via `resconv.SubLevels` based on input resolution.
- No per-request quality override — clients can't pick CRF/bitrate.
  `TranscodeRequest` (`queue.go`) carries source/workspace/format only.
- To adjust quality: edit `profile.go` CRF values or add a config knob
  that overrides CRF / preset. Potential future work.
