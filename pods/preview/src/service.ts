//
// Copyright © 2025 Hardcore Engineering Inc.
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { type Blob, type MeasureContext, type WorkspaceUuid, RateLimiter, withContext } from '@hcengineering/core'
import { type StorageAdapter } from '@hcengineering/server-core'
import { LRUCache } from 'lru-cache'

import { type Cache, withCache } from './cache'
import { type Config } from './config'
import { BadRequestError, NotFoundError, ToolError } from './error'
import { DocProvider, ImageProvider, FallbackProvider, PdfProvider, VideoProvider } from './providers'
import { TemporaryDir } from './tempdir'
import { type PreviewFile, type PreviewMetadata, type PreviewProvider } from './types'
import { transformImage } from './utils/sharp'
import { SingleFlight } from './singleflight'
import { OctetStreamProvider } from './providers/octet'

// How long a blob that ffmpeg or LibreOffice failed on is refused, and how many are kept.
const REFUSAL_TTL = 10 * 60 * 1000
const REFUSAL_MAX = 1000
// The metadata of a blob is kept for this long, for up to this many blobs.
const METADATA_TTL = 60 * 60 * 1000
const METADATA_MAX = 1000

export interface ThumbnailParams {
  fit: 'cover' | 'contain'
  format: 'webp' | 'avif' | 'jpeg' | 'png'
  height: number | undefined
  width: number | undefined
}

export interface PreviewService {
  metadata: (ctx: MeasureContext, workspace: WorkspaceUuid, name: string) => Promise<PreviewMetadata>
  thumbnail: (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    name: string,
    params: ThumbnailParams
  ) => Promise<PreviewFile>
}

export type PreviewConfig = Pick<Config, 'MaxBlobSize' | 'Video' | 'LibreOfficeTimeout' | 'PdfTimeout'>

export function createPreviewService (
  storage: StorageAdapter,
  cache: Cache,
  tempDir: TemporaryDir,
  config: PreviewConfig,
  concurrency: number = 10
): PreviewService {
  const imageProvider = new ImageProvider(storage, tempDir)
  const providers: PreviewProvider[] = [
    imageProvider,
    new DocProvider(storage, tempDir, config.LibreOfficeTimeout, config.PdfTimeout),
    new PdfProvider(storage, tempDir, config.PdfTimeout),
    new VideoProvider(storage, tempDir, config.Video.timeout),
    new OctetStreamProvider(storage, tempDir),
    new FallbackProvider(imageProvider)
  ]
  return new PreviewServiceImpl(
    storage,
    cache,
    tempDir,
    providers,
    config.MaxBlobSize,
    config.Video.concurrency,
    concurrency
  )
}

class PreviewServiceImpl implements PreviewService {
  private readonly limiter: RateLimiter
  private readonly videoLimiter: RateLimiter
  private readonly single: SingleFlight<PreviewFile>
  private readonly singleImage: SingleFlight<PreviewFile>
  private readonly singleMetadata: SingleFlight<PreviewMetadata>
  private readonly refused: LRUCache<string, Error>
  private readonly metadataCache: LRUCache<string, PreviewMetadata>

  constructor (
    private readonly storage: StorageAdapter,
    private readonly cache: Cache,
    private readonly tempDir: TemporaryDir,
    private readonly providers: PreviewProvider[],
    private readonly maxBlobSize: number,
    videoConcurrency: number,
    concurrency: number = 10
  ) {
    this.single = new SingleFlight<PreviewFile>()
    this.singleImage = new SingleFlight<PreviewFile>()
    this.singleMetadata = new SingleFlight<PreviewMetadata>()
    this.limiter = new RateLimiter(concurrency)
    this.videoLimiter = new RateLimiter(videoConcurrency)
    this.refused = new LRUCache({ max: REFUSAL_MAX, ttl: REFUSAL_TTL })
    this.metadataCache = new LRUCache({ max: METADATA_MAX, ttl: METADATA_TTL })
  }

