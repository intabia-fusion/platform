# Stream Service Integration

Map of how the platform talks to `foundations/stream` — upload, transcode, playback.

## Components

| Component | Path | Role |
|---|---|---|
| Stream service | `foundations/stream` (Go) | TUS upload endpoint, ffmpeg transcoder, writes HLS into datalake |
| Datalake | `services/datalake` | Blob store HTTP API — actual origin for HLS segments + playlist |
| Media pod | `pods/media` | Kafka consumer/producer, writes HLS metadata back to TxCUD |
| Love service | `services/love` | LiveKit egress controller — records meetings to blob store |
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
        | (server/front/src/starter.ts:99,111,                       | form-data/{ws}
        |  desktop/src/ui/platform.ts:356)                           | (fasthttp +
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

- Client: `plugins/recorder-resources/src/uploader.ts` (~lines 35-83) — `tus-js-client`, resumable, chunked.
- Server: stream service TUS handler writes into temp dir, triggers uploader -> S3.
- Endpoint base: `STREAM_URL` (client config).

### Config wiring

| Var | Consumer | File | Notes |
|---|---|---|---|
| `STREAM_URL` | Front / Desktop | `server/front/src/starter.ts:99`, `desktop/src/ui/platform.ts:356` | TUS upload target |
| `DATALAKE_URL` | Front / Desktop | `server/front/src/starter.ts:111` | Blob read target (HLS playback) |
| `STREAM_ENDPOINT_URL` | Stream service | `internal/pkg/config/config.go:35` | Backend: `datalake://localhost:4030` (prod) or `s3://...` |

### Kafka topics

| Topic | Producer | Consumer | Payload type |
|---|---|---|---|
| `stream.transcode.request` | `pods/media/src/index.ts` (~64-72) | Stream service | `VideoTranscodeRequest` / `TranscodeRequest` (`pods/media/src/types.ts` <-> `foundations/stream/.../queue.go`) |
| `stream.transcode.result` | Stream service | `pods/media/src/index.ts` (~31-32) | `VideoTranscodeResult` / `TranscodeResult` |

Types in TS (`types.ts`) mirror Go (`queue.go`) — keep both sides in sync when changing fields.

### HLS playback

- Player: `packages/hls/src/components/HlsVideo.svelte` (hls.js + Plyr).
- Callers: `VideoViewer.svelte`, `AttachmentVideoPreview.svelte`.
- Source URL = `DATALAKE_URL/blob/{ws}/playlist.m3u8`. Stream service is **not** in the read path.

## Ownership boundaries

- Stream service owns: TUS ingest, ffmpeg process lifecycle, HLS segment upload to datalake, queue consumption.
- Datalake owns: blob storage + read API (`/blob/{ws}/{key}`).
- Media pod owns: TxCUD <-> Kafka bridge, blob metadata updates.
- Love owns: LiveKit egress lifecycle.
- Stream service does **not** serve HLS bytes — datalake does.

## Where to look when something breaks

| Symptom | First stop |
|---|---|
| Upload stalls in browser | `tus-js-client` retries, `STREAM_URL`, stream pod logs |
| Meeting recording never transcodes | media pod Kafka lag, `stream.transcode.request` |
| HLS playback 404 | S3 blob key, `playlist.m3u8` uploader completion |
| OOM / log flood in stream | `LOG_LEVEL`, `FFMPEG_LOG_LEVEL`, `MAX_PARALLEL_TRANSCODING_COUNT` |
