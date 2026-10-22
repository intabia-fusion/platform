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
import { mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'

import { type Cache, createCache } from '../cache'
import { OctetStreamProvider } from '../providers/octet'
import { createPreviewService, type PreviewService, type ThumbnailParams } from '../service'
import { TemporaryDir } from '../tempdir'
import { FfmpegError } from '../utils/ffmpeg'
import { BlobReadTimeout } from '../utils/blob'
import { hangingStream, noCache, type Run, settle, startRun, until } from './helpers'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))
// the frame is a stub file here, what sharp does with it is not under test
jest.mock('../utils/sharp', () => ({
  transformImage: jest.fn(async (_src: string, dst: string) => {
    jest.requireActual('fs').writeFileSync(dst, 'thumbnail')
    return { contentType: 'image/png', size: 9 }
  })
}))
jest.mock('../metadata', () => ({ getImageMetadata: jest.fn(async () => ({ width: 1, height: 1, blurhash: 'h' })) }))

const spawnMock = spawn as unknown as jest.Mock

const WS = 'ws-1' as WorkspaceUuid
const LIMIT = 1024 * 1024
const PARAMS: ThumbnailParams = { fit: 'cover', format: 'png', width: 64, height: undefined }
// how long a blob that ffmpeg failed on is remembered
const REFUSAL_TTL = 10 * 60 * 1000
// how long the metadata of a blob is remembered, and for how many blobs
const METADATA_TTL = 60 * 60 * 1000
const METADATA_MAX = 1000

const ctx = new MeasureMetricsContext('service-video-test', {})
const cacheOff = noCache(ctx)

let runs: Run[]
// every started ffmpeg ends by itself with this code; undefined leaves it to the test
let autoCode: number | undefined
let autoStderr: string
// which runs that exit 0 leave a frame behind
let hasFrame: (args: string[]) => boolean

// etags is what the storage answers per blob; overwriting a blob changes its etag
function makeStorage (
  types: Record<string, string> = {},
  fallbackType = 'video/mp4',
  size = 4
): { storage: StorageAdapter, get: jest.Mock, etags: Record<string, string> } {
  const etags: Record<string, string> = {}
  const get = jest.fn(async () => Readable.from([Buffer.from('blob')]))
  // the provider reads through partial, the counts below are of its reads
  const stat = jest.fn(
    async (_ctx: unknown, _ws: unknown, name: string) =>
      ({ contentType: types[name] ?? fallbackType, size, etag: etags[name] ?? 'etag-1' }) as unknown as Blob
  )
  return { storage: { stat, get, partial: get } as unknown as StorageAdapter, get, etags }
}

