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

import { spawn } from 'child_process'
import { stat } from 'fs/promises'

import { ToolError } from '../error'

// containers only: the hls and concat demuxers open files named inside the blob
const INPUT_FORMATS = 'mov,mp4,matroska,webm,avi,mpeg,mpegts,ogg,flv,asf'
// the reason is at the end of the output, and a corrupt stream can print without end
const MAX_OUTPUT = 4096
// a clip shorter than the seek time has no frame there: ffmpeg exits 0 and writes nothing
const FIRST_FRAME = '00:00:00'

// ffmpeg itself failed on the blob, so it fails the same way again
export class FfmpegError extends ToolError {
  constructor (message: string, retryAfter?: number) {
    super(message, retryAfter)
    this.name = 'FfmpegError'
  }
}

export async function extractThumbnail (
  file: string,
  path: string,
  timeout: number,
  timestamp = '00:00:01'
): Promise<void> {
  await runFfmpeg(file, path, timeout, timestamp)
  if (await hasFrame(path)) {
    return
  }

  const output = await runFfmpeg(file, path, timeout, FIRST_FRAME)
  if (!(await hasFrame(path))) {
    throw new FfmpegError(`ffmpeg wrote no frame: ${output}`)
  }
}

async function hasFrame (path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return false
    }
    throw err
  }
}

// resolves with the end of the ffmpeg output
async function runFfmpeg (file: string, path: string, timeout: number, timestamp: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const args = [
      // the blob is untrusted: anything it references may only be a local file
      '-protocol_whitelist',
      'file',
      '-format_whitelist',
      INPUT_FORMATS,
      '-i',
      file,
      '-ss',
      timestamp,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-y',
      path
    ]
    const ffmpeg = spawn('ffmpeg', args)

    let error = ''

    // a hung ffmpeg would keep its slot and the local copy of the blob for good
    const timer = setTimeout(() => {
      ffmpeg.kill('SIGKILL')
      reject(new FfmpegError(`ffmpeg timed out after ${timeout} ms: ${error}`, timeout))
    }, timeout)

    ffmpeg.stderr.on('data', (data) => {
      error = (error + data.toString()).slice(-MAX_OUTPUT)
    })

    ffmpeg.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code !== 0) {
        // a signal is not the blob's doing: the load may be to blame
        reject(
          signal != null
            ? new FfmpegError(`ffmpeg was killed by ${signal}: ${error}`, timeout)
            : new FfmpegError(`ffmpeg exited with code ${code}: ${error}`)
        )
      } else {
        resolve(error)
      }
    })

    ffmpeg.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to start ffmpeg: ${err.message}`))
    })
  })
}
