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

import { MeasureMetricsContext } from '@hcengineering/core'
import { type ChildProcess, spawn } from 'child_process'
import { EventEmitter } from 'events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { docToPdf, LibreOfficeError } from '../utils/libreoffice'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))

const spawnMock = spawn as unknown as jest.Mock

const TIMEOUT = 5000

const ctx = new MeasureMetricsContext('libreoffice-test', {})

interface FakeProcess extends Omit<ChildProcess, 'kill' | 'pid'> {
  kill: jest.Mock
  pid?: number
}

// ends with this code on its own, and writes the pdf like LibreOffice does when the code is 0
function fakeLibreOffice (
  args: string[],
  code: number | null,
  pdf: string | null = 'pdf',
  signal: string | null = null
): FakeProcess {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = jest.fn()
  setImmediate(() => {
    if (code === 0 && pdf !== null) {
      const doc = args[args.length - 1]
      writeFileSync(doc.replace(/\.[^.]+$/, '') + '.pdf', pdf)
    }
    proc.emit('close', code, signal)
  })
  return proc
}

// never ends by itself; kill ends it like a real process, and 'close' follows
function hungLibreOffice (pid?: number): FakeProcess {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.pid = pid
  proc.kill = jest.fn(() => {
    setImmediate(() => proc.emit('close', null))
    return true
  })
  return proc
}

const PROFILE = '-env:UserInstallation=file://'

function profileOf (args: string[]): string {
  return args.find((arg) => arg.startsWith(PROFILE))?.slice(PROFILE.length) ?? ''
}

describe('docToPdf', () => {
  let dir: string
  let doc: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'libreoffice-test-'))
    doc = join(dir, 'document.docx')
    writeFileSync(doc, 'document')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    spawnMock.mockReset()
    jest.restoreAllMocks()
  })

  it('converts the document next to itself and removes the profile of the run', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeLibreOffice(args, 0))

    const pdf = await docToPdf(ctx, doc, TIMEOUT)

    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('libreoffice')
    expect(args.slice(args.indexOf('--convert-to'), args.indexOf('--convert-to') + 2)).toEqual(['--convert-to', 'pdf'])
    expect(pdf).toBe(join(dir, 'document.pdf'))
    expect(existsSync(pdf)).toBe(true)
    expect(profileOf(args)).not.toBe('')
    expect(existsSync(profileOf(args))).toBe(false)
  })

  it.each([
    ['the process', undefined],
    ['the whole process group', 4321]
  ])('kills %s on a timeout, rejects with LibreOfficeError and removes the profile', async (_what, pid) => {
    const groupKill = jest.spyOn(process, 'kill').mockImplementation(() => true)
    const proc = hungLibreOffice(pid)
    spawnMock.mockImplementation(() => proc)

    const error = await docToPdf(ctx, doc, 50).catch((err) => err)

    expect(error).toBeInstanceOf(LibreOfficeError)
    expect(error.message).toContain('timed out after 50 ms')
    // the load may be to blame, so the refusal is asked to last one timeout only
    expect(error.retryAfter).toBe(50)
    const [, args, options] = spawnMock.mock.calls[0] as [string, string[], { detached?: boolean }]
    expect(existsSync(profileOf(args))).toBe(false)
    if (pid === undefined) {
      expect(proc.kill).toHaveBeenCalledTimes(1)
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
    } else {
      // a process group leader, so that LibreOffice children die with it
      expect(options.detached).toBe(true)
      expect(groupKill).toHaveBeenCalledWith(-pid, 'SIGKILL')
    }
  })

  it('leaves a conversion alone that finishes in time', async () => {
    const started: FakeProcess[] = []
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      const proc = fakeLibreOffice(args, 0)
      started.push(proc)
      return proc
    })

    await docToPdf(ctx, doc, 30)
    await new Promise((resolve) => setTimeout(resolve, 60))

    expect(started).toHaveLength(1)
    expect(started[0].kill).not.toHaveBeenCalled()
  })

  it('rejects with LibreOfficeError when LibreOffice exits with an error', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeLibreOffice(args, 81))

    const error = await docToPdf(ctx, doc, TIMEOUT).catch((err) => err)

    expect(error).toBeInstanceOf(LibreOfficeError)
    expect(error.message).toContain('exited with code 81')
    expect(error.retryAfter).toBeUndefined()
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(existsSync(profileOf(args))).toBe(false)
  })

  it('rejects with LibreOfficeError when LibreOffice exits cleanly and writes no pdf', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeLibreOffice(args, 0, null))

    const error = await docToPdf(ctx, doc, TIMEOUT).catch((err) => err)

    expect(error).toBeInstanceOf(LibreOfficeError)
    expect(error.message).toContain('Failed to create PDF')
    expect(error.retryAfter).toBeUndefined()
  })

  it('says for how long it was allowed to run when a signal killed LibreOffice', async () => {
    spawnMock.mockImplementation((_cmd: string, args: string[]) => fakeLibreOffice(args, null, null, 'SIGKILL'))

    const error = await docToPdf(ctx, doc, TIMEOUT).catch((err) => err)

    expect(error).toBeInstanceOf(LibreOfficeError)
    expect(error.message).toContain('killed by SIGKILL')
    expect(error.retryAfter).toBe(TIMEOUT)
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(existsSync(profileOf(args))).toBe(false)
  })

  it('does not blame the document when LibreOffice cannot be started', async () => {
    spawnMock.mockImplementation(() => {
      const proc = hungLibreOffice()
      setImmediate(() => proc.emit('error', new Error('spawn libreoffice ENOENT')))
      return proc
    })

    const error = await docToPdf(ctx, doc, TIMEOUT).catch((err) => err)

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(LibreOfficeError)
    expect(error.message).toContain('Failed to start LibreOffice')
  })
})
