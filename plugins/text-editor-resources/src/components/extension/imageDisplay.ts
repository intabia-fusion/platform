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
import { Fragment, type Node, Slice } from '@tiptap/pm/model'

function containsImage (node: Node): boolean {
  let found = false
  node.forEach((child) => {
    if (child.type.name === 'image') found = true
  })
  return found
}

function isBlankText (node: Node): boolean {
  return node.isText && (node.text ?? '').trim() === ''
}

/**
 * A pasted/dropped slice that holds only images (e.g. `<p></p><div><img></div><p></p>`, which is what the
 * browser makes of a copied block image, or `<p><img></p>` from external apps) is turned into an open slice,
 * so the images merge into the paragraph at the cursor instead of splitting it.
 * @public
 */
export function unwrapImageOnlySlice (slice: Slice): Slice {
  if (slice.content.childCount === 0 || slice.content.firstChild?.isInline === true) return slice

  const blocks: Node[] = []
  slice.content.forEach((node) => {
    let blank = node.isTextblock
    node.forEach((child) => {
      if (!isBlankText(child)) blank = false
    })
    if (!blank) blocks.push(node)
  })
  if (blocks.length !== 1) return slice

  const block = blocks[0]
  if (!block.isTextblock || !containsImage(block)) return slice

  let onlyImages = true
  block.forEach((child) => {
    if (child.type.name !== 'image' && !isBlankText(child)) onlyImages = false
  })
  if (!onlyImages) return slice

  return new Slice(Fragment.from(block), 1, 1)
}

/**
 * True if the slice contains an already stored image (one with a `file-id`), i.e. the image is dragged
 * from an editor rather than from outside. Such drops must be left to ProseMirror: some environments
 * (Electron) also put the dragged `<img>` into `dataTransfer.files`, and uploading it again duplicates the image.
 * @public
 */
export function hasStoredImage (slice: Slice): boolean {
  let found = false
  slice.content.descendants((node) => {
    if (found) return false
    if (node.type.name === 'image' && node.attrs['file-id'] != null) found = true
    return !found
  })
  return found
}
