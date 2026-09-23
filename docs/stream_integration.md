# Stream Service Integration

Map of how the platform talks to `foundations/stream` - upload, transcode, playback. For the package/file map and the media-pod feature list, see [drive-media.md](features/drive-media.md); this document covers the cross-service wiring the features doc does not: Kafka topics, config vars, and the TUS/playback protocol.

## Components

| Component | Path | Role |
|---|---|---|
| Stream service | `foundations/stream` (Go) | TUS upload endpoint, ffmpeg transcoder, writes HLS into datalake |
| Datalake | `services/datalake` | Blob store HTTP API - actual origin for HLS segments + playlist |
| Media pod | `pods/media` | Kafka consumer/producer, writes HLS metadata back to TxCUD |
| Love service | `services/love` | LiveKit egress controller - records meetings to blob store |
| Recorder plugin | `plugins/recorder-resources` | Browser TUS client (`tus-js-client`) |
| Front / Desktop | `server/front`, `desktop` | Injects `STREAM_URL` + `DATALAKE_URL` into client config |
| HLS player | `packages/hls` | hls.js + Plyr; reads playlist via `DATALAKE_URL`, not stream |

## Flows

### 1. Direct recording (browser/desktop -> stream)

```
+---------------+          POST /recording (TUS)          +------------------+
|  Browser /    |  ------------------------------------>  |  Stream service  |
|  Desktop app  |     tus-js-client resumable upload      |  (Go, foundations|
|  recorder-res |                                         |   /stream)       |
+-------+-------+                                         +---------+--------+
        ^                                                           |
        | STREAM_URL + DATALAKE_URL from /config.json                | POST /upload/
        | (server/front/src/starter.ts,                              | form-data/{ws}
        |  desktop/src/ui/platform.ts)                                | (fasthttp +
        |                                                            |  Bearer token)
        |                                                            v
        |                                                   +--------+--------+
        |   GET DATALAKE_URL/blob/{ws}/playlist.m3u8        |    Datalake     |
        +-------------------------------------------------- +  (.ts + .m3u8)  |
                                                            +--------+--------+
                                                                     |
                                                                     v
                                                            underlying S3 / FS
```

### 2. Meeting recording (love -> livekit -> media -> stream)

```
+----------+   EgressClient   +-----------+   mp4 blob   +-----------+
|  Love    |----------------->|  LiveKit  |------------->| Datalake  |
| service  |                  |  Server   |              |  (blob)   |
+----------+                  +-----------+              +-----+-----+
                                                               |
                                                               | TxCUD(Blob created)
                                                               v
                                                         +-----+-----+
                                                         | media pod |
                                                         | (Kafka    |
                                                         |  producer)|
                                                         +-----+-----+
                                                               |
                              Kafka: stream.transcode.request  |
                                                               v
                                                     +---------+--------+
                                                     |  Stream service  |
                                                     |  consumes topic, |
                                                     |  pulls mp4,      |
                                                     |  ffmpeg -> HLS,  |
                                                     |  uploads segments|
                                                     +---------+--------+
                                                               |
                              Kafka: stream.transcode.result   |
                                                               v
                                                         +-----+-----+
                                                         | media pod |
                                                         | writes    |
                                                         | HLS meta  |
                                                         | (TxCUD)   |
                                                         +-----+-----+
                                                               |
                                                               v
                                                        Frontend sees
                                                        playlist blob,
                                                        renders in
                                                        HlsVideo.svelte
```

## Integration points

### HTTP: `POST /recording` (TUS)

- Client: `plugins/recorder-resources/src/uploader.ts`, `TusUploader` class - `tus-js-client`, resumable, 2MB chunks, `uploadLengthDeferred`.
- Server: `cmd/stream/main.go` mounts the tusd recording handler (`internal/pkg/api/v1/recording`) at `/recording`; `internal/pkg/mediaconvert/coordinator.go`'s `StreamCoordinator` implements the tusd `DataStore` and uploads received chunks via `internal/pkg/uploader` to the backend selected by `STREAM_ENDPOINT_URL` (datalake by default, see config table below).
- Endpoint base: `STREAM_URL` (client config).

### Config wiring

| Var | Consumer | File | Notes |
|---|---|---|---|
| `STREAM_URL` | Front / Desktop | `server/front/src/starter.ts` (`streamUrl`), `desktop/src/ui/platform.ts` (`recorder.metadata.StreamUrl`) | TUS upload target |
| `DATALAKE_URL` | Front / Desktop | `server/front/src/starter.ts` (`datalakeUrl`), `desktop/src/ui/platform.ts` (`presentation.metadata.DatalakeUrl`) | Blob read target (HLS playback) |
| `STREAM_ENDPOINT_URL` | Stream service | `internal/pkg/config/config.go`, `Config.EndpointURL` | Backend: `datalake://datalake:4030` in `dev/docker-compose.yaml`, `datalake://datalake:4031` in `tests/docker-compose.yaml` (ports differ between the two composes), or `s3://...` outside compose |

### Kafka topics

| Topic | Producer | Consumer | Payload type |
|---|---|---|---|
| `stream.transcode.request` | `pods/media` (`handler.ts`, `handleCreateDocTx`; producer wired in `index.ts`) | Stream service (`internal/pkg/queue/worker.go`, `Worker.processMessage`) | `VideoTranscodeRequest` / `TranscodeRequest` (`pods/media/src/types.ts` <-> `foundations/stream` `queue.go`) |
| `stream.transcode.result` | Stream service (`internal/pkg/queue/worker.go`, `Worker.processMessage`) | `pods/media` (`handler.ts`, `handleTranscodeResult`; consumer wired in `index.ts`) | `VideoTranscodeResult` / `TranscodeResult` |

Types in TS (`types.ts`) mirror Go (`queue.go`) - keep both sides in sync when changing fields.

### HLS playback

- Player: `packages/hls/src/components/HlsVideo.svelte` (hls.js + Plyr).
- Callers: `VideoViewer.svelte`, `AttachmentVideoPreview.svelte`.
- Source URL is resolved through `getFileUrl` (`packages/presentation/src/file.ts`) -> the active `FileStorage` backend; with the default `DatalakeStorage` backend this is `DATALAKE_URL/blob/{ws}/{file}`. Stream service is **not** in the read path.

## Ownership boundaries

- Stream service owns: TUS ingest, ffmpeg process lifecycle, HLS segment upload to datalake, queue consumption.
- Datalake owns: blob storage + read API (`/blob/{ws}/{key}`).
- Media pod owns: TxCUD <-> Kafka bridge, blob metadata updates.
- Love owns: LiveKit egress lifecycle.
- Stream service does **not** serve HLS bytes - datalake does.

## Where to look when something breaks

| Symptom | First stop |
|---|---|
| Upload stalls in browser | `tus-js-client` retries, `STREAM_URL`, stream pod logs |
| Meeting recording never transcodes | media pod Kafka lag, `stream.transcode.request` |
| HLS playback 404 | S3 blob key, `playlist.m3u8` uploader completion |
| OOM / log flood in stream | `LOG_LEVEL`, `FFMPEG_LOG_LEVEL`, `MAX_PARALLEL_TRANSCODING_COUNT` |

## Связанные документы

- [features/drive-media.md](features/drive-media.md)
- [stream_service_hardening.md](stream_service_hardening.md) - transcoder CRF/preset reference
- [memory/video-transcoding-storage.md](memory/video-transcoding-storage.md) - full HLS artifact chain, billing accounting, deletion cascade holes
- [memory/preview_bench.md](memory/preview_bench.md) - preview pod (images), not video
