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

import { Fragment, Schema, Slice } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'

import { hasStoredImage, unwrapImageOnlySlice } from '../imageDisplay'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    mention: { group: 'inline', inline: true, atom: true },
    image: {
      group: 'inline',
      inline: true,
      atom: true,
      attrs: { display: { default: null }, 'file-id': { default: null } }
    }
  }
})

const p = (...content: any[]): any => schema.node('paragraph', null, content)
const img = (fileId: string | null = 'file-1'): any => schema.node('image', { 'file-id': fileId })

// what the browser makes of a copied block image: `<p></p><div><img></div><p></p>`
const blockImageSlice = new Slice(Fragment.from([p(), p(img()), p()]), 0, 0)

function pasteInMiddle (slice: Slice): EditorState {
  const doc = schema.node('doc', null, [p(schema.text('hello world'))])
  let state = EditorState.create({ doc })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7))) // after "hello "
  const tr = state.tr.replaceSelection(slice).setMeta('uiEvent', 'paste')
  const next = state.apply(tr)
  return next
}

describe('unwrapImageOnlySlice', () => {
  it('preserves a separate paragraph containing an inline atom', () => {
    const slice = new Slice(Fragment.from([p(schema.node('mention')), p(img())]), 0, 0)
    expect(unwrapImageOnlySlice(slice)).toBe(slice)
  })
  it('keeps the paragraph whole when an image-only slice is pasted mid-line', () => {
    const state = pasteInMiddle(unwrapImageOnlySlice(blockImageSlice))

    expect(state.doc.childCount).toBe(1)
    const para = state.doc.firstChild
    expect(para?.textContent).toBe('hello world')
    expect(para?.child(1).type.name).toBe('image')
  })

  it('reproduces the split without the fix', () => {
    expect(pasteInMiddle(blockImageSlice).doc.childCount).toBeGreaterThan(1)
  })

  it('unwraps a single paragraph with several images', () => {
    const slice = unwrapImageOnlySlice(new Slice(Fragment.from([p(img(), schema.text(' '), img('file-2'))]), 0, 0))
    expect(slice.openStart).toBe(1)
    expect(slice.openEnd).toBe(1)
  })

  it('does not touch slices with text', () => {
    const slice = new Slice(Fragment.from([p(schema.text('caption'), img())]), 0, 0)
    expect(unwrapImageOnlySlice(slice)).toBe(slice)
  })

  it('does not touch slices with several non-empty paragraphs', () => {
    const slice = new Slice(Fragment.from([p(img()), p(img('file-2'))]), 0, 0)
    expect(unwrapImageOnlySlice(slice)).toBe(slice)
  })

  it('does not touch already inline slices', () => {
    const slice = new Slice(Fragment.from(img()), 0, 0)
    expect(unwrapImageOnlySlice(slice)).toBe(slice)
  })
})

describe('hasStoredImage', () => {
  it('detects an image dragged from the editor', () => {
    expect(hasStoredImage(new Slice(Fragment.from(p(img())), 1, 1))).toBe(true)
    expect(hasStoredImage(blockImageSlice)).toBe(true)
  })

  it('ignores external images and text', () => {
    expect(hasStoredImage(new Slice(Fragment.from(p(img(null))), 1, 1))).toBe(false)
    expect(hasStoredImage(new Slice(Fragment.from(p(schema.text('x'))), 1, 1))).toBe(false)
    expect(hasStoredImage(Slice.empty)).toBe(false)
  })
})
