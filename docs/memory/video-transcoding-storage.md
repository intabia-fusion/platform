# Video transcoding: storage accounting and deletion

How an uploaded video becomes HLS artifacts, who counts them, and what happens
on delete. All of this was traced on 2026-09-16.

## The chain

1. `pods/media` sees a `TxCreateDoc` for `attachment.class.Attachment` /
   `drive.class.FileVersion` with a `video/*` content type and publishes a
   `VideoTranscodeRequest` to Kafka topic `stream.transcode.request`
   (`pods/media/src/handler.ts:37,73-83`).
2. The Go `stream` service consumes it (`internal/pkg/queue/worker.go:109-113`)
   with `task.ID = task.Source = req.BlobID`.
3. ffmpeg produces, per source blob: one master playlist, one playlist and a set
   of `.ts` segments per profile level, and one thumbnail. Names are templated
   off the source blob id (`internal/pkg/manifest/hls.go:60-73`,
   `internal/pkg/mediaconvert/command.go:134`):
   `{blobID}_master.m3u8`, `{blobID}_{profile}.m3u8`,
   `{blobID}_{seq:03d}_{profile}.ts`, `{blobID}.jpg`.
   For a 1080p source the ladder is `orig + 720p + 480p`, `-hls_time 5`, so the
   object count is `2 + N + N * ceil(duration / 5)` - a 10-minute 1080p video
   becomes 365 objects.
4. Each artifact is POSTed to `/upload/form-data/{workspace}` and then gets
   `PATCH /blob/{workspace}/{key}/parent` pointing at the source
   (`internal/pkg/uploader/uploader.go:344-352`).
5. The source blob's own metadata is patched with the playlist and thumbnail
   names (`internal/pkg/mediaconvert/transcoder.go:233-244`), which is what
   `AttachmentVideoPreview.svelte` / `VideoViewer.svelte` read to hand
   `packages/hls`'s `HlsVideo.svelte` an HLS source.

## Why transcoded output does not show up in usage right away

`datalake` skips the billing delta for service tokens. All three upload paths
carry the same guard:

- `services/datalake/pod-datalake/src/handlers/blob.ts:319-322`
- `services/datalake/pod-datalake/src/handlers/s3.ts:61-64`
- `services/datalake/pod-datalake/src/handlers/multipart.ts:143-146`

```ts
if (!isServiceToken) {
  limitsState?.sendStorageDelta(ctx, workspace, size, sha256)
}
```

`stream` always authenticates with a service token - `token.NewToken(secret,
workspace, "stream")` sets `Extra: {"service": "stream"}`
(`foundations/stream/internal/pkg/token/token.go`) - so `isServiceToken` is
true and no delta is ever emitted for HLS artifacts.

The hourly `UsageWorker` recompute does count them: `computeUsed` for
`metric === 'storage'` is absolute, straight from
`collectDatalakeStats` -> `getWorkspaceStats`
(`services/billing/pod-billing/src/limits.ts:268-272`), and that SQL filters
only on `workspace` and `deleted_at IS NULL` - no `parent` filter, no type
filter (`services/datalake/pod-datalake/src/datalake/db.ts:432-446`).

So the number is not lost, it is late by up to `USAGE_UPDATE_INTERVAL`
(default 3600s, `services/billing/pod-billing/src/config.ts:22,44`). And when
it does land, the whole HLS output is merged into the `video` bucket of
`StorageBreakdown.svelte` with no way to tell generated renditions from what
the user actually uploaded.

## Deletion actually cascades - but has three holes

`storageAdapter.remove` deletes one name at a time
(`foundations/server/packages/datalake/src/index.ts:119-124`) via
`DELETE /blob/:workspace/:name`, which routes to the *cascading*
`db.deleteBlob` - a BFS over `parent` that soft-deletes the whole subtree
(`services/datalake/pod-datalake/src/datalake/db.ts:321-358`). So deleting an
attachment does mark its renditions deleted.

The holes:

1. `SetParent` is best-effort. A failed PATCH is only logged
   (`internal/pkg/uploader/uploader.go:349-351`) and the artifact stays an
   orphan: invisible to the cascade, still counted by `getWorkspaceStats`.
2. In the live-recording path the parent is the master playlist, not a source
   blob (`internal/pkg/mediaconvert/coordinator.go:126`). `handleBlobSetParent`
   returns 400 when the parent does not exist yet
   (`handlers/blob.ts:232-235`), and segments can be uploaded before the master
   playlist is - so early segments of a recording are likely orphaned by
   construction. Worth verifying against a real stand before acting on it.
3. Nothing is ever physically removed. `db.deleteBlob` only sets `deleted_at`,
   `blob.data` rows are untouched, and `bucket.delete` (`s3/bucket.ts:154`) is
   called from exactly one place - the rollback of a failed upload
   (`datalake.ts:234`).

## Sanity stand gap

