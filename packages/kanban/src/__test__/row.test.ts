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

import type { IdMap, Ref } from '@hcengineering/core'
import { describe, expect, it, vi } from 'vitest'
import { createRowInteraction, hasHiddenCards, loadedCard, visibleCards, withoutCard } from '../row'
import type { DocWithRank, Item } from '../types'

const cards = Array.from({ length: 5 }, (_, index) => ({ _id: String(index) as Ref<Item> })) as Item[]

describe('row utility boundaries', () => {
  it.each([
    [0, ['4']],
    [1, ['0', '4']],
    [5, ['0', '1', '2', '3', '4']],
    [10, ['0', '1', '2', '3', '4']]
  ] as const)('includes the dragged card beyond limit %s once', (limit, expected) => {
    const visible = visibleCards(cards, limit, cards[4])
    expect(visible.map((card) => card._id)).toEqual(expected)
    expect(hasHiddenCards(cards, limit, cards[4])).toBe(limit < 4)
    expect(cards).toHaveLength(5)
  })

  it('uses the loaded document before the fallback drag reference', () => {
    const loaded: IdMap<DocWithRank> = new Map([[cards[0]._id, { ...cards[0], rank: 'new' }]])
    expect(loadedCard(cards[0]._id, loaded, cards[0])).toBe(loaded.get(cards[0]._id))
    expect(loadedCard(cards[1]._id, loaded, cards[1])).toBe(cards[1])
    expect(loadedCard(cards[2]._id, loaded, cards[1])).toBeUndefined()
  })

  it('removing an old card action never removes its replacement reference', () => {
    const interaction = createRowInteraction()
    const old = document.createElement('div')
    const next = document.createElement('div')
    const scrollOld = vi.fn()
    const scrollNext = vi.fn()
    old.scrollIntoView = scrollOld
    next.scrollIntoView = scrollNext
    const oldAction = interaction.cardElement(old, cards[0]._id)
    const nextAction = interaction.cardElement(next, cards[0]._id)
    oldAction.destroy()
    interaction.scroll(cards[0])
    expect(scrollNext).toHaveBeenCalledTimes(1)
    expect(scrollOld).not.toHaveBeenCalled()
    nextAction.destroy()
    interaction.scroll(cards[0])
    expect(scrollNext).toHaveBeenCalledTimes(1)
  })

  it.each([499, 500, 501])('suppresses a primary pointer click at %s ms', (duration) => {
    const interaction = createRowInteraction()
    const down = new PointerEvent('pointerdown', { button: 0 })
    Object.defineProperty(down, 'timeStamp', { value: 100 })
    interaction.pointerDown(down)
    const click = new MouseEvent('click', { button: 0, detail: 1, cancelable: true })
    Object.defineProperty(click, 'timeStamp', { value: 100 + duration })
    interaction.click(click)
    expect(click.defaultPrevented).toBe(duration >= 500)
  })

  it('leaves keyboard activation usable after a pointer drag', () => {
    const interaction = createRowInteraction()
    interaction.dragStart(new Event('dragstart') as DragEvent)
    const click = new MouseEvent('click', { detail: 0, cancelable: true })
    interaction.click(click)
    expect(click.defaultPrevented).toBe(false)
  })
  it('uses the complete wrapper and pointer offset for the native drag image', () => {
    const interaction = createRowInteraction()
    const wrapper = document.createElement('div')
    wrapper.getBoundingClientRect = () => new DOMRect(10, 20, 100, 100)
    const setDragImage = vi.fn()
    const event = new MouseEvent('dragstart', { clientX: 30, clientY: 40 })
    Object.defineProperty(event, 'dataTransfer', { value: { setDragImage } })
    wrapper.addEventListener('dragstart', (event) => {
      interaction.dragStart(event as DragEvent)
    })
    wrapper.dispatchEvent(event)
    expect(setDragImage).toHaveBeenCalledExactlyOnceWith(wrapper, 20, 20)
  })

  it('omits every preview occurrence by id while keeping the other object references', () => {
    expect(withoutCard([cards[0], cards[1], cards[0]], cards[0])).toEqual([cards[1]])
    expect(withoutCard(cards, undefined)).toEqual(cards)
    expect(withoutCard(cards, { _id: 'absent' } as unknown as Item)).toEqual(cards)
  })
})
