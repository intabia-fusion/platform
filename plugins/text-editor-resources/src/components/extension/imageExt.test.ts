/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 */

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

import { Editor, Extension, Node } from '@tiptap/core'
import { ImageExtension } from './imageExt'
import { LoadingStatePlugin } from './toolbar/toolbar'

jest.mock('@hcengineering/presentation', () => ({ getBlobRef: jest.fn(), getFileUrl: jest.fn() }))
jest.mock('@hcengineering/ui', () => ({}))
jest.mock('@hcengineering/text-editor', () => ({}))
jest.mock('./toolbar/EditorToolbar.svelte', () => ({}), { virtual: true })
jest.mock('../node-view', () => ({}))

it('starts image loading after the node view is created', async () => {
  Object.defineProperty(HTMLImageElement.prototype, 'decode', {
    configurable: true,
    value: async () => await new Promise(() => {})
  })
  const editor = new Editor({
    extensions: [
      Node.create({ name: 'doc', topNode: true, content: 'paragraph+' }),
      Node.create({ name: 'paragraph', group: 'block', content: 'inline*', renderHTML: () => ['p', 0] }),
      Node.create({ name: 'text', group: 'inline' }),
      ImageExtension,
      Extension.create({ addProseMirrorPlugins: () => [LoadingStatePlugin()] })
    ],
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'image.png' } }] }]
    }
  })
  const loadingTransactions: boolean[] = []
  editor.on('transaction', ({ transaction }) => {
    if (transaction.getMeta('loadingState') !== undefined) loadingTransactions.push(transaction.getMeta('loadingState'))
  })
  editor.commands.setContent({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'other.png' } }] }]
  })
  expect(loadingTransactions).toEqual([])
  await Promise.resolve()
  expect(loadingTransactions).toEqual([true])
  editor.destroy()
})
