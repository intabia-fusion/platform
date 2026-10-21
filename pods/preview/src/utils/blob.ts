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
import { type Readable } from 'stream'
import { pipeline } from 'stream/promises'

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
