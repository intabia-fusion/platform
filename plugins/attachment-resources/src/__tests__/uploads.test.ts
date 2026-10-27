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

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Attachment } from '@hcengineering/attachment'
import type { Class, Doc, Ref, Space } from '@hcengineering/core'
import { UploadQueue, draftAttachment, keepStored } from '../components/file/uploads'

const { mockUploadFile } = vi.hoisted(() => ({ mockUploadFile: vi.fn() }))

// Hoisted above the imports: keeps the platform's heavy modules out of a pure test.
vi.mock('@hcengineering/presentation', () => ({
  uploadFile: async (...args: any[]) => await mockUploadFile(...args),
  deleteFile: vi.fn(async () => {}),
  getContentType: (_name: string, type: string) => type
}))
vi.mock('@hcengineering/ui', () => ({ default: { string: { UploadFailed: 'ui:string:UploadFailed' } } }))
vi.mock('@hcengineering/uploader', () => ({ default: { string: { StorageLimitReached: 'uploader:string:Limit' } } }))
vi.mock('../plugin', () => ({ default: { class: { Attachment: 'attachment:class:Attachment' } } }))

const target = {
  space: 'space1' as Ref<Space>,
  objectId: 'issue1' as Ref<Doc>,
  _class: 'tracker:class:Issue' as Ref<Class<Doc>>
}

function add (queue: UploadQueue, name: string): void {
  const file = new File(['x'], name, { type: 'text/plain' })
  queue.add(draftAttachment(target, name, file), file)
}

describe('UploadQueue.flush', () => {
  beforeEach(() => {
    mockUploadFile.mockReset()
  })

  // Create waits for settled(): a file failing meanwhile must reach the user, not vanish.
  it('names the files it drops along with the stored ones', async () => {
    mockUploadFile.mockRejectedValueOnce(new Error('network'))
    mockUploadFile.mockResolvedValueOnce({ uuid: 'blob-b', metadata: {} })
    const queue = new UploadQueue(
      () => {},
      () => {}
    )
    add(queue, 'a.txt')
    // Stored, but waits behind the failed head until flush.
    add(queue, 'b.txt')

    await queue.settled()
    const { stored, lost, failed } = queue.flush()

    expect(stored).toEqual([expect.objectContaining({ name: 'b.txt', file: 'blob-b' })])
    expect(failed).toEqual(['a.txt'])
    expect(lost).toEqual([])
    expect(queue.size).toBe(0)
  })
})

describe('keepStored', () => {
  beforeEach(() => {
    mockUploadFile.mockReset()
  })

  // Leaving a chat: a file done behind a slower one was never handed to the input, it joins the draft now.
  it('moves stored files into the message and names those still going up', async () => {
    let finishSlow: (v: any) => void = () => {}
    mockUploadFile.mockReturnValueOnce(new Promise((resolve) => (finishSlow = resolve)))
    mockUploadFile.mockResolvedValueOnce({ uuid: 'blob-b', metadata: {} })
    const promoted = vi.fn()
    const queue = new UploadQueue(() => {}, promoted)
    add(queue, 'slow.mov')
    add(queue, 'b.png')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(promoted).not.toHaveBeenCalled()

    const attachments = new Map<Ref<Attachment>, Attachment>()
    const added = new Set<Ref<Attachment>>()
    const lost = keepStored(queue, attachments, added)

    expect(Array.from(attachments.values()).map((a) => a.name)).toEqual(['b.png'])
    expect(Array.from(added)).toEqual(Array.from(attachments.keys()))
    expect(lost).toEqual(['slow.mov'])
    expect(queue.size).toBe(0)
    finishSlow({ uuid: 'blob-slow', metadata: {} })
  })

  // A failed file showed its failure on the tile: only one still going up vanishes unseen.
  it('leaves failed files out of the names it returns', async () => {
    mockUploadFile.mockRejectedValueOnce(new Error('network'))
    mockUploadFile.mockReturnValueOnce(new Promise(() => {}))
    const queue = new UploadQueue(
      () => {},
      () => {}
    )
    add(queue, 'failed.txt')
    add(queue, 'going.txt')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(keepStored(queue, new Map(), new Set())).toEqual(['going.txt'])
  })
})
