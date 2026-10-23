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

import { type MeasureContext } from '@hcengineering/core'
import { EventEmitter } from 'events'
import { Readable } from 'stream'

import { type Cache, createCache } from '../cache'

// for what must not happen: a late start would only make such a check pass for the wrong reason
export async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30))
}

export async function until (condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not reached in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

// a body that never ends
export function hangingStream (content = 'blob'): Readable {
  const stream = new Readable({ read () {} })
  stream.push(Buffer.from(content))
  return stream
}

export function noCache (ctx: MeasureContext): Cache {
  return createCache(ctx, { enabled: false, cachePath: undefined, cacheSize: undefined, gcInterval: undefined })
}

export interface Run {
  args: string[]
  kill: jest.Mock
  // a null code is a death by the signal
  finish: (code: number | null, stderr?: string, signal?: string) => void
}

// A child process the test drives by hand. onSuccess writes what a run that exits 0 leaves behind.
// auto, when it answers, ends the run by itself with that code.
export function startRun (
  runs: Run[],
  args: string[],
  onSuccess: (args: string[]) => void,
  auto: () => { code: number, stderr: string } | undefined
): any {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = jest.fn(() => {
    setImmediate(() => proc.emit('close', null))
    return true
  })
  const run: Run = {
    args,
    kill: proc.kill,
    finish: (code, stderr = '', signal) => {
      if (code === 0) onSuccess(args)
      proc.stderr.emit('data', Buffer.from(stderr))
      proc.emit('close', code, signal ?? null)
    }
  }
  runs.push(run)
  const answer = auto()
  if (answer !== undefined) {
    setImmediate(() => {
      run.finish(answer.code, answer.stderr)
    })
  }
  return proc
}
