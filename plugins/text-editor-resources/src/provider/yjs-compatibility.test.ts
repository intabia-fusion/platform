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

import { jsonToPmNode, markupToJSON } from '@hcengineering/text'
import { prosemirrorToYXmlFragment as writeTiptap, yDocToProsemirrorJSON as readTiptap } from '@tiptap/y-tiptap'
import { prosemirrorToYXmlFragment as writeYjs, yDocToProsemirrorJSON as readYjs } from 'y-prosemirror'
import { Doc } from 'yjs'

it('preserves documents between Yjs and Tiptap converters', () => {
  const doc = jsonToPmNode(
    markupToJSON(
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello","marks":[{"type":"bold"}]}]}]}'
    )
  )
  const oldDocument = new Doc()
  const newDocument = new Doc()
  writeYjs(doc, oldDocument.getXmlFragment('content'))
  writeTiptap(doc, newDocument.getXmlFragment('content'))
  expect(
    doc.type.schema
      .nodeFromJSON(readTiptap(oldDocument, 'content'))
      .eq(doc.type.schema.nodeFromJSON(readYjs(oldDocument, 'content')))
  ).toBe(true)
  expect(
    doc.type.schema
      .nodeFromJSON(readYjs(newDocument, 'content'))
      .eq(doc.type.schema.nodeFromJSON(readTiptap(newDocument, 'content')))
  ).toBe(true)
})
