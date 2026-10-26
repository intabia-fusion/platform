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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LeaveOwner from './stubs/LeaveOwner.svelte'

const { mockUploadFile, mockAddNotification } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockAddNotification: vi.fn()
}))

vi.mock('@hcengineering/presentation', async () => {
  const { writable } = await import('svelte/store')
  class DraftController {
    static remove (): void {}
    save (): void {}
    remove (): void {}
  }
  return {
    DraftController,
    draftsStore: writable({}),
    canDisplayLinkPreview: () => false,
    isLinkPreviewEnabled: () => false,
    fetchLinkPreviewDetails: vi.fn(),
    createQuery: () => ({ query: vi.fn(), unsubscribe: vi.fn() }),
    getClient: () => ({}),
    uploadFile: async (...args: any[]) => await mockUploadFile(...args),
    deleteFile: vi.fn(async () => {}),
    generateFileId: () => 'file1',
    getContentType: (_name: string, type: string) => type
  }
})
vi.mock('@hcengineering/platform', async (original) => ({
  ...(await original<typeof import('@hcengineering/platform')>()),
  translate: async (id: string, params: Record<string, any>) => `${id} ${JSON.stringify(params)}`
}))
vi.mock('@hcengineering/text-editor-resources', async () => ({
  ReferenceInput: (await import('./stubs/Empty.svelte')).default
}))
vi.mock('../components/file/AttachmentTile.svelte', async () => await import('./stubs/Empty.svelte'))
vi.mock('@hcengineering/text', () => ({
  EmptyMarkup: '',
  extractLinks: () => [],
  isEmptyMarkup: (markup: string | undefined) => markup == null || markup === '',
  markupToJSON: () => ({})
}))
vi.mock('@hcengineering/text-editor', () => ({ default: { string: {}, icon: {} } }))
vi.mock('@hcengineering/ui', () => ({
  default: { string: {}, icon: {} },
  addNotification: mockAddNotification,
  NotificationSeverity: { Info: 0, Warning: 2 }
}))
vi.mock('@hcengineering/uploader', () => ({ default: { string: {} }, getUploadHandlers: () => [] }))
vi.mock('@hcengineering/view-resources', () => ({ SimpleNotification: {} }))
vi.mock('@hcengineering/view', () => ({}))
vi.mock('../utils', () => ({ compareAsInMessage: () => 0 }))

// jsdom has no object URLs; the queue makes one for each picture's preview.
Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} })

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

function dropFiles (target: Element, files: File[]): void {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files } })
  target.dispatchEvent(event)
}

describe('AttachmentRefInput leaving', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockUploadFile.mockReset()
    mockAddNotification.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // The chat saves its draft from onLeave: the count must hold a file done behind a slower one,
  // whichever of the owner and the input is destroyed first (Svelte 4 and 5 differ).
  it('reports the files it keeps when its owner is destroyed', async () => {
    mockUploadFile.mockReturnValueOnce(new Promise(() => {}))
    mockUploadFile.mockResolvedValueOnce({ uuid: 'blob-b', metadata: {} })
    const events: string[] = []
    const owner = new LeaveOwner({ target: document.body, props: { record: (e: string) => events.push(e) } })
    await settle()

    const drop = document.querySelector('.drop')
    expect(drop).not.toBeNull()
    dropFiles(drop as Element, [
      new File(['slow'], 'slow.mov', { type: 'video/quicktime' }),
      new File(['b'], 'b.png', { type: 'image/png' })
    ])
    await settle()

    owner.$destroy()
    await settle()

    expect(events.sort()).toEqual(['left with 1', 'owner destroyed'])
    // The file still going up is named; the stored one stays in the draft.
    expect(mockAddNotification).toHaveBeenCalledTimes(1)
    expect(mockAddNotification.mock.calls[0][1]).toContain('"names":"slow.mov"')
  })

  it('reports an empty input as empty', async () => {
    const events: string[] = []
    const owner = new LeaveOwner({ target: document.body, props: { record: (e: string) => events.push(e) } })
    await settle()

    owner.$destroy()

    expect(events.sort()).toEqual(['left with 0', 'owner destroyed'])
    expect(mockAddNotification).not.toHaveBeenCalled()
  })
})
