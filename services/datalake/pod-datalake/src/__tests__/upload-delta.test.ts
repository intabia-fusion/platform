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
import { type WorkspaceUuid } from '@hcengineering/core'

import { handleUploadFormData } from '../handlers/blob'
import { handleS3CreateBlob } from '../handlers/s3'

const WS = 'aaaaaaaa-0000-0000-0000-000000000001' as WorkspaceUuid
const ctx: any = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), with: jest.fn() }

function makeLimits (exhausted = false): any {
  return {
    isExhausted: jest.fn(() => exhausted),
    sendStorageDelta: jest.fn()
  }
}

function makeRes (): any {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() }
}

/**
 * The stream service uploads every HLS artifact with a service token. These uploads occupy the same
 * storage as a user's own file, so they must report the same billing delta - skipping them used to
 * leave the workspace usage stale until the hourly absolute recompute caught up.
 */
describe('storage delta on upload', () => {
  describe('form-data', () => {
    function makeReq (service?: string): any {
      return {
        params: { workspace: WS },
        headers: {},
        token: service !== undefined ? { extra: { service } } : {},
        files: {
          file: {
            name: 'blob_000_480p.ts',
            size: 2048,
            mimetype: 'video/mp2t',
            data: Buffer.from('segment')
          }
        }
      }
    }

    const datalake: any = { put: jest.fn(async () => ({ etag: 'etag-1' })) }
    const tempDir: any = { rm: jest.fn() }

    it('reports the delta for a service upload', async () => {
      const limits = makeLimits()
      await handleUploadFormData(ctx, makeReq('stream'), makeRes(), datalake, tempDir, limits)
      expect(limits.sendStorageDelta).toHaveBeenCalledWith(ctx, WS, 2048, expect.any(String))
    })

    it('reports the delta for a user upload', async () => {
      const limits = makeLimits()
      await handleUploadFormData(ctx, makeReq(), makeRes(), datalake, tempDir, limits)
      expect(limits.sendStorageDelta).toHaveBeenCalledWith(ctx, WS, 2048, expect.any(String))
    })

    it('still lets a service upload through an exhausted workspace', async () => {
      const limits = makeLimits(true)
      const res = makeRes()
      await handleUploadFormData(ctx, makeReq('stream'), res, datalake, tempDir, limits)
      // Transcoding of an already-accepted file must not be blocked by the disk limit.
      expect(res.status).not.toHaveBeenCalledWith(413)
      expect(limits.sendStorageDelta).toHaveBeenCalled()
    })

    it('blocks a user upload into an exhausted workspace', async () => {
      const limits = makeLimits(true)
      const res = makeRes()
      await handleUploadFormData(ctx, makeReq(), res, datalake, tempDir, limits)
      expect(res.status).toHaveBeenCalledWith(413)
      expect(limits.sendStorageDelta).not.toHaveBeenCalled()
    })
  })

  describe('s3 create', () => {
    function makeReq (service?: string): any {
      return {
        params: { workspace: WS, name: 'blob_master.m3u8' },
        body: { filename: 'blob_master.m3u8' },
        token: service !== undefined ? { extra: { service } } : {}
      }
    }

    const datalake: any = { create: jest.fn(async () => ({ size: 512, etag: 'etag-2' })) }

    it('reports the delta for a service upload', async () => {
      const limits = makeLimits()
      await handleS3CreateBlob(ctx, makeReq('stream'), makeRes(), datalake, undefined, limits)
      expect(limits.sendStorageDelta).toHaveBeenCalledWith(ctx, WS, 512, 'etag-2')
    })
  })
})
