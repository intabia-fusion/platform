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

import type { Command, Editor, JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/**
 * Capture an insertion target before opening a popup or file picker. The returned command
 * restores it in the insertion transaction, without tracking intervening document changes.
 * An explicit position is a cursor target; omitting it preserves the current selection.
 */
export function saveInsertionSelection (editor: Editor, position?: number): Command {
  const bookmark = editor.state.selection.getBookmark()
  const document = editor.state.doc

  return ({ tr, dispatch }) => {
    if (dispatch === undefined) return true

    if (editor.state.doc !== document) {
      tr.setMeta('preventDispatch', true)
      return false
    }

    if (position === undefined) {
      tr.setSelection(bookmark.resolve(tr.doc))
      return true
    }

    const pos = Math.max(0, Math.min(position, tr.doc.content.size))
    const $pos = tr.doc.resolve(pos)

    // Provide a text cursor at block boundaries without selecting and replacing an atomic node.
    if (!$pos.parent.inlineContent && $pos.nodeAfter?.isTextblock !== true) {
      tr.insert(pos, editor.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    } else {
      tr.setSelection(TextSelection.near($pos))
    }
    return true
  }
}

/** Insert a single editable block and place the cursor in its first text block. */
export function insertEditableBlock (content: JSONContent): Command {
  return ({ commands, tr, dispatch }) => {
    const stepCount = tr.steps.length
    if (!commands.insertContent(content, { updateSelection: false })) return false
    if (dispatch === undefined || tr.steps.length === stepCount) return true

    // The replacement may also recreate the surrounding paragraph. Find the inserted
    // block inside the changed range rather than focusing at the replacement's end.
    const map = tr.mapping.maps[tr.steps.length - 1]
    let selection: TextSelection | undefined
    map.forEach((_from, _to, start, end) => {
      tr.doc.nodesBetween(start, end, (node, pos) => {
        if (selection !== undefined) return false
        if (node.type.name !== content.type || pos < start) return
        const cursor = TextSelection.findFrom(tr.doc.resolve(pos + 1), 1, true)
        if (cursor instanceof TextSelection && cursor.to < pos + node.nodeSize) {
          selection = cursor
        }
        return false
      })
    })
    if (selection !== undefined) tr.setSelection(selection)
    return true
  }
}
