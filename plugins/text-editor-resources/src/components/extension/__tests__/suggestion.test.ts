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

import type { Editor } from '@tiptap/core'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import Suggestion, { SuggestionPluginKey } from '../suggestion'

it('activates a mention when a transaction inserts the trigger', () => {
  const schema = new Schema({ nodes: { doc: { content: 'paragraph+' }, paragraph: { content: 'text*' }, text: {} } })
  const editor = { isEditable: true, view: { composing: false } } as unknown as Editor
  const state = EditorState.create({ schema, plugins: [Suggestion({ editor })] })
  const updated = state.apply(state.tr.insertText('@Dirak'))

  expect(SuggestionPluginKey.getState(updated)).toMatchObject({ active: true, query: 'Dirak' })
})
