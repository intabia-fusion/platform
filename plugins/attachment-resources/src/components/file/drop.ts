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

interface DropFilesOptions {
  /** Off: the drag is left to whoever else listens. */
  enabled: boolean
  onFiles: (files: File[]) => void
  onDragging: (dragging: boolean) => void
}

function dragHasFiles (e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

export function droppedFiles (e: DragEvent): File[] {
  return Array.from(e.dataTransfer?.files ?? [])
}

/** The files picked in a hidden file input; it is cleared so the same file can be picked again. */
export function pickedFiles (input: HTMLInputElement): File[] {
  const files = Array.from(input.files ?? [])
  input.value = ''
  return files
}

export function dropFiles (
  node: HTMLElement,
  options: DropFilesOptions
): { update: (o: DropFilesOptions) => void, destroy: () => void } {
  let current = options

  const over = (e: DragEvent): void => {
    if (!current.enabled || !dragHasFiles(e)) return
    e.preventDefault()
    current.onDragging(true)
  }
  const leave = (e: DragEvent): void => {
    if (!(e.relatedTarget instanceof Node && node.contains(e.relatedTarget))) current.onDragging(false)
  }
  const drop = (e: DragEvent): void => {
    current.onDragging(false)
    if (!current.enabled || !dragHasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    current.onFiles(droppedFiles(e))
  }

  node.addEventListener('dragover', over)
  node.addEventListener('dragleave', leave)
  node.addEventListener('drop', drop)

  return {
    update (o) {
      current = o
    },
    destroy () {
      node.removeEventListener('dragover', over)
      node.removeEventListener('dragleave', leave)
      node.removeEventListener('drop', drop)
    }
  }
}
