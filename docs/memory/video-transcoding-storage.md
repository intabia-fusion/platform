# Video transcoding: storage accounting and deletion

Область: [Файлы и медиа](../features/drive-media.md)

How an uploaded video becomes HLS artifacts, who counts them, and what happens on delete.

## The chain

1. `pods/media` sees a `TxCreateDoc` for `attachment.class.Attachment`/`Embedding` or `drive.class.FileVersion` with a `video/*` content type and publishes a `VideoTranscodeRequest` to Kafka topic `stream.transcode.request` (`pods/media/src/handler.ts`).
2. The Go `stream` service consumes it (`internal/pkg/queue/worker.go`) with `task.ID = task.Source = req.BlobID`.
3. ffmpeg produces, per source blob: one master playlist, one playlist and a set of `.ts` segments per profile level, and one thumbnail, named off the source blob id (`internal/pkg/manifest/hls.go`, `internal/pkg/mediaconvert/command.go`): `{blobID}_master.m3u8`, `{blobID}_{profile}.m3u8`, `{blobID}_{seq:03d}_{profile}.ts`, `{blobID}.jpg`. For a 1080p source the ladder is `orig + 720p + 480p` (`resconv.SubLevels("1920:1080")` returns `["720p", "480p"]`), `-hls_time 5`, so the object count is `2 + N + N * ceil(duration / 5)` - a 10-minute 1080p video becomes 365 objects (N=3).
4. Each artifact is POSTed to `/upload/form-data/{workspace}` and then gets `PATCH /blob/{workspace}/{key}/parent` pointing at the source, retried `RetryCount` 10 x `RetryDelay` 100ms (about a second total) before giving up (`internal/pkg/uploader/uploader.go`, `setRemoteParent`).
5. The source blob's own metadata is patched with the playlist and thumbnail names (`internal/pkg/mediaconvert/transcoder.go`), which is what `AttachmentVideoPreview.svelte`/`VideoViewer.svelte` read to hand `packages/hls`'s `HlsVideo.svelte` an HLS source.

## Storage accounting

`sendStorageDelta` fires unconditionally on every upload path, service token or user alike - there is no `isServiceToken` guard around it (`services/datalake/pod-datalake/src/handlers/blob.ts`, `s3.ts`, `multipart.ts`), so transcoded HLS artifacts move the usage counter immediately instead of waiting for a periodic recompute. The one remaining service-token bypass is on `isExhausted` (`blob.ts`, `s3.ts`, `multipart.ts`) - a storage limit must not block transcoding of a file that was already accepted. Verified by mutation: restoring the `!isServiceToken` guard around `sendStorageDelta` fails 2 cases in `services/datalake/pod-datalake/src/__tests__/upload-delta.test.ts`.

`getWorkspaceStats`/`getWorkspaceStatsByType` (`services/datalake/pod-datalake/src/datalake/db.ts`) expose `derivedCount`/`derivedSize` via `FILTER (WHERE b.parent IS NOT NULL)`, which is how `StorageBreakdown.svelte` shows the generated share per bucket (`GeneratedVersions`) separately from what the user actually uploaded - covered by `services/billing/pod-billing/src/__tests__/billing.test.ts`.

The hourly `UsageWorker` recompute (`computeUsed` for `metric === 'storage'` is absolute, straight from `getWorkspaceStats`, `services/billing/pod-billing/src/limits.ts`) still runs every `USAGE_UPDATE_INTERVAL` (default 3600s, `services/billing/pod-billing/src/config.ts`) as a reconciliation backstop - it no longer carries the deletion-to-usage latency by itself since the delta already fires on write.

## Deletion cascades but has three holes

`storageAdapter.remove` (`foundations/server/packages/datalake/src/index.ts`) deletes one name at a time via `DELETE /blob/:workspace/:name`, which routes to the cascading `db.deleteBlob` - a BFS over `parent` that soft-deletes the whole subtree (`services/datalake/pod-datalake/src/datalake/db.ts`). So deleting an attachment does mark its renditions deleted.

