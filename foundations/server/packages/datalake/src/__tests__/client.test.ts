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

import { MeasureMetricsContext, type WorkspaceUuid } from '@hcengineering/core'
import { Readable } from 'stream'
import { DatalakeClient, directUploadLimit } from '../client'
import { InvalidNameError } from '../error'

describe('DatalakeClient.getPartialObject', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const workspace = 'ws' as WorkspaceUuid

  afterEach(() => {
    jest.restoreAllMocks()
  })

  async function rangeOf (offset: number, length?: number): Promise<string> {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('data'))
    await new DatalakeClient('http://datalake', 'token').getPartialObject(ctx, workspace, 'blob', offset, length)
    return (fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Range
  }

  it('requests an open-ended range without a length', async () => {
    expect(await rangeOf(5)).toBe('bytes=5-')
  })

  it('requests an inclusive range with a length', async () => {
    expect(await rangeOf(5, 10)).toBe('bytes=5-14')
  })
})

// fetch resolves "." and ".." in a url path, and encodeURIComponent leaves them alone
describe('DatalakeClient urls', () => {
  const ctx = new MeasureMetricsContext('test', {})
  const client = new DatalakeClient('http://datalake', 'token')
  const workspace = '85da8aa0-7334-41bc-b69f-5f05ce88483c' as WorkspaceUuid
  // what express hands over for ".%2F<uuid>"
  const sneaky = `./${workspace}` as WorkspaceUuid
  const params = { type: 'text/plain', lastModified: 0 }
  // express turns ?file[]=. into ['.'], and encodeURIComponent makes "." of it
  const refused = ['', '.', '..', ['.'] as unknown as string]

  let fetchMock: jest.SpyInstance<Promise<Response>>

  // enough of an answer for every call below to finish
  function answer (url: string): Response {
    const path = new URL(url).pathname
    const parts = path.split('/').filter((it) => it !== '')
    if (path.endsWith('/part')) return Response.json({ partNumber: 1, etag: 'etag' })
    if (path.startsWith('/upload/multipart/')) return Response.json({ uploadId: 'upload', etag: 'etag' })
    if (path.startsWith('/upload/form-data/')) return Response.json([{ key: 'blob', metadata: { etag: 'etag' } }])
    if (path.endsWith('/by-type')) return Response.json([])
    if (parts[0] === 'stats' || parts[0] === 'upload' || (parts[0] === 'blob' && parts.length === 2)) {
      return Response.json({ blobs: [], location: 'location', bucket: 'bucket' })
    }
    return new Response('data')
  }

  function urlOf (input: Parameters<typeof fetch>[0]): string {
    return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  }

  function requested (): string[] {
    return fetchMock.mock.calls.map(([input]) => urlOf(input))
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => answer(urlOf(input)))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  type Call = (ws: WorkspaceUuid, name: string) => Promise<unknown>

  const s3 = { url: 'url', accessKeyId: 'key', secretAccessKey: 'secret' }
  const large = { ...params, size: directUploadLimit }

  // [method, call, the start of every url the call asks for]
  const byName: Array<[string, Call, string]> = [
    ['getObject', async (ws, name) => await client.getObject(ctx, ws, name), '/blob/'],
    ['getPartialObject', async (ws, name) => await client.getPartialObject(ctx, ws, name, 0), '/blob/'],
    ['statObject', async (ws, name) => await client.statObject(ctx, ws, name), '/blob/'],
    [
      'deleteObject',
      async (ws, name) => {
        await client.deleteObject(ctx, ws, name)
      },
      '/blob/'
    ],
    [
      'putObject',
      async (ws, name) => await client.putObject(ctx, ws, name, Buffer.from('data'), params),
      '/upload/form-data/'
    ],
    [
      'putObject of a large stream',
      async (ws, name) => await client.putObject(ctx, ws, name, Readable.from([Buffer.from('data')]), large),
      '/upload/multipart/'
    ],
    [
      'uploadFromS3',
      async (ws, name) => {
        await client.uploadFromS3(ctx, ws, name, s3)
      },
      '/upload/s3/'
    ],
    [
      'createFromS3',
      async (ws, name) => {
        await client.createFromS3(ctx, ws, name, { filename: 'name' })
      },
      '/upload/s3/'
    ]
  ]

  const byWorkspace: Array<[string, Call, string]> = [
    ['getWorkspaceStats', async (ws) => await client.getWorkspaceStats(ctx, ws), '/stats/'],
    ['getWorkspaceStatsByType', async (ws) => await client.getWorkspaceStatsByType(ctx, ws), '/stats/'],
    ['listObjects', async (ws) => await client.listObjects(ctx, ws, undefined), '/blob/'],
    ['getS3UploadParams', async (ws) => await client.getS3UploadParams(ctx, ws), '/upload/s3/']
  ]

  describe('getObjectUrl', () => {
    it('puts the workspace and the encoded name into the url', () => {
      expect(client.getObjectUrl(ctx, workspace, 'blob')).toBe(`http://datalake/blob/${workspace}/blob`)
      expect(client.getObjectUrl(ctx, workspace, 'a/b c')).toBe(`http://datalake/blob/${workspace}/a%2Fb%20c`)
    })

    it('keeps "./" inside the workspace segment', () => {
      const url = client.getObjectUrl(ctx, sneaky, 'blob')

      expect(url).toBe(`http://datalake/blob/.%2F${workspace}/blob`)
      expect(new URL(url).pathname).toBe(`/blob/.%2F${workspace}/blob`)
    })

    it.each(refused)('refuses the name %j, which fetch resolves to the listing or its parent', (name) => {
      expect(() => client.getObjectUrl(ctx, workspace, name)).toThrow(InvalidNameError)
    })

    it.each(refused)('refuses the workspace %j', (ws) => {
      expect(() => client.getObjectUrl(ctx, ws as WorkspaceUuid, 'blob')).toThrow(InvalidNameError)
    })

    it('keeps a name that only contains dots', () => {
      expect(client.getObjectUrl(ctx, workspace, '...')).toBe(`http://datalake/blob/${workspace}/...`)
      expect(client.getObjectUrl(ctx, workspace, '.hidden')).toBe(`http://datalake/blob/${workspace}/.hidden`)
    })
  })

  describe.each([...byName, ...byWorkspace])('%s', (_name, call, prefix) => {
    it('keeps "./" inside the workspace segment', async () => {
      await call(sneaky, 'blob')

      expect(requested().length).toBeGreaterThan(0)
      for (const url of requested()) {
        expect(new URL(url).pathname.startsWith(`${prefix}.%2F${workspace}`)).toBe(true)
      }
    })

    it.each(refused)('refuses the workspace %j without a request', async (ws) => {
      await expect(call(ws as WorkspaceUuid, 'blob')).rejects.toBeInstanceOf(InvalidNameError)

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe.each(byName)('%s', (_name, call, prefix) => {
    it('sends a normal name as it is', async () => {
      await call(workspace, 'blob')

      expect(requested().length).toBeGreaterThan(0)
      expect(new URL(requested()[0]).pathname.startsWith(`${prefix}${workspace}`)).toBe(true)
    })

    it.each(refused)('refuses the name %j without a request', async (name) => {
      await expect(call(workspace, name)).rejects.toBeInstanceOf(InvalidNameError)

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
