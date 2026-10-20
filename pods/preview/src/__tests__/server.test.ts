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

import { Analytics } from '@hcengineering/analytics'
import { MeasureMetricsContext } from '@hcengineering/core'
import { buildStorageFromConfig } from '@hcengineering/server-storage'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'
import { get as httpGet, type Server } from 'http'
import { type AddressInfo } from 'net'
import { Readable } from 'stream'

import { createServer } from '../server'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))
jest.mock('@hcengineering/server-storage', () => ({
  storageConfigFromEnv: jest.fn(() => ({})),
  buildStorageFromConfig: jest.fn()
}))
// the frame is a stub file here, what sharp does with it is not under test
jest.mock('../utils/sharp', () => ({
  transformImage: jest.fn(async (_src: string, dst: string) => {
    jest.requireActual('fs').writeFileSync(dst, 'thumbnail')
    return { contentType: 'image/png', size: 9 }
  })
}))

const spawnMock = spawn as unknown as jest.Mock

const WS = '85da8aa0-7334-41bc-b69f-5f05ce88483c'

const config = {
  Port: 0,
  Secret: 'secret',
  ServiceID: 'preview',
  Cache: { enabled: false, cachePath: undefined, cacheSize: undefined, gcInterval: undefined },
  MaxBlobSize: 1024 * 1024,
  Video: { concurrency: 2, timeout: 60 * 1000 },
  LibreOfficeTimeout: 120 * 1000,
  PdfTimeout: 60 * 1000
}

// http.get sends the path as it is: fetch would resolve "." and ".." before the request
async function request (server: Server, path: string): Promise<{ status: number, body: string }> {
  const { port } = server.address() as AddressInfo
  return await new Promise((resolve, reject) => {
    httpGet({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body })
      })
    }).on('error', reject)
  })
}

describe('preview routes', () => {
  const ctx = new MeasureMetricsContext('server-test', {})
  const stat = jest.fn()
  const get = jest.fn()
  let server: Server
  let close: () => void

  beforeEach(async () => {
    stat.mockImplementation(async () => ({ contentType: 'application/octet-stream', size: 4, etag: 'etag' }))
    get.mockImplementation(async () => Readable.from([Buffer.from('blob')]))
    ;(buildStorageFromConfig as jest.Mock).mockReturnValue({ stat, get })

    const created = await createServer(ctx, config)
    close = created.close
    server = created.app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    close()
    stat.mockReset()
    get.mockReset()
  })

  // the storage client puts the workspace into the url as it is, and fetch drops "./" from it
  it.each([
    ['./ in front of the workspace', `.%2F${WS}`],
    ['././ in front of the workspace', `.%2F.%2F${WS}`],
    ['../ in front of the workspace', `..%2F${WS}`],
    ['a slash after the workspace', `${WS}%2F.`],
    ['a name instead of a uuid', 'workspace'],
    ['an upper case uuid', WS.toUpperCase()]
  ])('refuses %s', async (_what, workspace) => {
    const metadata = await request(server, `/metadata/${workspace}/blob`)
    const image = await request(server, `/image/width=64/${workspace}/blob`)

    expect(metadata.status).toBe(400)
    expect(image.status).toBe(400)
    expect(stat).not.toHaveBeenCalled()
  })

  // encodeURIComponent leaves "." and ".." alone, and the storage client turns them into the
  // workspace listing or its parent
  it.each([['.'], ['..'], ['%2e'], ['%2E%2E'], ['.%2e']])('refuses the blob name %s', async (name) => {
    const metadata = await request(server, `/metadata/${WS}/${name}`)
    const image = await request(server, `/image/width=64/${WS}/${name}`)

    expect(metadata.status).toBe(400)
    expect(image.status).toBe(400)
    expect(stat).not.toHaveBeenCalled()
  })

  it('serves a metadata request for a workspace uuid and a blob name', async () => {
    const response = await request(server, `/metadata/${WS}/e0b1c9f2-blob_master.m3u8`)

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({})
    expect(stat).toHaveBeenCalledWith(expect.anything(), { uuid: WS }, 'e0b1c9f2-blob_master.m3u8')
  })

  it('serves an image request for a workspace uuid and a blob name', async () => {
    stat.mockImplementation(async () => ({ contentType: 'image/png', size: 4, etag: 'etag' }))

    const response = await request(server, `/image/width=64/${WS}/blob`)

    expect(response.status).toBe(200)
    expect(response.body).toBe('thumbnail')
    expect(stat).toHaveBeenCalledWith(expect.anything(), { uuid: WS }, 'blob')
  })

  it('keeps a name with a percent escape that is not a dot', async () => {
    const response = await request(server, `/metadata/${WS}/%252e`)

    expect(response.status).toBe(200)
    expect(stat).toHaveBeenCalledWith(expect.anything(), { uuid: WS }, '%2e')
  })

  describe('a blob that ffmpeg fails on', () => {
    beforeEach(() => {
      stat.mockImplementation(async () => ({ contentType: 'video/mp4', size: 4, etag: 'etag' }))
      spawnMock.mockImplementation(() => {
        const proc = new EventEmitter() as any
        proc.stderr = new EventEmitter()
        proc.kill = jest.fn()
        setImmediate(() => proc.emit('close', 183, null))
        return proc
      })
    })

    afterEach(() => {
      spawnMock.mockReset()
      jest.restoreAllMocks()
    })

    it('does not reach Analytics, however often it is asked for', async () => {
      const handleError = jest.spyOn(Analytics, 'handleError').mockImplementation(() => undefined)

      for (let i = 0; i < 3; i++) {
        const response = await request(server, `/metadata/${WS}/bad`)
        expect(response.status).toBe(500)
      }

      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(handleError).not.toHaveBeenCalled()
    })
  })
})
