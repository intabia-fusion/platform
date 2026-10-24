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

import type { Class, Doc, Ref, Space } from '@hcengineering/core'
import { UploadQueue, draftAttachment } from '../components/file/uploads'

const mockUploadFile = jest.fn()

// Hoisted above the imports by Jest - it can't parse Svelte syntax otherwise.
jest.mock(
  '@hcengineering/presentation',
  () => ({
    uploadFile: async (...args: any[]) => await mockUploadFile(...args),
    deleteFile: jest.fn(async () => {}),
    getContentType: (_name: string, type: string) => type
  }),
  { virtual: true }
)
jest.mock('@hcengineering/ui', () => ({ string: { UploadFailed: 'ui:string:UploadFailed' } }), { virtual: true })
jest.mock('@hcengineering/uploader', () => ({ string: { StorageLimitReached: 'uploader:string:Limit' } }), {
  virtual: true
})
jest.mock('../plugin', () => ({ class: { Attachment: 'attachment:class:Attachment' } }), { virtual: true })

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
    const { stored, lost } = queue.flush()

    expect(stored).toEqual([expect.objectContaining({ name: 'b.txt', file: 'blob-b' })])
    expect(lost).toEqual(['a.txt'])
    expect(queue.size).toBe(0)
  })
})
