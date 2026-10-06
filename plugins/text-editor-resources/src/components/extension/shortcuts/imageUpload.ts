//
// Copyright © 2023, 2024 Hardcore Engineering Inc.
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
import { Severity, Status, setPlatformStatus, unknownError } from '@hcengineering/platform'
import textEditor from '@hcengineering/text-editor'
import { imageSizeToRatio, getImageSize } from '@hcengineering/presentation'
import { Extension } from '@tiptap/core'
import { Fragment, type Node, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import { type EditorView } from '@tiptap/pm/view'

import { type FileAttachFunction } from '../types'
import { loadingImageSrc } from '../imageExt'
import { generateId, type Blob, type Ref } from '@hcengineering/core'

/**
 * @public
 */
export interface ImageUploadExtensionOptions {
  attachFile?: FileAttachFunction
  getFileUrl: (fileId: Ref<Blob>) => string
}

/**
 * @public
 */
export const ImageUploadExtension = Extension.create<ImageUploadExtensionOptions>({
  name: 'image-upload',

  addOptions () {
    return {
      getFileUrl: () => ''
    }
  },

  addProseMirrorPlugins () {
    const attachFile = this.options.attachFile
    const getFileUrl = this.options.getFileUrl

    function handleDrop (
      view: EditorView,
      pos: { pos: number, inside: number } | null,
      dataTransfer: DataTransfer
    ): any {
      const uris = (dataTransfer.getData('text/uri-list') ?? '').split('\r\n').filter((it) => !it.startsWith('#'))
      let result = false
      for (const uri of uris) {
        if (uri !== '') {
          const url = new URL(uri)
          // TODO datalake support
          const _file = (url.searchParams.get('file') ?? '').split('/').join('')

          if (_file.trim().length === 0) {
            continue
          }

          const ctype = dataTransfer.getData('application/contentType')
          if (ctype.startsWith('image/')) {
            const node = view.state.schema.nodes.image.create({
              'file-id': _file,
              src: getFileUrl(_file as Ref<Blob>)
            })
            const transaction = view.state.tr.insert(pos?.pos ?? 0, node)
            view.dispatch(transaction)
            result = true
          }
        }
      }
      if (result) {
        return result
      }

      const files = dataTransfer?.files
      if (files !== undefined && attachFile !== undefined) {
        for (let i = 0; i < files.length; i++) {
          const file = files.item(i)
          if (file?.type.startsWith('image/') === true) {
            result = true
            void handleImageUpload(file, view, pos, attachFile, getFileUrl)
          }
        }
      }
      return result
    }

    return [
      new Plugin({
        key: new PluginKey('handle-image-paste'),
        props: {
          handlePaste (view, event, slice) {
            const dataTransfer = event.clipboardData
            if (dataTransfer !== null) {
              const res = handleDrop(view, { pos: view.state.selection.$from.pos, inside: 0 }, dataTransfer)
              if (res === true) {
                event.preventDefault()
                event.stopPropagation()
                return res
              }
            }
            if (attachFile === undefined) return rejectDataImages(slice)
            const pasted = replaceDataImages(view, slice, attachFile, getFileUrl)
            if (pasted === undefined) return false
            view.dispatch(view.state.tr.replaceSelection(pasted).scrollIntoView().setMeta('uiEvent', 'paste'))
            return true
          },
          handleDrop (view, event, slice, moved) {
            const dataTransfer = event.dataTransfer
            if (dataTransfer !== null) {
              const res = handleDrop(view, view.posAtCoords({ left: event.x, top: event.y }), dataTransfer)
              if (res === true) {
                event.preventDefault()
                event.stopPropagation()
                return res
              }
            }
            if (moved) return false
            if (attachFile === undefined) return rejectDataImages(slice)
            const mouse = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (mouse === null) return false
            const dropped = replaceDataImages(view, slice, attachFile, getFileUrl)
            if (dropped === undefined) return false
            event.preventDefault()
            const pos = dropPoint(view.state.doc, mouse.pos, dropped) ?? mouse.pos
            view.dispatch(view.state.tr.replaceRange(pos, pos, dropped).setMeta('uiEvent', 'drop'))
            return true
          }
        }
      })
    ]
  }
})

async function handleImageUpload (
  file: File,
  view: EditorView,
  pos: { pos: number, inside: number } | null,
  attachFile: FileAttachFunction,
  getFileUrl: (fileId: Ref<Blob>) => string
): Promise<void> {
  const attached = await attachFile(file)

  if (attached === undefined) {
    return
  }

  if (!attached.type.includes('image')) {
    return
  }

  try {
    const url = getFileUrl(attached.file)
    const size = await getImageSize(file)
    const node = view.state.schema.nodes.image.create({
      'file-id': attached.file,
      'data-file-type': file.type,
      src: url,
      alt: file.name,
      title: file.name,
      width: imageSizeToRatio(size.width, size.pixelRatio)
    })

    const transaction = view.state.tr.insert(pos?.pos ?? 0, node)

    view.dispatch(transaction)
  } catch (e) {
    void setPlatformStatus(unknownError(e))
  }
}

function isDataImage (node: Node): boolean {
  return node.type.name === 'image' && node.attrs['file-id'] == null && String(node.attrs.src ?? '').startsWith('data:')
}

// Without attachFile there is nowhere to upload to, and base64 must not get into the ydoc.
export function rejectDataImages (slice: Slice): boolean {
  let found = false
  slice.content.descendants((node) => {
    found = found || isDataImage(node)
    return !found
  })
  if (found) {
    void setPlatformStatus(
      new Status(Severity.ERROR, textEditor.status.ImagePasteNotSupported, {}, undefined, { timeout: 10000 })
    )
  }
  return found
}

// Inline data: images from pasted HTML must not reach the ydoc: swap them for placeholders and upload the files.
export function replaceDataImages (
  view: EditorView,
  slice: Slice,
  attachFile: FileAttachFunction,
  getFileUrl: (fileId: Ref<Blob>) => string
): Slice | undefined {
  const uploads: Array<{ placeholder: string, dataUrl: string }> = []
  const replace = (fragment: Fragment): Fragment => {
    const nodes: Node[] = []
    fragment.forEach((child) => {
      if (isDataImage(child)) {
        const placeholder = `${loadingImageSrc}#${generateId()}`
        uploads.push({ placeholder, dataUrl: child.attrs.src })
        nodes.push(child.type.create({ ...child.attrs, src: placeholder }, null, child.marks))
      } else {
        nodes.push(child.isLeaf ? child : child.copy(replace(child.content)))
      }
    })
    return Fragment.fromArray(nodes)
  }
  const content = replace(slice.content)
  if (uploads.length === 0) return undefined
  for (const { placeholder, dataUrl } of uploads) {
    void uploadDataImage(view, placeholder, dataUrl, attachFile, getFileUrl)
  }
  return new Slice(content, slice.openStart, slice.openEnd)
}

async function uploadDataImage (
  view: EditorView,
  placeholder: string,
  dataUrl: string,
  attachFile: FileAttachFunction,
  getFileUrl: (fileId: Ref<Blob>) => string
): Promise<void> {
  let attrs: Record<string, any> | undefined
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `image.${blob.type.split('/')[1] ?? 'png'}`, { type: blob.type })
    const attached = await attachFile(file)
    if (attached !== undefined) {
      attrs = { 'file-id': attached.file, 'data-file-type': blob.type, src: getFileUrl(attached.file) }
    }
  } catch (e) {
    void setPlatformStatus(unknownError(e))
  }
  // Positions are useless after a remote ydoc update, so find the placeholder by its unique src.
  if (view.isDestroyed) return
  const tr = view.state.tr
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' || node.attrs.src !== placeholder) return
    const from = tr.mapping.map(pos)
    if (attrs === undefined) {
      tr.delete(from, tr.mapping.map(pos + node.nodeSize))
    } else {
      tr.setNodeMarkup(from, undefined, { ...node.attrs, ...attrs })
    }
  })
  if (tr.docChanged) view.dispatch(tr)
}
