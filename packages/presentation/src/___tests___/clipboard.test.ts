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

import { copyTextToClipboard } from '../utils'

let mockSafari = false
jest.mock('svelte', () => ({ onDestroy: () => {} }))
jest.mock('svelte/store', () => {
  const writable = (): any => ({ set: () => {}, update: () => {}, subscribe: () => () => {} })
  return { writable, get: () => undefined, derived: writable, readable: writable }
})
jest.mock('@hcengineering/ui', () => ({
  getRawCurrentLocation: () => ({ path: [] }),
  workspaceId: undefined,
  isSafari: () => mockSafari
}))
jest.mock('@hcengineering/query', () => ({ LiveQuery: jest.fn() }))

describe('copyTextToClipboard', () => {
  const write = jest.fn(async () => {})
  const writeText = jest.fn(async () => {})

  beforeAll(() => {
    ;(globalThis as any).navigator = { clipboard: { write, writeText } }
    ;(globalThis as any).ClipboardItem = class {
      constructor (readonly items: Record<string, Promise<string>>) {}
    }
  })

  beforeEach(() => {
    write.mockClear()
    writeText.mockClear()
  })

  it('uses writeText outside Safari, so Chromium keeps no ClipboardItem writer', async () => {
    mockSafari = false
    await copyTextToClipboard(Promise.resolve('a'))
    expect(writeText).toHaveBeenCalledWith('a')
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps ClipboardItem with a promise in Safari', async () => {
    mockSafari = true
    await copyTextToClipboard('b')
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()
  })
})
