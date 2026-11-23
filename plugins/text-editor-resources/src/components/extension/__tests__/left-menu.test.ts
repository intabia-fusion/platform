/** @jest-environment jsdom */

//
// Copyright © 2026 TraceX SAS.
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

import { Editor } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { showPopup } from '@hcengineering/ui'
import { LeftMenuExtension } from '../leftMenu'

jest.mock('@hcengineering/platform', () => ({ getMetadata: jest.fn() }))
jest.mock('@hcengineering/ui', () => ({
  SelectPopup: {},
  getEventPositionElement: jest.fn(),
  showPopup: jest.fn()
}))

describe('left menu insertion target', () => {
  let editor: Editor
  const handleSelect = jest.fn(async () => {})

  beforeEach(() => {
    jest.clearAllMocks()
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        StarterKit,
        LeftMenuExtension.configure({
          width: 20,
          height: 20,
          marginX: 8,
          className: 'left-menu',
          items: [],
          handleSelect
        })
      ],
      content: '<p>first</p><p>second</p>'
    })
  })

  afterEach(() => {
    editor.destroy()
  })

  function openMenu (): void {
    const menu = editor.view.dom.parentElement?.querySelector('.left-menu')
    if (menu === null || menu === undefined) throw new Error('Left menu was not mounted')
    menu.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  }

  it('captures the target before the popup can affect hit testing', async () => {
    const pos = editor.state.doc.child(0).nodeSize
    const hitTest = jest.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: pos + 1, inside: pos })
    openMenu()
    const onClose = jest.mocked(showPopup).mock.calls[0][3]
    hitTest.mockReturnValue(null)
    await onClose?.('mermaid')
    expect(hitTest).toHaveBeenCalledTimes(1)
    expect(handleSelect).toHaveBeenCalledWith('mermaid', pos, expect.any(MouseEvent))
  })

  it('does not substitute the document start when hit testing fails', () => {
    jest.spyOn(editor.view, 'posAtCoords').mockReturnValue(null)
    openMenu()
    expect(showPopup).not.toHaveBeenCalled()
    expect(handleSelect).not.toHaveBeenCalled()
  })

  it('does not execute a command when the popup is cancelled', async () => {
    jest.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 1, inside: 0 })
    openMenu()
    await jest.mocked(showPopup).mock.calls[0][3]?.(undefined)
    expect(handleSelect).not.toHaveBeenCalled()
  })
})
