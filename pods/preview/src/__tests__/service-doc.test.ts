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
import { spawn } from 'child_process'
import { writeFileSync } from 'fs'
import { Readable } from 'stream'

import { createPreviewService, type PreviewService, type ThumbnailParams } from '../service'
import { TemporaryDir } from '../tempdir'
import { LibreOfficeError } from '../utils/libreoffice'
import { hangingStream, noCache, type Run, settle, startRun, until } from './helpers'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))
// the page image comes from poppler, which is not under test
jest.mock('../utils/pdf', () => ({
  pdfToImage: jest.fn(async (_ctx: unknown, pdfFile: string) => {
    jest.requireActual('fs').writeFileSync(pdfFile + '.png', 'png')
    return pdfFile + '.png'
  })
}))
jest.mock('../metadata', () => ({ getImageMetadata: jest.fn(async () => ({ width: 1, height: 1, blurhash: 'h' })) }))

const spawnMock = spawn as unknown as jest.Mock

const WS = 'ws-1' as WorkspaceUuid
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PARAMS: ThumbnailParams = { fit: 'cover', format: 'png', width: 64, height: 64 }
// how long a document that LibreOffice failed on is remembered
const REFUSAL_TTL = 10 * 60 * 1000

const ctx = new MeasureMetricsContext('service-doc-test', {})

let runs: Run[]
// every started LibreOffice ends by itself with this code; undefined leaves it to the test
let autoCode: number | undefined

function makeStorage (
  get: jest.Mock = jest.fn(async () => Readable.from([Buffer.from('document')])),
  contentType = DOCX
): { storage: StorageAdapter, get: jest.Mock } {
  const stat = jest.fn(async () => ({ contentType, size: 8, etag: 'etag-1' }) as unknown as Blob)
  return { storage: { stat, get } as unknown as StorageAdapter, get }
}

describe('PreviewService with a document', () => {
  let tempDir: TemporaryDir

  function makeService (
    storage: StorageAdapter,
    options: { shared?: number, timeout?: number, pdfTimeout?: number } = {}
  ): PreviewService {
    const config = {
      MaxBlobSize: 1024 * 1024,
      Video: { concurrency: 2, timeout: 60 * 1000 },
      LibreOfficeTimeout: options.timeout ?? 120 * 1000,
      PdfTimeout: options.pdfTimeout ?? 60 * 1000
    }
    return createPreviewService(storage, noCache(ctx), tempDir, config, options.shared ?? 10)
  }

  beforeEach(() => {
    tempDir = new TemporaryDir(ctx, 'preview-test-')
    runs = []
    autoCode = 0
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      startRun(
        runs,
        args,
        // the pdf lands next to the document
        (a) => {
          writeFileSync(a[a.length - 1].replace(/\.[^./]+$/, '') + '.pdf', 'pdf')
        },
        () => (autoCode === undefined ? undefined : { code: autoCode, stderr: '' })
      )
    )
  })

  afterEach(async () => {
    spawnMock.mockReset()
    await tempDir.close()
  })

  it('converts a document that LibreOffice can read', async () => {
    const { storage, get } = makeStorage()
    const service = makeService(storage)

    await expect(service.metadata(ctx, WS, 'document')).resolves.toBeDefined()

    expect(get).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  describe('a blob that the storage does not deliver in time', () => {
    const late = (body: Readable): jest.Mock =>
      jest.fn(
        async () =>
          await new Promise<Readable>((resolve) => {
            setTimeout(() => {
              resolve(body)
            }, 300)
          })
      )

    it.each([
      ['a body that never ends', (body: Readable) => jest.fn(async () => body), DOCX, true],
      ['no answer at all', () => jest.fn(async () => await new Promise<Readable>(() => {})), DOCX, false],
      ['a body that arrives after the deadline', late, DOCX, true],
      ['a body of a pdf that never ends', (body: Readable) => jest.fn(async () => body), 'application/pdf', true]
    ])('is given up on with %s, the body closed and LibreOffice never started', async (_what, makeGet, type, opens) => {
      const body = hangingStream('doc')
      const { storage } = makeStorage(makeGet(body), type)
      const service = makeService(storage, { timeout: 200, pdfTimeout: 200 })

      await expect(service.metadata(ctx, WS, 'document')).rejects.toThrow('timed out')

      if (opens) await until(() => body.destroyed)
      expect(spawnMock).not.toHaveBeenCalled()
    })
  })

  // the document is to blame, however short the timeout is
  it('keeps the refusal of a failed document for ten minutes, for thumbnails too', async () => {
    autoCode = 81
    const { storage, get } = makeStorage()
    const service = makeService(storage, { timeout: 200 })
    const clock = jest.spyOn(performance, 'now')

    try {
      await expect(service.metadata(ctx, WS, 'document')).rejects.toBeInstanceOf(LibreOfficeError)
      const failedAt = performance.now()

      clock.mockReturnValue(failedAt + 5000)
      await settle()
      await expect(service.metadata(ctx, WS, 'document')).rejects.toBeInstanceOf(LibreOfficeError)
      await expect(service.thumbnail(ctx, WS, 'document', PARAMS)).rejects.toBeInstanceOf(LibreOfficeError)
      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(1)

      clock.mockReturnValue(failedAt + REFUSAL_TTL + 1000)
      await settle()
      await expect(service.metadata(ctx, WS, 'document')).rejects.toBeInstanceOf(LibreOfficeError)
      expect(get).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
  })

  describe('a refusal that the load may explain', () => {
    beforeEach(() => {
      autoCode = undefined
    })

    it.each([
      ['LibreOffice ran out of time', 200, 'timed out', false],
      ['a signal killed LibreOffice', 1000, 'killed by SIGKILL', true]
    ])('lasts one timeout when %s', async (_what, timeout, message, bySignal) => {
      const { storage, get } = makeStorage()
      const service = makeService(storage, { timeout })
      const clock = jest.spyOn(performance, 'now')

      try {
        const first = service.metadata(ctx, WS, 'document')
        if (bySignal) {
          await until(() => runs.length === 1)
          runs[0].finish(null, '', 'SIGKILL')
        }
        await expect(first).rejects.toThrow(message)
        const failedAt = performance.now()

        clock.mockReturnValue(failedAt + timeout / 2)
        await settle()
        await expect(service.metadata(ctx, WS, 'document')).rejects.toThrow(message)
        expect(get).toHaveBeenCalledTimes(1)

        clock.mockReturnValue(failedAt + timeout * 1.5)
        await settle()
        const again = service.metadata(ctx, WS, 'document')
        await until(() => runs.length === 2)
        runs[1].finish(0)
        await expect(again).resolves.toBeDefined()
        expect(get).toHaveBeenCalledTimes(2)
      } finally {
        clock.mockRestore()
      }
    })
  })

  describe('a hung LibreOffice', () => {
    beforeEach(() => {
      autoCode = undefined
    })

    it('is killed and frees its slot for the next preview', async () => {
      const { storage, get } = makeStorage()
      // one shared slot: the second document waits for the first one
      const service = makeService(storage, { shared: 1, timeout: 50 })

      const hung = service.metadata(ctx, WS, 'hung')
      const next = service.metadata(ctx, WS, 'next')
      await until(() => runs.length === 1)

      await expect(hung).rejects.toBeInstanceOf(LibreOfficeError)
      expect(runs[0].kill).toHaveBeenCalledWith('SIGKILL')

      await until(() => runs.length === 2)
      runs[1].finish(0)
      await expect(next).resolves.toBeDefined()

      expect(get).toHaveBeenCalledTimes(2)
      expect(runs).toHaveLength(2)
    })
  })
})