  @withContext('metadata')
  async metadata (ctx: MeasureContext, workspace: WorkspaceUuid, name: string): Promise<PreviewMetadata> {
    const stat = await this.statBlob(ctx, workspace, name)
    const provider = this.findProvider(ctx, stat.contentType)
    const blobKey = this.blobKey(workspace, name, stat.etag)

    const known = this.metadataCache.get(blobKey)
    if (known !== undefined) {
      return known
    }

    return await this.singleMetadata.execute(`metadata/${blobKey}`, async () => {
      const metadata = await ctx.with(
        'metadata',
        { contentType: stat.contentType },
        (ctx) => this.limited(ctx, provider, blobKey, () => provider.metadata(ctx, workspace, name, stat.contentType)),
        { workspace }
      )
      this.metadataCache.set(blobKey, metadata)
      return metadata
    })
  }

  async thumbnail (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    name: string,
    params: ThumbnailParams
  ): Promise<PreviewFile> {
    const imageKey = this.imageKey(workspace, name)
    const thumbKey = this.thumbnailKey(workspace, name, params)

    return await this.single.execute(thumbKey, () => {
      return withCache(ctx, this.cache, thumbKey, async () => {
        const stat = await this.statBlob(ctx, workspace, name)
        const provider = this.findProvider(ctx, stat.contentType)
        const blobKey = this.blobKey(workspace, name, stat.etag)

        // other sizes of this blob wait for this frame instead of reading the blob again
        const image = await this.singleImage.execute(imageKey, () => {
          return withCache(ctx, this.cache, imageKey, () => {
            return ctx.with(
              'thumbnail',
              { contentType: stat.contentType },
              (ctx) =>
                this.limited(ctx, provider, blobKey, () => provider.image(ctx, workspace, name, stat.contentType)),
              { workspace }
            )
          })
        })

        const thumbPath = this.tempDir.tmpFile()
        const { contentType } = await ctx.with('transformImage', { format: params.format }, () =>
          transformImage(image.filePath, thumbPath, params)
        )

        return {
          filePath: thumbPath,
          mimeType: contentType
        }
      })
    })
  }

  @withContext('stat-blob')
  async statBlob (ctx: MeasureContext, workspace: WorkspaceUuid, name: string): Promise<Blob> {
    const wsId = { uuid: workspace } as any

    const stat = await this.storage.stat(ctx, wsId, name)
    if (stat !== undefined) {
      // providers copy the blob to the temp dir, so refuse before any of them starts
      if (stat.size > this.maxBlobSize) {
        throw new BadRequestError('Blob is too large for preview')
      }
      return stat
    }

    throw new NotFoundError()
  }

  findProvider (ctx: MeasureContext, contentType: string): PreviewProvider {
    const provider = this.providers.find((it) => it.supports(contentType))
    if (provider != null) {
      return provider
    }

    throw new BadRequestError(`Unsupported content type: ${contentType}`)
  }

  // A refused blob is turned away before any queue. A video waits for its own slot before it
  // takes a shared one, so waiting videos leave the shared slots to other previews.
  private async limited<T>(
    ctx: MeasureContext,
    provider: PreviewProvider,
    blobKey: string,
    op: () => Promise<T>
  ): Promise<T> {
    const refusal = this.refused.get(blobKey)
    if (refusal !== undefined) {
      throw refusal
    }

    try {
      if (provider instanceof VideoProvider) {
        return await this.videoLimiter.exec(() => this.limiter.exec(op))
      }
      return await this.limiter.exec(op)
    } catch (err: unknown) {
      if (err instanceof ToolError) {
        // the one log of this failure: errorHandler skips a ToolError, and a refusal repeats it
        ctx.warn('preview tool failed', { blobKey, error: err.message })
        this.refused.set(blobKey, err, { ttl: err.retryAfter ?? REFUSAL_TTL })
      }
      throw err
    }
  }

  // the etag changes when the blob is overwritten under the same name, and then what was
  // learned about the old content no longer holds
  private blobKey (workspaceId: string, name: string, etag: string): string {
    return `${workspaceId}/${name}/${etag}`
  }

  private imageKey (workspaceId: string, name: string): string {
    return `image/${workspaceId}/${name}`
  }

  private thumbnailKey (workspaceId: string, name: string, params: ThumbnailParams): string {
    return `thumbnail/${workspaceId}/${name}-${params.width}-${params.height}-${params.format}`
  }
}
