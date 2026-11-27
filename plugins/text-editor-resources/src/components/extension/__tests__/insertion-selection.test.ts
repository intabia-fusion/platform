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

import { Editor, Node, type Command } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { insertEditableBlock, saveInsertionSelection } from '../insertion-selection'

const Mermaid = Node.create({
  name: 'mermaid',
  group: 'block',
  content: 'text*',
  renderHTML: () => ['pre', 0]
})
const DrawingBoard = Node.create({
  name: 'drawingBoard',
  group: 'block',
  atom: true,
  renderHTML: () => ['div']
})
const Image = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ id: { default: null } }),
  renderHTML: ({ HTMLAttributes }) => ['img', HTMLAttributes]
})

function createEditor (): Editor {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      TableKit,
      TaskList.extend({ name: 'todoList' }).configure({ itemTypeName: 'todoItem' }),
      TaskItem.extend({ name: 'todoItem' }).configure({ taskListTypeName: 'todoList' }),
      Mermaid,
      DrawingBoard,
      Image
    ],
    content: '<p>first</p><p>second</p><p>third</p>'
  })
}

describe('saved insertion selection', () => {
  let editor: Editor

  beforeEach(() => {
    editor = createEditor()
  })

  afterEach(() => {
    editor.destroy()
  })

  const insertions: Array<[string, (editor: Editor, restore: Command) => void]> = [
    [
      'mermaid',
      (editor, restore) => {
        editor
          .chain()
          .command(restore)
          .command(insertEditableBlock({ type: 'mermaid' }))
          .run()
      }
    ],
    [
      'codeBlock',
      (editor, restore) => {
        editor
          .chain()
          .command(restore)
          .command(insertEditableBlock({ type: 'codeBlock' }))
          .run()
      }
    ],
    [
      'horizontalRule',
      (editor, restore) => {
        editor.chain().command(restore).setHorizontalRule().run()
      }
    ],
    [
      'drawingBoard',
      (editor, restore) => {
        editor.chain().command(restore).insertContent({ type: 'drawingBoard' }).run()
      }
    ],
    [
      'todoList',
      (editor, restore) => {
        editor
          .chain()
          .command(restore)
          .command(
            insertEditableBlock({
              type: 'todoList',
              content: [{ type: 'todoItem', content: [{ type: 'paragraph' }] }]
            })
          )
          .run()
      }
    ],
    [
      'table',
      (editor, restore) => {
        editor.chain().command(restore).insertTable({ rows: 1, cols: 1 }).run()
      }
    ]
  ]

  it.each(insertions)('inserts %s at the saved block after the cursor moves', (name, insert) => {
    const pos = editor.state.doc.child(0).nodeSize
    const restore = saveInsertionSelection(editor, pos)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    insert(editor, restore)
    expect(editor.state.doc.child(0).textContent).toBe('first')
    expect(editor.state.doc.child(1).type.name).toBe(name)
    expect(editor.state.doc.child(2).textContent).toBe('second')
    expect(editor.state.doc.lastChild?.textContent).toBe('third')
  })

  it.each(insertions.filter(([name]) => ['mermaid', 'todoList', 'codeBlock'].includes(name)))(
    'places the cursor inside the inserted %s',
    (name, insert) => {
      const pos = editor.state.doc.child(0).nodeSize
      insert(editor, saveInsertionSelection(editor, pos))
      const { $from } = editor.state.selection
      const parents: string[] = []
      for (let depth = 1; depth <= $from.depth; depth++) {
        parents.push($from.node(depth).type.name)
      }
      expect(parents).toContain(name)
      editor.commands.insertContent('typed')
      expect(editor.state.doc.child(1).textContent).toBe('typed')
      expect(editor.state.doc.child(2).textContent).toBe('second')
    }
  )

  it.each(insertions.filter(([name]) => ['mermaid', 'todoList', 'codeBlock'].includes(name)))(
    'places the cursor inside %s when replacing an empty paragraph',
    (name, insert) => {
      editor.commands.setContent('<p></p>')
      insert(editor, saveInsertionSelection(editor, 0))
      expect(editor.state.doc.firstChild?.type.name).toBe(name)
      editor.commands.insertContent('typed')
      expect(editor.state.doc.firstChild?.textContent).toBe('typed')
    }
  )

  it('treats zero as an explicit insertion target', () => {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor
      .chain()
      .command(saveInsertionSelection(editor, 0))
      .command(insertEditableBlock({ type: 'mermaid' }))
      .run()
    expect(editor.state.doc.firstChild?.type.name).toBe('mermaid')
    expect(editor.state.doc.child(1).textContent).toBe('first')
    expect(editor.state.selection.$from.parent.type.name).toBe('mermaid')
  })

  it('restores a captured selection before replacing its content', () => {
    editor.commands.setTextSelection({ from: 2, to: 4 })
    const restore = saveInsertionSelection(editor)
    editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    editor.chain().command(restore).insertContent('X').run()
    expect(editor.state.doc.firstChild?.textContent).toBe('fXst')
    expect(editor.state.doc.lastChild?.textContent).toBe('third')
  })

  it('does not replace content when the document changed after saving a selection', () => {
    editor.commands.setTextSelection({ from: 2, to: 4 })
    const restore = saveInsertionSelection(editor)
    editor.commands.insertContentAt(1, 'new ')
    const changed = editor.getJSON()
    editor.chain().command(restore).insertContent('X').run()
    expect(editor.getJSON()).toEqual(changed)
  })

  it('does not replace an atomic block at the insertion target', () => {
    const pos = editor.state.doc.child(0).nodeSize
    editor.commands.insertContentAt(pos, { type: 'drawingBoard' })
    editor
      .chain()
      .command(saveInsertionSelection(editor, pos))
      .command(insertEditableBlock({ type: 'mermaid' }))
      .run()
    expect(editor.state.doc.child(1).type.name).toBe('mermaid')
    expect(editor.state.doc.child(2).type.name).toBe('drawingBoard')
    expect(editor.state.doc.child(3).textContent).toBe('second')
    expect(editor.state.selection.$from.parent.type.name).toBe('mermaid')
  })

  it('preserves the target while an image uploads and appends further images in order', async () => {
    let restore = saveInsertionSelection(editor, editor.state.doc.child(0).nodeSize)
    for (const id of ['a', 'b']) {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      await Promise.resolve()
      editor.chain().command(restore).insertContent({ type: 'image', attrs: { id } }).run()
      restore = saveInsertionSelection(editor)
    }
    const images: string[] = []
    editor.state.doc.child(1).forEach((node) => {
      if (node.type.name === 'image') images.push(node.attrs.id)
    })
    expect(images).toEqual(['a', 'b'])
    expect(editor.state.doc.firstChild?.textContent).toBe('first')
    expect(editor.state.doc.child(1).textContent).toBe('second')
    expect(editor.state.doc.lastChild?.textContent).toBe('third')
  })
})
