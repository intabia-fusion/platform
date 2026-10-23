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

import { type MeasureContext, type WorkspaceUuid } from '@hcengineering/core'
import { type StorageAdapter } from '@hcengineering/server-core'

import { createWriteStream } from 'fs'
import { open } from 'fs/promises'
import { type Readable } from 'stream'
import { pipeline } from 'stream/promises'

import { ToolError } from '../error'

// One deadline for the whole copy: a slow storage would keep the slot of the caller for good.
export async function copyBlob (
  ctx: MeasureContext,
  storage: StorageAdapter,
  workspace: WorkspaceUuid,
  name: string,
  file: string,
  timeout: number
): Promise<void> {
  const signal = AbortSignal.timeout(timeout)
  const timedOut = (): Error => new Error(`Blob copy timed out after ${timeout} ms`)

  const opening = storage.get(ctx, { uuid: workspace } as any, name)
  // a body that opens after the deadline has no reader left
  void opening.then(
    (late) => {
      if (signal.aborted) late.destroy()
    },
    () => undefined
  )

  const stream = await Promise.race([
    opening,
    new Promise<Readable>((_resolve, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          reject(timedOut())
        },
        { once: true }
      )
    })
  ])

  try {
    await pipeline(stream, createWriteStream(file), { signal })
  } catch (err: any) {
    throw signal.aborted ? timedOut() : err
  }
}

// The same blob is slow again on the next request, so it is refused for one timeout.
export class BlobReadTimeout extends ToolError {
  constructor (timeout: number) {
    super(`Blob read timed out after ${timeout} ms`, timeout)
    this.name = 'BlobReadTimeout'
  }
}

// Writes the first and the last piece bytes of the blob at their real offsets into one sparse file
// of the full size: an mp4 keeps its moov atom at the end, the first frame is at the start.
// A blob of two pieces or less is read whole. One deadline for all the reads.
export async function readHeadTail (
  ctx: MeasureContext,
  storage: StorageAdapter,
  workspace: WorkspaceUuid,
  name: string,
  file: string,
  size: number,
  piece: number,
  timeout: number
): Promise<void> {
  const ranges =
    size <= piece * 2
      ? [{ offset: 0, length: size }]
      : [
          { offset: 0, length: piece },
          { offset: size - piece, length: piece }
        ]

  const handle = await open(file, 'w')
  try {
    await handle.truncate(size)
  } finally {
    await handle.close()
  }

  const signal = AbortSignal.timeout(timeout)
  const timedOut = (): Error => new BlobReadTimeout(timeout)
  const aborted = new Promise<never>((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(timedOut())
      },
      { once: true }
    )
  })
  // nobody awaits it when every read is done in time
  aborted.catch(() => undefined)

  for (const { offset, length } of ranges.filter((it) => it.length > 0)) {
    const opening = storage.partial(ctx, { uuid: workspace } as any, name, offset, length)
    // a body that opens after the deadline has no reader left
    void opening.then(
      (late) => {
        if (signal.aborted) late.destroy()
      },
      () => undefined
    )

    const stream = await Promise.race([opening, aborted])
    try {
      await pipeline(stream, createWriteStream(file, { flags: 'r+', start: offset }), { signal })
    } catch (err: any) {
      throw signal.aborted ? timedOut() : err
    }
  }
}
