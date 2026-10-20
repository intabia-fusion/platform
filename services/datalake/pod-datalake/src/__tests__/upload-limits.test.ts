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
import { readOnlyGuestAccountUuid, systemAccountUuid, type WorkspaceUuid } from '@hcengineering/core'

import { handleUploadFormData } from '../handlers/blob'
import { handleMultipartUploadComplete, handleMultipartUploadStart } from '../handlers/multipart'
import { handleS3CreateBlob } from '../handlers/s3'

const WS = 'aaaaaaaa-0000-0000-0000-000000000001' as WorkspaceUuid
const ctx: any = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), with: jest.fn() }

// Love guest links issued before the guest flag: a service name on the read-only guest
// account, no `guest`, no `exp`
const legacyLoveLink = {
  account: readOnlyGuestAccountUuid,
  workspace: WS,
  extra: { service: 'love', meetingId: 'meeting', workspaceUrl: 'ws' }
}
const guestWithServiceName = {
  account: readOnlyGuestAccountUuid,
  workspace: WS,
  extra: { service: 'love', guest: 'true' }
}
const guestFlagOnly = { account: systemAccountUuid, workspace: WS, extra: { service: 'love', guest: 'true' } }
const serviceToken = { account: systemAccountUuid, workspace: WS, extra: { service: 'stream' } }
const userToken = { account: '85da8aa0-7334-41bc-b69f-5f05ce88483c', workspace: WS, extra: {} }

function makeLimits (exhausted: boolean): any {
  return { isExhausted: jest.fn(() => exhausted), sendStorageDelta: jest.fn() }
}

function makeRes (): any {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() }
}

function makeDatalake (): any {
  const bucket = {
    createMultipartUpload: jest.fn(async () => ({ uploadId: 'upload' })),
    completeMultipartUpload: jest.fn(async () => undefined)
  }
  return {
    selectStorage: jest.fn(async () => ({ bucket })),
    create: jest.fn(async () => ({ size: 1, etag: 'etag' })),
    put: jest.fn(async () => ({ etag: 'etag' }))
  }
}

const uploadId = Buffer.from('00000000-0000-0000-0000-000000000000:upload').toString('base64')

interface UploadCase {
  name: string
  call: (token: any, limits: any, datalake: any, res: any) => Promise<void>
}

const uploads: UploadCase[] = [
  {
    name: 'form-data upload',
    call: async (token, limits, datalake, res) => {
      const file = { name: 'file', size: 4, mimetype: 'text/plain', data: Buffer.from('data') }
      const req: any = { params: { workspace: WS }, headers: {}, token, files: { file } }
      await handleUploadFormData(ctx, req, res, datalake, { rm: jest.fn() } as any, limits)
    }
  },
  {
    name: 's3 create',
    call: async (token, limits, datalake, res) => {
      const req: any = { params: { workspace: WS, name: 'blob' }, headers: {}, body: { filename: 'blob' }, token }
      await handleS3CreateBlob(ctx, req, res, datalake, undefined, limits)
    }
  },
  {
    name: 'multipart start',
    call: async (token, limits, datalake, res) => {
      const req: any = { params: { workspace: WS, name: 'blob' }, headers: {}, token }
      await handleMultipartUploadStart(ctx, req, res, datalake, undefined, limits)
    }
  },
  {
    name: 'multipart complete',
    call: async (token, limits, datalake, res) => {
      const req: any = {
        params: { workspace: WS, name: 'blob' },
        headers: {},
        query: { uploadId },
        body: { parts: [] },
        token
      }
      await handleMultipartUploadComplete(ctx, req, res, datalake, undefined, limits)
    }
  }
]

describe.each(uploads)('storage limit on $name', ({ call }) => {
  it.each([
    ['an old love guest link', legacyLoveLink],
    ['a guest token that carries a service name', guestWithServiceName],
    ['a token with the guest flag', guestFlagOnly],
    ['a user token', userToken]
  ])('blocks %s in an exhausted workspace', async (_name, token) => {
    const datalake = makeDatalake()
    const res = makeRes()

    await call(token, makeLimits(true), datalake, res)

    expect(res.status).toHaveBeenCalledWith(413)
    expect(datalake.put).not.toHaveBeenCalled()
    expect(datalake.create).not.toHaveBeenCalled()
    expect(datalake.selectStorage).not.toHaveBeenCalled()
  })

  it('lets a service token through an exhausted workspace', async () => {
    const res = makeRes()

    await call(serviceToken, makeLimits(true), makeDatalake(), res)

    expect(res.status).not.toHaveBeenCalledWith(413)
  })

  it('does not block anyone while the workspace has room', async () => {
    const res = makeRes()

    await call(legacyLoveLink, makeLimits(false), makeDatalake(), res)

    expect(res.status).not.toHaveBeenCalledWith(413)
  })
})
