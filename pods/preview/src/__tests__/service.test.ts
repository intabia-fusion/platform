//
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

import { type Blob, MeasureMetricsContext, type WorkspaceUuid } from '@hcengineering/core'
import { type StorageAdapter } from '@hcengineering/server-core'
import { readdirSync } from 'fs'
import { type Readable } from 'stream'

import { BadRequestError } from '../error'
import { createPreviewService, type ThumbnailParams } from '../service'
import { TemporaryDir } from '../tempdir'
import { noCache, settle } from './helpers'

const WS = 'ws-1' as WorkspaceUuid
const LIMIT = 1024
const CONFIG = {
  MaxBlobSize: LIMIT,
  Video: { concurrency: 2, timeout: 60 * 1000 },
  LibreOfficeTimeout: 120 * 1000,
  PdfTimeout: 60 * 1000
}
const PARAMS: ThumbnailParams = { fit: 'cover', format: 'png', width: 64, height: 64 }

const ctx = new MeasureMetricsContext('service-test', {})
const cache = noCache(ctx)

function storageOf (contentType: string, size: number, get: jest.Mock = jest.fn()): StorageAdapter {
  const stat = { contentType, size } as unknown as Blob
  return { stat: jest.fn(async () => stat), get } as unknown as StorageAdapter
}

describe('PreviewService', () => {
  let tempDir: TemporaryDir

  beforeEach(() => {
    tempDir = new TemporaryDir(ctx, 'preview-test-')
  })

  afterEach(async () => {
    await tempDir.close()
  })

  it.each([
    'video/mp4',
    'image/png',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/octet-stream',
    'font/woff2'
  ])('refuses a %s blob over the size limit without copying it', async (contentType) => {
    const get = jest.fn()
    const service = createPreviewService(storageOf(contentType, LIMIT + 1, get), cache, tempDir, CONFIG)

    await expect(service.metadata(ctx, WS, 'big')).rejects.toBeInstanceOf(BadRequestError)
    await expect(service.thumbnail(ctx, WS, 'big', PARAMS)).rejects.toBeInstanceOf(BadRequestError)

    expect(get).not.toHaveBeenCalled()
    expect(readdirSync(tempDir.path)).toEqual([])
  })

  it('accepts a blob exactly at the size limit', async () => {
    const service = createPreviewService(storageOf('application/octet-stream', LIMIT), cache, tempDir, CONFIG)

    await expect(service.metadata(ctx, WS, 'edge')).resolves.toEqual({})
  })

  it('runs metadata through the same limiter as thumbnails', async () => {
    const fail: Array<(err: Error) => void> = []
    const get = jest.fn(
      async () =>
        await new Promise<Readable>((_resolve, reject) => {
          fail.push(reject)
        })
    )
    const service = createPreviewService(storageOf('image/png', 10, get), cache, tempDir, CONFIG, 1)

    const first = service.metadata(ctx, WS, 'a')
    const second = service.metadata(ctx, WS, 'b')
    await settle()
    // the only slot is taken, the second blob is not read yet
    expect(get).toHaveBeenCalledTimes(1)

    fail[0](new Error('read failed'))
    await expect(first).rejects.toThrow('read failed')
    await settle()
    expect(get).toHaveBeenCalledTimes(2)

    fail[1](new Error('read failed'))
    await expect(second).rejects.toThrow('read failed')
  })
})
