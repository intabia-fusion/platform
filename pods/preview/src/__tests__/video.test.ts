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
import { type StorageAdapter } from '@hcengineering/server-core'
import { type ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { Readable } from 'stream'

import { VideoProvider } from '../providers/video'
import { TemporaryDir } from '../tempdir'
import { extractThumbnail, FfmpegError } from '../utils/ffmpeg'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))

const spawnMock = spawn as unknown as jest.Mock

const WS = 'ws-1' as WorkspaceUuid
const TIMEOUT = 5000
const PIECE = 1024
const PLAYLIST = '#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://attacker.example/seg.ts\n#EXT-X-ENDLIST\n'

// frame is what ends up in the output file; null leaves no file, as for a clip
// shorter than the seek time
function fakeFfmpeg (
  args: string[],
  code: number | null,
  stderr = '',
  frame: string | null = 'frame',
  signal: string | null = null
): ChildProcess {
  const proc = new EventEmitter() as any
  proc.stderr = new EventEmitter()
  setImmediate(() => {
    if (code === 0 && frame !== null) writeFileSync(args[args.length - 1], frame)
    proc.stderr.emit('data', Buffer.from(stderr))
    proc.emit('close', code, signal)
  })
  return proc
}

// the frame position ffmpeg was given: the -ss value or the -vf value
function positionOf (args: string[]): string {
  const flag = args.includes('-ss') ? '-ss' : '-vf'
  return args[args.indexOf(flag) + 1]
}

interface FakeProcess extends Omit<ChildProcess, 'kill'> {
  kill: jest.Mock
}

// ffmpeg that never ends by itself; kill ends it like a real process, and 'close' follows
function hungFfmpeg (): FakeProcess {
  const proc = new EventEmitter() as any
  proc.stderr = new EventEmitter()
  proc.kill = jest.fn(() => {
    setImmediate(() => proc.emit('close', null))
    return true
  })
  return proc
}

function inputOf (args: string[]): string {
  return args[args.indexOf('-i') + 1]
}

