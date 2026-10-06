//
// Copyright © 2026 Intabia Fusion
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type { Blob, Ref } from '@hcengineering/core'
import { Schema, Slice, Fragment } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

import { setPlatformStatus } from '@hcengineering/platform'
import { rejectDataImages, replaceDataImages } from '../imageUpload'

jest.mock('@hcengineering/platform', () => ({
  ...jest.requireActual('@hcengineering/platform'),
  setPlatformStatus: jest.fn()
}))
jest.mock('@hcengineering/text-editor', () => ({ status: { ImagePasteNotSupported: 'ImagePasteNotSupported' } }))
jest.mock('@hcengineering/presentation', () => ({ getImageSize: jest.fn(), imageSizeToRatio: jest.fn() }))
jest.mock('../../imageExt', () => ({ loadingImageSrc: 'data:image/svg+xml;base64,PHN2Zy8+' }))

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    image: { group: 'inline', inline: true, attrs: { src: { default: null }, 'file-id': { default: null } } }
  }
})

describe('replaceDataImages', () => {
  it('keeps base64 out of the pasted slice and swaps the placeholder for the uploaded file', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    const pasted = new Slice(
      Fragment.from(
        schema.nodes.paragraph.create(null, [schema.text('a'), schema.nodes.image.create({ src: dataUrl })])
      ),
      0,
      0
    )
    let uploaded: File | undefined
    const view: any = {
      isDestroyed: false,
      state: EditorState.create({ schema }),
      dispatch (tr: any) {
        view.state = view.state.apply(tr)
      }
    }
    const attachFile = async (file: File): Promise<{ file: Ref<Blob>, type: string }> => {
      uploaded = file
      return { file: 'blob-1' as Ref<Blob>, type: file.type }
    }

    const result = replaceDataImages(view as EditorView, pasted, attachFile, (id) => `url/${id}`)
    expect(result).toBeDefined()
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, result?.content ?? Fragment.empty))
    expect(JSON.stringify(view.state.doc.toJSON())).not.toContain('iVBORw0KGgo=')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(uploaded?.type).toBe('image/png')
    const image = view.state.doc.firstChild.child(1)
    expect(image.attrs['file-id']).toBe('blob-1')
    expect(image.attrs.src).toBe('url/blob-1')
  })

  it('returns undefined when the slice has no data images', () => {
    const view: any = { state: EditorState.create({ schema }) }
    const pasted = new Slice(Fragment.from(schema.nodes.paragraph.create(null, schema.text('a'))), 0, 0)
    expect(
      replaceDataImages(
        view,
        pasted,
        async () => undefined,
        (id) => id
      )
    ).toBeUndefined()
  })

  it('rejects a paste with data images when there is nowhere to upload', () => {
    const image = schema.nodes.image.create({ src: 'data:image/png;base64,iVBORw0KGgo=' })
    const withImage = new Slice(Fragment.from(schema.nodes.paragraph.create(null, image)), 0, 0)
    const plain = new Slice(Fragment.from(schema.nodes.paragraph.create(null, schema.text('a'))), 0, 0)
    expect(rejectDataImages(plain)).toBe(false)
    expect(setPlatformStatus).not.toHaveBeenCalled()
    expect(rejectDataImages(withImage)).toBe(true)
    expect(setPlatformStatus).toHaveBeenCalledTimes(1)
  })
})
