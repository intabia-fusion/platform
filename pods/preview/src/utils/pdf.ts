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

import { spawn } from 'child_process'

import { ToolError } from '../error'

// the reason is at the end of the output, and a corrupt file can print without end
const MAX_OUTPUT = 4096

// pdftocairo itself failed on the file, so it fails the same way again
export class PdfError extends ToolError {
  constructor (message: string, retryAfter?: number) {
    super(message, retryAfter)
    this.name = 'PdfError'
  }
}

export async function pdfToImage (ctx: MeasureContext, pdfFile: string, timeout: number): Promise<string> {
  const pngFile: string = pdfFile + '.png'

  await new Promise<void>((resolve, reject) => {
    // -singlefile writes <output>.png, the first page only
    const pdftocairo = spawn('pdftocairo', ['-f', '1', '-l', '1', '-singlefile', '-png', pdfFile, pdfFile])

    let error = ''

    // a hung pdftocairo would keep its slot and the copy of the file for good
    const timer = setTimeout(() => {
      pdftocairo.kill('SIGKILL')
      reject(new PdfError(`pdftocairo timed out after ${timeout} ms: ${error}`, timeout))
    }, timeout)

    pdftocairo.stderr.on('data', (data) => {
      error = (error + data.toString()).slice(-MAX_OUTPUT)
    })

    pdftocairo.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code !== 0) {
        // a signal is not the file's doing: the load may be to blame
        reject(
          signal != null
            ? new PdfError(`pdftocairo was killed by ${signal}: ${error}`, timeout)
            : new PdfError(`pdftocairo exited with code ${code}: ${error}`)
        )
      } else {
        resolve()
      }
    })

    pdftocairo.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to start pdftocairo: ${err.message}`))
    })
  })

  return pngFile
}