async function * brokenStream (): AsyncGenerator<Buffer> {
  yield Buffer.from('partial')
  throw new Error('connection reset')
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('extractThumbnail', () => {
  let dir: string
  let out: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ffmpeg-test-'))
    out = join(dir, 'out.png')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads a local file with only the file protocol and no credentials', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeFfmpeg(args, 0))

    await extractThumbnail('/tmp/preview/blob', out, TIMEOUT)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    const input = args.indexOf('-i')
    const protocols = args.indexOf('-protocol_whitelist')

    expect(cmd).toBe('ffmpeg')
    expect(args[input + 1]).toBe('/tmp/preview/blob')
    // an input option applies only when it comes before -i
    expect(protocols).toBeGreaterThanOrEqual(0)
    expect(protocols).toBeLessThan(input)
    expect(args[protocols + 1]).toBe('file')
    expect(args.join(' ')).not.toMatch(/authorization|bearer|-headers|https?:/i)
  })

  it('limits input formats to containers, before -i', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeFfmpeg(args, 0))

    await extractThumbnail('/tmp/preview/blob', out, TIMEOUT)

    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    const formats = args.indexOf('-format_whitelist')
    const allowed = args[formats + 1].split(',')

    expect(formats).toBeGreaterThanOrEqual(0)
    expect(formats).toBeLessThan(args.indexOf('-i'))
    expect(allowed).toEqual(expect.arrayContaining(['mp4', 'mov', 'webm']))
    for (const playlist of ['hls', 'applehttp', 'dash', 'concat']) {
      expect(allowed).not.toContain(playlist)
    }
  })

  it('rejects with the ffmpeg output of the last run when ffmpeg fails at every position', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      fakeFfmpeg(args, 183, `moov atom not found at ${positionOf(args)}`)
    )

    const error = await extractThumbnail('/tmp/preview/blob', out, TIMEOUT).catch((err) => err)

    expect(error).toBeInstanceOf(FfmpegError)
    expect(error.message).toBe('ffmpeg exited with code 183: moov atom not found at 00:00:00')
    expect(spawnMock).toHaveBeenCalledTimes(4)
  })

  it('takes the 5th frame when ffmpeg fails to decode at 1 s and 0.5 s', async () => {
    // a zeroed middle of a big video: the seek lands in it
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      positionOf(args) === 'select=gte(n\\,4)' ? fakeFfmpeg(args, 0) : fakeFfmpeg(args, 69, 'decode error')
    )

    await extractThumbnail('/tmp/preview/blob', out, TIMEOUT)

    expect(spawnMock.mock.calls.map(([, args]) => positionOf(args))).toEqual([
      '00:00:01',
      '00:00:00.5',
      'select=gte(n\\,4)'
    ])
    expect(readFileSync(out, 'utf8')).toBe('frame')
  })

  it('throws a timeout at once, without trying other positions', async () => {
    spawnMock.mockImplementation(() => hungFfmpeg())

    const error = await extractThumbnail('/tmp/preview/blob', out, 50).catch((err) => err)

    expect(error).toBeInstanceOf(FfmpegError)
    expect(error.retryAfter).toBe(50)
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  it('keeps the end of a long ffmpeg output, where the reason is', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      fakeFfmpeg(args, 1, 'banner '.repeat(50_000) + 'the reason')
    )

    const error = await extractThumbnail('/tmp/preview/blob', out, TIMEOUT).catch((err) => err)

    expect(error.message).toMatch(/the reason$/)
    expect(error.message.length).toBeLessThan(10_000)
  })

  it('kills ffmpeg with SIGKILL and rejects when it does not finish in time', async () => {
    const proc = hungFfmpeg()
    spawnMock.mockImplementation(() => proc)

    await expect(extractThumbnail('/tmp/preview/blob', out, 50)).rejects.toThrow('ffmpeg timed out after 50 ms')

    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('leaves ffmpeg alone when it finishes in time', async () => {
    const started: FakeProcess[] = []
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      const proc = fakeFfmpeg(args, 0) as unknown as FakeProcess
      proc.kill = jest.fn()
      started.push(proc)
      return proc
    })

    await extractThumbnail('/tmp/preview/blob', out, 30)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(started).toHaveLength(1)
    expect(started[0].kill).not.toHaveBeenCalled()
  })

  // retryAfter is how long the refusal lasts: only a failure that the load may explain gets one
  describe.each([
    ['ran out of time', () => hungFfmpeg(), 50, 50],
    ['was killed by a signal', (args: string[]) => fakeFfmpeg(args, null, 'Killed', null, 'SIGKILL'), TIMEOUT, TIMEOUT],
    ['exited with an error', (args: string[]) => fakeFfmpeg(args, 183, 'moov atom not found'), TIMEOUT, undefined],
    ['left no frame', (args: string[]) => fakeFfmpeg(args, 0, '', null), TIMEOUT, undefined]
  ])('when ffmpeg %s', (_what, make, timeout, retryAfter) => {
    it('says for how long the refusal lasts, if at all', async () => {
      spawnMock.mockImplementation((_cmd: string, args: string[]) => make(args))

      const error = await extractThumbnail('/tmp/preview/blob', out, timeout).catch((err) => err)

      expect(error).toBeInstanceOf(FfmpegError)
      expect(error.retryAfter).toBe(retryAfter)
    })
  })

  describe('a clip with no frame at the seek time', () => {
    it('takes the first frame when there is none at 1 s', async () => {
      // a clip shorter than 1 s: ffmpeg exits 0 and writes nothing
      spawnMock.mockImplementation((_cmd: string, args: string[]) =>
        fakeFfmpeg(args, 0, '', positionOf(args) === '00:00:00' ? 'frame' : null)
      )

      await extractThumbnail('/tmp/preview/blob', out, TIMEOUT)

      expect(spawnMock).toHaveBeenCalledTimes(4)
      expect(spawnMock.mock.calls.map(([, args]) => positionOf(args))).toEqual([
        '00:00:01',
        '00:00:00.5',
        'select=gte(n\\,4)',
        '00:00:00'
      ])
      expect(readFileSync(out, 'utf8')).toBe('frame')
    })

    it('counts an empty output file as no frame', async () => {
      spawnMock.mockImplementation((_cmd: string, args: string[]) =>
        fakeFfmpeg(args, 0, '', positionOf(args) === '00:00:00' ? 'frame' : '')
      )

      await extractThumbnail('/tmp/preview/blob', out, TIMEOUT)

      expect(spawnMock).toHaveBeenCalledTimes(4)
      expect(statSync(out).size).toBeGreaterThan(0)
    })

    it('rejects with FfmpegError and its output when there is no frame at 0 s either', async () => {
      spawnMock.mockImplementation((_cmd: string, args: string[]) =>
        fakeFfmpeg(args, 0, 'Output file is empty, nothing was encoded', null)
      )

      const error = await extractThumbnail('/tmp/preview/blob', out, TIMEOUT).catch((err) => err)

      expect(error).toBeInstanceOf(FfmpegError)
      expect(error.message).toContain('no frame')
      expect(error.message).toContain('Output file is empty')
      expect(spawnMock).toHaveBeenCalledTimes(4)
    })

    it('gives the later runs the timeout as well', async () => {
      const proc = hungFfmpeg()
      spawnMock
        .mockImplementationOnce((_cmd: string, args: string[]) => fakeFfmpeg(args, 0, '', null))
        .mockImplementationOnce(() => proc)

      await expect(extractThumbnail('/tmp/preview/blob', out, 50)).rejects.toThrow('ffmpeg timed out after 50 ms')

      expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
    })
  })
})