describe('PreviewService with video', () => {
  let tempDir: TemporaryDir

  function makeService (
    storage: StorageAdapter,
    options: { video?: number, shared?: number, timeout?: number, cache?: Cache, piece?: number } = {}
  ): PreviewService {
    const config = {
      MaxBlobSize: LIMIT,
      Video: {
        concurrency: options.video ?? 2,
        timeout: options.timeout ?? 60 * 1000,
        headTailSize: options.piece ?? 5 * 1024 * 1024
      },
      LibreOfficeTimeout: 120 * 1000,
      PdfTimeout: 60 * 1000
    }
    return createPreviewService(storage, options.cache ?? cacheOff, tempDir, config, options.shared ?? 10)
  }

  beforeEach(() => {
    tempDir = new TemporaryDir(ctx, 'preview-test-')
    runs = []
    autoCode = 0
    autoStderr = ''
    hasFrame = () => true
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      startRun(
        runs,
        args,
        // ffmpeg writes the frame to the last argument
        (a) => {
          if (hasFrame(a)) writeFileSync(a[a.length - 1], 'frame')
        },
        () => (autoCode === undefined ? undefined : { code: autoCode, stderr: autoStderr })
      )
    )
  })

  afterEach(async () => {
    spawnMock.mockReset()
    await tempDir.close()
  })

  describe('one blob, one copy', () => {
    it('serves thumbnails of different widths from one copy and one frame', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      const [small, large] = await Promise.all([
        service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 64 }),
        service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 128 })
      ])

      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(1)
      // each width still gets its own file
      expect(small.filePath).not.toBe(large.filePath)
    })

    it('serves parallel metadata requests from one copy and one frame', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      const [first, second] = await Promise.all([
        service.metadata(ctx, WS, 'video'),
        service.metadata(ctx, WS, 'video')
      ])

      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(1)
      expect(second).toEqual(first)
    })

    it('does the same with a disk cache, which moves the frame into the cache', async () => {
      const { storage, get } = makeStorage()
      const cache = createCache(ctx, {
        enabled: true,
        cachePath: mkdtempSync(join(tmpdir(), 'preview-cache-')),
        cacheSize: 10 * 1024 * 1024,
        gcInterval: 60 * 1000
      })
      try {
        const service = makeService(storage, { cache })

        await Promise.all([
          service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 64 }),
          service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 128 }),
          service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 256 })
        ])

        expect(get).toHaveBeenCalledTimes(1)
        expect(spawnMock).toHaveBeenCalledTimes(1)
      } finally {
        await cache.close()
      }
    })

    it('copies another blob on its own', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      await Promise.all([service.metadata(ctx, WS, 'one'), service.metadata(ctx, WS, 'two')])

      expect(get).toHaveBeenCalledTimes(2)
    })
  })

  describe('a blob that the storage does not deliver in time', () => {
    it('is given up on, with the body closed, no copy left and ffmpeg never started', async () => {
      const body = hangingStream()
      const { storage, get } = makeStorage()
      get.mockImplementation(async () => body)
      const service = makeService(storage, { timeout: 200 })

      await expect(service.metadata(ctx, WS, 'slow')).rejects.toThrow('timed out')

      expect(body.destroyed).toBe(true)
      expect(spawnMock).not.toHaveBeenCalled()
      expect(readdirSync(tempDir.path)).toEqual([])
    })

    it('frees the video slot for the next blob', async () => {
      const { storage, get } = makeStorage()
      get.mockImplementation(async (_ctx: unknown, _ws: unknown, name: string) =>
        name === 'slow' ? hangingStream() : Readable.from([Buffer.from('blob')])
      )
      const service = makeService(storage, { video: 1, timeout: 200 })

      const slow = service.metadata(ctx, WS, 'slow').catch((err) => err)
      await until(() => get.mock.calls.length === 1)
      const fast = service.metadata(ctx, WS, 'fast')

      await expect(fast).resolves.toBeDefined()
      expect(await slow).toHaveProperty('message', expect.stringContaining('timed out'))
    })
  })

  describe('a video over the size limit', () => {
    it('is served from its head and tail, not refused', async () => {
      const piece = 1000
      const size = LIMIT * 3
      const { storage, get } = makeStorage({}, 'video/mp4', size)
      const service = makeService(storage, { piece })

      await expect(service.thumbnail(ctx, WS, 'big', PARAMS)).resolves.toBeDefined()

      expect(get.mock.calls.map(([, , , offset, length]) => [offset, length])).toEqual([
        [0, piece],
        [size - piece, piece]
      ])
    })
  })

  describe('a video that the storage does not deliver in time', () => {
    it('is refused, and the next request does not read it again', async () => {
      const { storage, get } = makeStorage()
      get.mockImplementation(async () => hangingStream())
      const service = makeService(storage, { timeout: 100 })

      await expect(service.metadata(ctx, WS, 'slow')).rejects.toBeInstanceOf(BlobReadTimeout)
      await expect(service.metadata(ctx, WS, 'slow')).rejects.toBeInstanceOf(BlobReadTimeout)

      expect(get).toHaveBeenCalledTimes(1)
    })
  })

  describe('a refused blob', () => {
    beforeEach(() => {
      autoCode = 183
      autoStderr = 'moov atom not found'
    })

    it('is not copied again, by thumbnail of any width or by metadata', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      await expect(service.thumbnail(ctx, WS, 'bad', { ...PARAMS, width: 64 })).rejects.toThrow(
        'ffmpeg exited with code 183'
      )
      expect(get).toHaveBeenCalledTimes(1)

      await expect(service.thumbnail(ctx, WS, 'bad', { ...PARAMS, width: 128 })).rejects.toThrow('moov atom')
      await expect(service.metadata(ctx, WS, 'bad')).rejects.toThrow('moov atom')

      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(4)
      expect(readdirSync(tempDir.path)).toEqual([])
    })

    it('does not stop the other blobs', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      await expect(service.metadata(ctx, WS, 'bad')).rejects.toThrow('ffmpeg exited')
      autoCode = 0
      autoStderr = ''
      await expect(service.metadata(ctx, WS, 'good')).resolves.toBeDefined()

      expect(get).toHaveBeenCalledTimes(2)
    })

    // the document is to blame, however short the timeout is
    it('stays for ten minutes and is tried again after that', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage, { timeout: 200 })
      const clock = jest.spyOn(performance, 'now')

      try {
        await expect(service.metadata(ctx, WS, 'bad')).rejects.toThrow('ffmpeg exited')
        const failedAt = performance.now()

        for (const at of [5000, REFUSAL_TTL - 1000]) {
          clock.mockReturnValue(failedAt + at)
          await settle()
          await expect(service.metadata(ctx, WS, 'bad')).rejects.toThrow('ffmpeg exited')
          expect(get).toHaveBeenCalledTimes(1)
        }

        clock.mockReturnValue(failedAt + REFUSAL_TTL + 1000)
        await settle()
        await expect(service.metadata(ctx, WS, 'bad')).rejects.toThrow('ffmpeg exited')
        expect(get).toHaveBeenCalledTimes(2)
      } finally {
        clock.mockRestore()
      }
    })
  })

  describe('a clip with no frame at 1 s', () => {
    it('is refused without a new copy when it has no frame at all', async () => {
      hasFrame = () => false
      autoStderr = 'Output file is empty, nothing was encoded'
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      const error = await service.thumbnail(ctx, WS, 'empty', { ...PARAMS, width: 64 }).catch((err) => err)
      expect(error).toBeInstanceOf(FfmpegError)
      expect(error.message).toContain('Output file is empty')
      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(4)

      await expect(service.thumbnail(ctx, WS, 'empty', { ...PARAMS, width: 128 })).rejects.toBeInstanceOf(FfmpegError)
      await expect(service.metadata(ctx, WS, 'empty')).rejects.toBeInstanceOf(FfmpegError)

      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(4)
      expect(readdirSync(tempDir.path)).toEqual([])
    })
  })

  describe('a refused blob that was overwritten', () => {
    beforeEach(() => {
      autoCode = 183
      autoStderr = 'moov atom not found'
    })

    it('is not refused for what the new content does', async () => {
      const { storage, get, etags } = makeStorage()
      const service = makeService(storage)

      await expect(service.metadata(ctx, WS, 'video')).rejects.toThrow('ffmpeg exited')
      await expect(service.thumbnail(ctx, WS, 'video', PARAMS)).rejects.toThrow('ffmpeg exited')
      expect(get).toHaveBeenCalledTimes(1)

      // the name stays, the content is another one
      etags.video = 'etag-2'
      autoCode = 0
      autoStderr = ''

      await expect(service.thumbnail(ctx, WS, 'video', { ...PARAMS, width: 128 })).resolves.toBeDefined()
      expect(get).toHaveBeenCalledTimes(2)
    })
  })

  describe('metadata of a blob', () => {
    it('is served from memory to the next request', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)

      const first = await service.metadata(ctx, WS, 'video')
      const second = await service.metadata(ctx, WS, 'video')

      expect(second).toEqual(first)
      expect(get).toHaveBeenCalledTimes(1)
      expect(spawnMock).toHaveBeenCalledTimes(1)
    })

    it('is made again when the blob was overwritten', async () => {
      const { storage, get, etags } = makeStorage()
      const service = makeService(storage)

      await service.metadata(ctx, WS, 'video')
      etags.video = 'etag-2'
      await service.metadata(ctx, WS, 'video')
      await service.metadata(ctx, WS, 'video')

      expect(get).toHaveBeenCalledTimes(2)
    })

    it('is made again after an hour, not before', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage)
      const now = performance.now()
      const clock = jest.spyOn(performance, 'now')

      try {
        await service.metadata(ctx, WS, 'video')

        clock.mockReturnValue(now + METADATA_TTL - 1000)
        await settle()
        await service.metadata(ctx, WS, 'video')
        expect(get).toHaveBeenCalledTimes(1)

        clock.mockReturnValue(now + METADATA_TTL + 1000)
        await settle()
        await service.metadata(ctx, WS, 'video')
        expect(get).toHaveBeenCalledTimes(2)
      } finally {
        clock.mockRestore()
      }
    })

    it('is kept for 1000 blobs, the least recently asked for goes first', async () => {
      const { storage } = makeStorage({}, 'application/octet-stream')
      const service = makeService(storage)
      const made = jest.spyOn(OctetStreamProvider.prototype, 'metadata')

      try {
        for (let i = 0; i <= METADATA_MAX; i++) {
          await service.metadata(ctx, WS, `blob-${i}`)
        }
        expect(made).toHaveBeenCalledTimes(METADATA_MAX + 1)

        await service.metadata(ctx, WS, `blob-${METADATA_MAX}`)
        expect(made).toHaveBeenCalledTimes(METADATA_MAX + 1)

        await service.metadata(ctx, WS, 'blob-0')
        expect(made).toHaveBeenCalledTimes(METADATA_MAX + 2)
      } finally {
        made.mockRestore()
      }
    })
  })

  describe('a blob that could not be read', () => {
    it('is read again by the next request', async () => {
      const { storage, get } = makeStorage()
      get.mockImplementationOnce(async () => {
        throw new Error('connection reset')
      })
      const service = makeService(storage)

      await expect(service.metadata(ctx, WS, 'video')).rejects.toThrow('connection reset')
      await expect(service.metadata(ctx, WS, 'video')).resolves.toBeDefined()

      expect(get).toHaveBeenCalledTimes(2)
    })
  })

  describe('a refusal that the load may explain', () => {
    beforeEach(() => {
      autoCode = undefined
    })

    it.each([
      ['ffmpeg ran out of time', 200, 'ffmpeg timed out', false],
      ['a signal killed ffmpeg', 1000, 'killed by SIGKILL', true]
    ])('lasts one timeout when %s', async (_what, timeout, message, bySignal) => {
      const { storage, get } = makeStorage()
      const service = makeService(storage, { timeout })
      const clock = jest.spyOn(performance, 'now')

      try {
        const first = service.metadata(ctx, WS, 'video')
        if (bySignal) {
          await until(() => runs.length === 1)
          runs[0].finish(null, 'Killed', 'SIGKILL')
        }
        await expect(first).rejects.toThrow(message)
        const failedAt = performance.now()

        clock.mockReturnValue(failedAt + timeout / 2)
        await settle()
        await expect(service.metadata(ctx, WS, 'video')).rejects.toThrow(message)
        expect(get).toHaveBeenCalledTimes(1)

        clock.mockReturnValue(failedAt + timeout * 1.5)
        await settle()
        const again = service.metadata(ctx, WS, 'video')
        await until(() => runs.length === 2)
        runs[1].finish(0)
        await expect(again).resolves.toBeDefined()
        expect(get).toHaveBeenCalledTimes(2)
      } finally {
        clock.mockRestore()
      }
    })
  })

  describe('a hung ffmpeg', () => {
    beforeEach(() => {
      autoCode = undefined
    })

    it('is killed and frees its video slot', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage, { video: 1, timeout: 50 })

      const hung = service.metadata(ctx, WS, 'hung')
      const next = service.metadata(ctx, WS, 'next')
      await until(() => runs.length === 1)

      await expect(hung).rejects.toThrow('ffmpeg timed out after 50 ms')
      expect(runs[0].kill).toHaveBeenCalledWith('SIGKILL')

      // the only video slot is free again
      await until(() => runs.length === 2)
      runs[1].finish(0)
      await expect(next).resolves.toBeDefined()

      expect(get).toHaveBeenCalledTimes(2)
      expect(runs).toHaveLength(2)
    })
  })

  describe('video limit', () => {
    beforeEach(() => {
      autoCode = undefined
    })

    it('copies and decodes no more videos at once than the limit', async () => {
      const { storage, get } = makeStorage()
      const service = makeService(storage, { video: 2 })

      const done = ['a', 'b', 'c', 'd', 'e'].map(async (name) => await service.metadata(ctx, WS, name))
      await until(() => runs.length === 2)
      await settle()
      expect(get).toHaveBeenCalledTimes(2)
      expect(runs).toHaveLength(2)

      runs[0].finish(0)
      await until(() => runs.length === 3)
      await settle()
      expect(get).toHaveBeenCalledTimes(3)
      expect(runs).toHaveLength(3)

      runs[1].finish(0)
      runs[2].finish(0)
      await until(() => runs.length === 5)

      runs[3].finish(0)
      runs[4].finish(0)
      await Promise.all(done)
    })

    it('does not let queued videos take the slots of other previews', async () => {
      const { storage } = makeStorage({ picture: 'image/png' })
      // two shared slots, one video at a time
      const service = makeService(storage, { video: 1, shared: 2 })

      const videos = ['a', 'b', 'c'].map(async (name) => await service.metadata(ctx, WS, name))
      await until(() => runs.length === 1)
      await settle()
      expect(runs).toHaveLength(1)

      // the second slot is free for a picture while two videos are still waiting
      await expect(service.metadata(ctx, WS, 'picture')).resolves.toBeDefined()
      expect(runs).toHaveLength(1)

      runs[0].finish(0)
      await until(() => runs.length === 2)
      runs[1].finish(0)
      await until(() => runs.length === 3)
      runs[2].finish(0)
      await Promise.all(videos)
    })

    it('frees the slot of a video that failed', async () => {
      const { storage } = makeStorage()
      const service = makeService(storage, { video: 1 })

      const failed = service.metadata(ctx, WS, 'a')
      const next = service.metadata(ctx, WS, 'b')
      await until(() => runs.length === 1)
      await settle()
      expect(runs).toHaveLength(1)

      // every frame position of the failed video is tried before its slot is freed
      for (let i = 0; i < 4; i++) {
        await until(() => runs.length === i + 1)
        runs[i].finish(1, 'Invalid data found when processing input')
      }
      await expect(failed).rejects.toThrow('ffmpeg exited with code 1')
      await until(() => runs.length === 5)

      runs[4].finish(0)
      await expect(next).resolves.toBeDefined()
    })
  })
})
