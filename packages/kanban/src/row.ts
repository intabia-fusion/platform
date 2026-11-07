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

import type { Doc, IdMap, Ref } from '@hcengineering/core'
import type { DocWithRank, Item } from './types'

export function visibleCards (objects: Item[], limit: number, dragCard: Item | undefined): Item[] {
  return objects.filter((object, index) => index < limit || object._id === dragCard?._id)
}

export function hasHiddenCards (objects: Item[], limit: number, dragCard: Item | undefined): boolean {
  return objects.some((object, index) => index >= limit && object._id !== dragCard?._id)
}

export function loadedCard (id: Ref<Doc>, loaded: IdMap<DocWithRank>, dragCard: Item | undefined): Item | undefined {
  return loaded.get(id as Ref<DocWithRank>) ?? (id === dragCard?._id ? dragCard : undefined)
}

export interface RowInteraction {
  cardElement: (element: HTMLElement, id: Item['_id']) => { destroy: () => void }
  scroll: (item: Item) => void
  pointerDown: (event: PointerEvent) => void
  pointerCancel: () => void
  click: (event: MouseEvent) => void
  dragStart: (event: DragEvent) => void
}

export function createRowInteraction (): RowInteraction {
  let pointerStartedAt: number | undefined
  let draggedSincePointerDown = false
  const elements = new Map<Item['_id'], HTMLElement>()

  return {
    cardElement (element: HTMLElement, id: Item['_id']) {
      elements.set(id, element)
      return {
        destroy () {
          if (elements.get(id) === element) elements.delete(id)
        }
      }
    },
    scroll (item: Item): void {
      elements.get(item._id)?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    },
    pointerDown (event: PointerEvent): void {
      draggedSincePointerDown = false
      const interactive =
        event.target instanceof Element &&
        event.target.closest('button, input, textarea, select, [role="button"], [contenteditable="true"]') !== null
      pointerStartedAt = event.button === 0 && !interactive ? event.timeStamp : undefined
    },
    pointerCancel (): void {
      pointerStartedAt = undefined
    },
    click (event: MouseEvent): void {
      const suppress =
        event.detail !== 0 &&
        event.button === 0 &&
        (draggedSincePointerDown || (pointerStartedAt !== undefined && event.timeStamp - pointerStartedAt >= 500))
      pointerStartedAt = undefined
      draggedSincePointerDown = false
      if (suppress) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    dragStart (event: DragEvent): void {
      draggedSincePointerDown = true
      // Force native HTML5 drag image to be the whole card wrapper instead of the
      // narrow inner element (e.g. an anchor in the title) the user may have
      // grabbed onto.
      const target = event.currentTarget
      if (!(target instanceof HTMLElement) || event.dataTransfer === null) return
      const rect = target.getBoundingClientRect()
      event.dataTransfer.setDragImage(target, event.clientX - rect.left, event.clientY - rect.top)
    }
  }
}

export function withoutCard (objects: Item[], card: Item | undefined): Item[] {
  return objects.filter((object) => object._id !== card?._id)
}