describe('VideoProvider', () => {
  const ctx = new MeasureMetricsContext('video-test', {})
  const getUrl = jest.fn()
  let tempDir: TemporaryDir
  let get: jest.Mock
  let provider: VideoProvider

  beforeEach(() => {
    tempDir = new TemporaryDir(ctx, 'preview-test-')
    get = jest.fn(async () => Readable.from([Buffer.from(PLAYLIST)]))
    provider = new VideoProvider({ partial: get, getUrl } as unknown as StorageAdapter, tempDir, TIMEOUT, PIECE)
  })

  afterEach(async () => {
    getUrl.mockReset()
    await tempDir.close()
  })

  it('passes ffmpeg a local copy of the blob, without a token or a blob url', async () => {
    let input = ''
    let content = ''
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      input = inputOf(args)
      content = readFileSync(input, 'utf8')
      return fakeFfmpeg(args, 0)
    })

    const result = await provider.image(ctx, WS, 'x.m3u8', 'video/mp4', PLAYLIST.length)

    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(get).toHaveBeenCalledWith(expect.anything(), { uuid: WS }, 'x.m3u8', 0, PLAYLIST.length)
    expect(getUrl).not.toHaveBeenCalled()
    expect(input.startsWith(tempDir.path)).toBe(true)
    // the blob name must not leak into the local name: ffmpeg picks hls by the .m3u8 extension
    expect(input).not.toContain('m3u8')
    expect(content).toBe(PLAYLIST)
    expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file')
    expect(args.join(' ')).not.toMatch(/authorization|bearer|-headers|https?:|attacker/i)
    expect(result.mimeType).toBe('image/png')
    expect(result.filePath.endsWith('.png')).toBe(true)
  })

  it('writes the head and the tail of a big blob at their offsets into a file of the full size', async () => {
    const source = Buffer.from('0123456789')
    get.mockImplementation(async (_c: unknown, _w: unknown, _n: string, offset: number, length: number) =>
      Readable.from([source.subarray(offset, offset + length)])
    )
    let content = Buffer.alloc(0)
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      content = readFileSync(inputOf(args))
      return fakeFfmpeg(args, 0)
    })
    const small = new VideoProvider({ partial: get } as unknown as StorageAdapter, tempDir, TIMEOUT, 3)

    await small.image(ctx, WS, 'video.mp4', 'video/mp4', source.length)

    expect(get.mock.calls.map(([, , , offset, length]) => [offset, length])).toEqual([
      [0, 3],
      [7, 3]
    ])
    expect(content).toEqual(Buffer.concat([Buffer.from('012'), Buffer.alloc(4), Buffer.from('789')]))
  })

  it('removes the local copy of the blob once ffmpeg is done', async () => {
    let input = ''
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      input = inputOf(args)
      return fakeFfmpeg(args, 0)
    })

    await provider.image(ctx, WS, 'video.mp4', 'video/mp4', PLAYLIST.length)

    expect(input).not.toBe('')
    expect(existsSync(input)).toBe(false)
  })

  it.each([
    [
      'ffmpeg fails',
      'ffmpeg exited with code 1',
      () => {
        spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeFfmpeg(args, 1, 'Invalid data'))
      }
    ],
    [
      'reading the blob fails',
      'connection reset',
      () => {
        get.mockImplementation(async () => Readable.from(brokenStream()))
      }
    ],
    [
      'there is no frame at all',
      'no frame',
      () => {
        spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeFfmpeg(args, 0, '', null))
      }
    ]
  ])('removes the local copy of the blob when %s', async (_what, message, setup) => {
    setup()

    await expect(provider.image(ctx, WS, 'video.mp4', 'video/mp4', PLAYLIST.length)).rejects.toThrow(message)

    expect(readdirSync(tempDir.path)).toEqual([])
  })

  it('gives a clip shorter than 1 s a preview from its first frame, with one copy of the blob', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) =>
      fakeFfmpeg(args, 0, '', positionOf(args) === '00:00:00' ? 'frame' : null)
    )

    const result = await provider.image(ctx, WS, 'short.mp4', 'video/mp4', PLAYLIST.length)

    expect(readFileSync(result.filePath, 'utf8')).toBe('frame')
    expect(spawnMock).toHaveBeenCalledTimes(4)
    expect(get).toHaveBeenCalledTimes(1)
    expect(readdirSync(tempDir.path)).toEqual([basename(result.filePath)])
  })

  it.each(['image', 'metadata'] as const)(
    'kills a hung ffmpeg on %s, rejects and removes the local copy of the blob',
    async (method) => {
      const proc = hungFfmpeg()
      spawnMock.mockImplementation(() => proc)
      const hurried = new VideoProvider({ partial: get, getUrl } as unknown as StorageAdapter, tempDir, 50, PIECE)

      await expect(hurried[method](ctx, WS, 'video.mp4', 'video/mp4', PLAYLIST.length)).rejects.toThrow(
        'ffmpeg timed out'
      )

      expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
      expect(readdirSync(tempDir.path)).toEqual([])
    }
  )
})