1. `SetParent` is best-effort - a failed PATCH is only logged (`uploader.go`) and the artifact stays an orphan: invisible to the cascade, still counted by `getWorkspaceStats`.
2. In the live-recording path the parent is the master playlist, not a source blob (`internal/pkg/mediaconvert/coordinator.go`). `handleBlobSetParent` returns 400 when the parent does not exist yet (`handlers/blob.ts`), and segments can be uploaded before the master playlist is - so early segments of a recording are likely orphaned by construction (not verified against a real stand).
3. Nothing is ever physically removed. `db.deleteBlob` only sets `deleted_at`, `blob.data` rows are untouched, and `bucket.delete` (`s3/bucket.ts`) is called from exactly one place - the rollback of a failed upload on a size mismatch (`datalake.ts`).

Physical deletion stays unimplemented on purpose - it is planned in `../foundation-tasks/docs/storage-db/2026-09-16-001-datalake-blob-gc.md` (`TSK-2026-09-16-001..008`), which also covers the non-cascading `deleteBlobList` and a revision pass over already-accumulated orphans.

## Sanity stand

`pods/media` is present in `tests/docker-compose.yaml` (service `media`, depends on `stream`/`datalake`/`redpanda`/`account`), so an uploaded video is actually transcoded in the sanity stand; `stream` itself is proxied as `/_stream` by `tests/nginx.conf`.

Measured on the live stand: a 1280x720 3s source yields 7 blobs, 6 derived (~148KB): `{id}`, `{id}_master.m3u8`, `{id}_orig.m3u8`, `{id}_480p.m3u8`, `{id}_000_orig.ts`, `{id}_000_480p.ts`, `{id}.jpg` - the ladder is `orig + 480p` since `resconv.SubLevels("1280:720")` returns one sublevel, not two. After deleting the file the workspace stats went back to `{count: 0, size: 0, derivedCount: 0}` - the `parent` cascade works end to end.

The sanity video test's poster is the discriminator between the HLS branch and the plain `<video>` fallback: both render through Plyr, so `.plyr` proves nothing, but only the HLS branch sets `video.poster` to the generated thumbnail (`tests/sanity/tests/drive/video.spec.ts`).

`tests/make-media-fixtures.sh` generates the mp4 (and a docx for the preview test) using tools inside the `stream` image (no host ffmpeg, nothing downloaded), called from `tests/prepare-pg.sh` after the stand is up; output is gitignored.

`internal/pkg/uploader/uploader_test.go` covers the `SetParent` retry, the bounded give-up and the no-source recording path - Linux-only, the uploader needs inotify, everything skips on macOS.

## Stand gotchas

- `tests/docker-compose.yaml` account is on port 3003, not 3000 as in `dev/docker-compose.yaml`.
- Run playwright from `tests/sanity`, not `tests/sanity/tests` - `.env` supplies `PLATFORM_URI` and `loginByToken` fails without it.
- `listWorkspaces` refuses an arbitrary service token; `billing` works.
- `tests/make-media-fixtures.sh` must run its containers as the caller (`--user $(id -u):$(id -g)`). The `stream` image runs as uid 1000 and cannot write into a CI runner's checkout (uitest-pg failed with `Permission denied` on PR #450); macOS Docker Desktop ignores bind-mount ownership, so it never shows locally. libreoffice under a uid without a passwd entry also needs an explicit `-env:UserInstallation=file://...` - it does not derive the profile from `HOME`.

## Related

- [../features/drive-media.md](../features/drive-media.md)
- [../stream_integration.md](../stream_integration.md)
- [../stream_service_hardening.md](../stream_service_hardening.md)
- [preview_bench](preview_bench.md) - preview pod benchmark, no overlap with this note (image thumbnails vs video/media pod).