`pods/media` is in `dev/docker-compose.yaml:28` but **not** in
`tests/docker-compose.yaml`. Without it nothing publishes to
`stream.transcode.request`, so an uploaded video is never transcoded in the
sanity stand even though the `stream` service itself is there
(`tests/docker-compose.yaml:2`, proxied as `/_stream` by `tests/nginx.conf:200`).

## Fixed on 2026-09-16

1. The `!isServiceToken` guard around `sendStorageDelta` is gone from all three
   upload handlers (`handlers/blob.ts:319`, `s3.ts:61`, `multipart.ts:143`).
   Transcoded artifacts now move the usage counter immediately instead of
   waiting for the hourly absolute recompute. The service-token bypass stays on
   `isExhausted` only - a storage limit must not block transcoding of a file
   that was already accepted.
2. `getWorkspaceStats` / `getWorkspaceStatsByType` gained
   `derivedCount`/`derivedSize` via `FILTER (WHERE b.parent IS NOT NULL)`
   (`datalake/db.ts:443,488`), carried through `WorkspaceStats` /
   `WorkspaceStatsByType` (`foundations/server/packages/datalake/src/client.ts`)
   and `collectDatalakeStats` (`services/billing/pod-billing/src/billing.ts`).
   `StorageBreakdown.svelte` shows the generated share per bucket through the
   new `GeneratedVersions` string. Covered by a test in
   `services/billing/pod-billing/src/__tests__/billing.test.ts`.
3. `SetParent` retries like every other remote call - new
   `setRemoteParent` in `internal/pkg/uploader/uploader.go`, modelled on
   `deleteRemoteFile`. Note the ceiling: `RetryCount` 10 x `RetryDelay` 100ms is
   about a second, which may still lose the recording-path race where a segment
   is uploaded before its master playlist exists.

Physical deletion stays unimplemented on purpose - it is planned in
`../foundation-tasks/docs/storage-db/2026-09-16-001-datalake-blob-gc.md`
(`TSK-2026-09-16-001..008`), which also covers the non-cascading
`deleteBlobList` and a revision pass over already-accumulated orphans.

## Build commands in this worktree

foundation3 is the pnpm / TypeScript 7 tree, not rush: use
`pnpm build:lint --to @hcengineering/<pkg>` (a superset of `pnpm build`), and
`--force` to bypass the content-hashed cache. `rush fast-build:lint` and
`rushx _phase:validate` do not exist here.

## Tests (2026-09-16)

Sanity, `tests/sanity/tests/drive/video.spec.ts` - two tests, ~11s together,
stable over `--repeat-each=3` on 3 workers:

1. Upload -> transcode -> playback. Waits on the datalake stats until derived
   blobs appear, then plays the `<video>` and asserts `currentTime > 0` and
   `readyState >= 2`. The poster is the discriminator between the HLS branch and
   the plain `<video>` fallback: both render through Plyr, so `.plyr` proves
   nothing, but only the HLS branch sets `video.poster` to the generated
   thumbnail.
2. Usage grows by source + renditions, then delete frees all of it.

Measured on the live stand, a 1280x720 3s source yields 7 blobs, 6 of them
derived (~148KB): `{id}`, `{id}_master.m3u8`, `{id}_orig.m3u8`,
`{id}_480p.m3u8`, `{id}_000_orig.ts`, `{id}_000_480p.ts`, `{id}.jpg`. The
ladder is `orig + 480p`: `resconv.SubLevels("1280:720")` returns one sublevel,
not two. After deleting the file the workspace stats went back to
`{count: 0, size: 0, derivedCount: 0}` - the `parent` cascade works end to end.

Supporting pieces:
- `tests/sanity/tests/API/Datalake.ts` - stats over the nginx `/_datalake`
  prefix with a `sanity` service token, plus the polling helpers.
- `tests/make-video-fixture.sh` - generates the mp4 with the ffmpeg inside the
  `stream` image (no host ffmpeg, nothing downloaded), called from
  `tests/prepare-pg.sh` after the stand is up. Output is gitignored.
- `pods/media` added to `tests/docker-compose.yaml` - it was missing, and
  without it nothing publishes to `stream.transcode.request`.

Unit tests: `internal/pkg/uploader/uploader_test.go` covers the `SetParent`
retry, the bounded give-up and the no-source recording path (run them on Linux -
the uploader needs inotify, everything skips on macOS).
`services/datalake/pod-datalake/src/__tests__/upload-delta.test.ts` covers the
delta firing for service and user uploads and the exhausted-workspace split.
Verified by mutation: restoring the `!isServiceToken` guard fails 2 of them.

## Stand gotchas hit on the way

- `tests/docker-compose.yaml` account is on port **3003**, not 3000 as in
  `dev/docker-compose.yaml`.
- Run playwright from `tests/sanity`, not `tests/sanity/tests` - `.env` supplies
  `PLATFORM_URI` and `loginByToken` fails without it.
- `listWorkspaces` refuses an arbitrary service token; `billing` works.
