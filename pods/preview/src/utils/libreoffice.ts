//
// Copyright © 2025 Hardcore Engineering Inc.
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

import { type MeasureContext } from '@hcengineering/core'

import { type ChildProcess, spawn } from 'child_process'
import { access, mkdtemp, rm } from 'fs/promises'
import { dirname, join } from 'path'
import { tmpdir } from 'os'

import { ToolError } from '../error'
import { replaceExt } from './utils'

// LibreOffice itself failed on the document, so it fails the same way again
export class LibreOfficeError extends ToolError {
  constructor (message: string, retryAfter?: number) {
    super(message, retryAfter)
    this.name = 'LibreOfficeError'
  }
}

// the process was started detached, so -pid is its group and reaches everything it started
function killGroup (proc: ChildProcess): void {
  if (proc.pid !== undefined) {
    try {
      process.kill(-proc.pid, 'SIGKILL')
    } catch {
      // the group is gone already
    }
  }
  proc.kill('SIGKILL')
}

export async function docToPdf (ctx: MeasureContext, docFile: string, timeout: number): Promise<string> {
  const pdfDir = dirname(docFile)
  const pdfFile = replaceExt(docFile, '.pdf')

  const profileDir = await ctx.with('mkdtemp', {}, () => {
    return mkdtemp(join(tmpdir(), 'libreoffice-'))
  })

  try {
    const proc = spawn(
      'libreoffice',
      [
        '--headless',
        '--nologo',
        '--nodefault',
        '--nolockcheck',
        '--norestore',
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'pdf',
        '--outdir',
        pdfDir,
        docFile
      ],
      {
        env: {
          SAL_DISABLE_JAVA: '1',
          HOME: process.env.HOME ?? profileDir
        },
        detached: true
      }
    )

    ctx.info('starting LibreOffice', { cmd: proc.spawnfile, args: proc.spawnargs, docFile, pdfFile })

    await new Promise<void>((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let timedOut = false

      // a hung conversion would keep its slot and the copy of the document for good
      const timer = setTimeout(() => {
        timedOut = true
        killGroup(proc)
        ctx.error('LibreOffice timed out', { timeout, docFile, pdfFile })
        reject(new LibreOfficeError(`LibreOffice timed out after ${timeout} ms`, timeout))
      }, timeout)

      proc.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      proc.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      proc.on('close', (code, signal) => {
        clearTimeout(timer)
        if (timedOut) {
          return
        }
        if (code !== 0) {
          ctx.error('LibreOffice failed', { code, signal, stdout, stderr, docFile, pdfFile })
          // a signal is not the document's doing: the load may be to blame
          reject(
            signal != null
              ? new LibreOfficeError(`LibreOffice was killed by ${signal}`, timeout)
              : new LibreOfficeError(`LibreOffice exited with code ${code}`)
          )
        } else {
          resolve()
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        ctx.error('LibreOffice failed', { stdout, stderr, docFile, pdfFile })
        reject(new Error(`Failed to start LibreOffice: ${err.message}`))
      })
    })
  } finally {
    // a failed cleanup must not hide why the conversion failed
    await rm(profileDir, { recursive: true, force: true }).catch((err) => {
      ctx.warn('failed to remove LibreOffice profile', { profileDir, error: err instanceof Error ? err.message : err })
    })
  }

  try {
    await access(pdfFile)
  } catch (err: any) {
    throw new LibreOfficeError(`Failed to create PDF: ${err.message}`)
  }

  return pdfFile
}
