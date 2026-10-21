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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { StorageAdapter } from '@hcengineering/server-core'

import { rm } from 'fs/promises'

import { getImageMetadata } from '../metadata'
import { TemporaryDir } from '../tempdir'
import { type PreviewFile, type PreviewMetadata, type PreviewProvider } from '../types'
import { copyBlob } from '../utils/blob'
import { extractThumbnail } from '../utils/ffmpeg'

export class VideoProvider implements PreviewProvider {
  constructor (
    private readonly storage: StorageAdapter,
    private readonly tempDir: TemporaryDir,
    private readonly timeout: number
  ) {}

  supports (mimeType: string): boolean {
    return mimeType.startsWith('video/')
  }

  async image (ctx: MeasureContext, workspace: WorkspaceUuid, name: string, contentType: string): Promise<PreviewFile> {
    const videoFile = this.tempDir.tmpFile()
    const pngFile = this.tempDir.tmpFile() + '.png'

    try {
      await ctx.with('blob-read', {}, (ctx) => {
        return copyBlob(ctx, this.storage, workspace, name, videoFile, this.timeout)
      })

      await extractThumbnail(videoFile, pngFile, this.timeout)
    } catch (err: any) {
      // remove temporary png file in case of error
      this.tempDir.rm(pngFile)
      throw err
    } finally {
      // remove now instead of waiting for the tempDir cleanup: a video can be large
      await rm(videoFile, { force: true }).catch(() => {
        this.tempDir.rm(videoFile)
      })
    }

    return { mimeType: 'image/png', filePath: pngFile }
  }

  async metadata (
    ctx: MeasureContext,
    workspace: WorkspaceUuid,
    name: string,
    contentType: string
  ): Promise<PreviewMetadata> {
    const { filePath: path } = await ctx.with('thumbnail', {}, (ctx) => {
      return this.image(ctx, workspace, name, contentType)
    })

    try {
      const thumbnail = await getImageMetadata(ctx, path)
      return { thumbnail }
    } catch (err: any) {
      throw new Error(`Failed to get metadata: ${err.message}`)
    } finally {
      this.tempDir.rm(path)
    }
  }
}
