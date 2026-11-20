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

import { copyText } from '../actionImpl'

let mockSafari = false

jest.mock('@hcengineering/contact', () => ({}))
jest.mock('@hcengineering/converter', () => ({}))
jest.mock('@hcengineering/text', () => ({ markupToJSON: (it: any) => it }))
jest.mock('@hcengineering/text-markdown', () => ({ markupToMarkdown: (it: any) => String(it) }))
jest.mock('@hcengineering/workbench', () => ({}))
jest.mock('@hcengineering/ui', () => ({
  isSafari: () => mockSafari,
  showPopup: jest.fn(),
  showPanel: jest.fn(),
  navigate: jest.fn(),
  closeTooltip: jest.fn(),
  locationToUrl: jest.fn(),
  isPopupPosAlignment: jest.fn(),
  AlertBox: {},
  Button: {},
  Icon: {},
  themeStore: {},
  default: { icon: {}, string: {} }
}))
jest.mock('@hcengineering/presentation', () => ({
  getClient: jest.fn(),
  getMarkup: jest.fn(),
  copyTextToClipboardOldBrowser: jest.fn(),
  hasResource: jest.fn(),
  updateAttribute: jest.fn(),
  contextStore: { subscribe: () => () => {} },
  MessageBox: {}
}))
jest.mock('../plugin', () => ({
  __esModule: true,
  default: { string: {}, icon: {}, actionImpl: {} }
}))
jest.mock('../selection', () => ({
  focusStore: { subscribe: () => () => {} },
  selectionStore: { subscribe: () => () => {} },
  selectionLimit: 1000
}))
jest.mock('../utils', () => ({
  deleteObjects: jest.fn(),
  getObjectId: jest.fn(),
  getObjectLinkFragment: jest.fn(),
  openDocInSidebar: jest.fn(),
  restrictionStore: { subscribe: () => () => {} }
}))
jest.mock('../viewletContextStore', () => ({ viewletContextStore: { getLastContext: () => undefined } }))

describe('copyText', () => {
  const write = jest.fn(async (_items: any[]) => {})
  const writeText = jest.fn(async (_text: string) => {})
  let items: Record<string, any> = {}

  beforeAll(() => {
    ;(globalThis as any).navigator = { clipboard: { write, writeText } }
    ;(globalThis as any).ClipboardItem = class {
      constructor (readonly data: Record<string, any>) {
        items = data
      }
    }
  })

  beforeEach(() => {
    mockSafari = false
    items = {}
    write.mockClear()
    writeText.mockClear()
  })

  // The markup of a document is read over the network: awaiting it before the write drops the user
  // activation, and the browser then refuses the copy - it "works" only when the read is fast.
  it('writes a pending value through ClipboardItem, keeping the user gesture', async () => {
    let resolve: (it: string) => void = () => {}
    const pending = new Promise<string>((_resolve) => (resolve = _resolve))

    const copying = copyText(pending)
    // The write has to be under way before the text exists, otherwise the gesture is already gone.
    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()

    resolve('# Title')
    await expect(items['text/plain']).resolves.toBe('# Title')
    await expect(copying).resolves.toBe(true)
  })

  // Chromium retains the page after reload for every ClipboardItem write, so a ready string does not
  // need one.
  it('writes a ready string with writeText', async () => {
    await expect(copyText('# Title')).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledWith('# Title')
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps ClipboardItem in Safari even for a ready string', async () => {
    mockSafari = true

    await expect(copyText('# Title')).resolves.toBe(true)

    expect(write).toHaveBeenCalledTimes(1)
    expect(writeText).not.toHaveBeenCalled()
  })

  // The result is what the caller reports to the user: a refused write and a text that never arrived
  // both mean the clipboard still holds the previous value.
  it('reports a refused write as a failure', async () => {
    const oldBrowser = jest.requireMock('@hcengineering/presentation').copyTextToClipboardOldBrowser as jest.Mock
    oldBrowser.mockReturnValue(false)
    write.mockRejectedValue(new Error('NotAllowedError'))
    writeText.mockRejectedValue(new Error('NotAllowedError'))

    await expect(copyText('# Title')).resolves.toBe(false)

    expect(oldBrowser).toHaveBeenCalledWith('# Title')
  })

  it('reports a text that never arrives as a failure', async () => {
    const pending = Promise.reject(new Error('offline'))

    await expect(copyText(pending)).resolves.toBe(false)
  })
})
