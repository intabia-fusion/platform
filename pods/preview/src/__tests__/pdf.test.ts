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
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

import { pdfToImage, PdfError } from '../utils/pdf'

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }))

const spawnMock = spawn as unknown as jest.Mock

const ctx = new MeasureMetricsContext('pdf-test', {})

// ends with this code on its own, unless the code is undefined
function fakePdftocairo (code?: number | null, stderr = '', signal: string | null = null): { kill: jest.Mock } {
  const proc = new EventEmitter() as any
  proc.stderr = new EventEmitter()
  proc.kill = jest.fn()
  if (code !== undefined) {
    setImmediate(() => {
      proc.stderr.emit('data', Buffer.from(stderr))
      proc.emit('close', code, signal)
    })
  }
  spawnMock.mockReturnValueOnce(proc)
  return proc
}

describe('pdfToImage', () => {
  afterEach(() => {
    spawnMock.mockReset()
  })

  it('renders the first page next to the pdf', async () => {
    fakePdftocairo(0)

    await expect(pdfToImage(ctx, '/tmp/doc.pdf', 5000)).resolves.toBe('/tmp/doc.pdf.png')

    expect(spawnMock).toHaveBeenCalledWith('pdftocairo', [
      '-f',
      '1',
      '-l',
      '1',
      '-singlefile',
      '-png',
      '/tmp/doc.pdf',
      '/tmp/doc.pdf'
    ])
  })

  it('kills a pdftocairo that hangs and asks to retry after the timeout', async () => {
    const proc = fakePdftocairo()

    const error = await pdfToImage(ctx, '/tmp/doc.pdf', 50).catch((err) => err)

    expect(error).toBeInstanceOf(PdfError)
    expect(error.message).toContain('timed out')
    expect(error.retryAfter).toBe(50)
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('fails the same way again on a file that pdftocairo rejects', async () => {
    fakePdftocairo(1, "Syntax Error: Couldn't read xref table")

    const error = await pdfToImage(ctx, '/tmp/doc.pdf', 5000).catch((err) => err)

    expect(error).toBeInstanceOf(PdfError)
    expect(error.message).toContain('exited with code 1')
    expect(error.message).toContain('xref table')
    expect(error.retryAfter).toBeUndefined()
  })

  it('asks to retry after a pdftocairo that a signal killed', async () => {
    fakePdftocairo(null, '', 'SIGKILL')

    const error = await pdfToImage(ctx, '/tmp/doc.pdf', 5000).catch((err) => err)

    expect(error).toBeInstanceOf(PdfError)
    expect(error.retryAfter).toBe(5000)
  })
})
