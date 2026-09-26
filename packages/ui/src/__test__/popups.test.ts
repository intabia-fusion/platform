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

import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modalStore } from '../modals'
import { closePopup, dockStore, pin, popupstore, showPopup, unpin, type CompAndProps } from '../popups'

const Comp = {} as any

function open (props: any = {}, options?: any, onClose?: (r: any) => void): ReturnType<typeof showPopup> {
  return showPopup(Comp, props, undefined, onClose, undefined, options ?? { category: 'popup', overlay: true })
}

describe('popups', () => {
  beforeEach(() => {
    modalStore.set([])
    localStorage.clear()
  })

  it('adds a popup to the store and hands back a handle', () => {
    const result = open({ a: 1 })
    const popups = get(popupstore)
    expect(popups).toHaveLength(1)
    expect(popups[0].id).toBe(result.id)
    expect(popups[0].props).toEqual({ a: 1 })
    expect(popups[0].options.category).toBe('popup')
  })

  it('keeps tooltips out of popupstore', () => {
    modalStore.set([{ label: 'tip' } as any])
    open()
    expect(get(modalStore)).toHaveLength(2)
    expect(get(popupstore)).toHaveLength(1)
  })

  it('replaces a popup opened again under the same id', () => {
    open({ a: 1 }, { category: 'popup', overlay: true, id: 'same' })
    open({ a: 2 }, { category: 'popup', overlay: true, id: 'same' })
    const popups = get(popupstore)
    expect(popups).toHaveLength(1)
    expect(popups[0].props).toEqual({ a: 2 })
  })

  it('closes by handle', () => {
    const first = open()
    open()
    first.close()
    expect(get(popupstore).map((p) => p.id)).toEqual([expect.not.stringMatching(first.id)])
  })

  it('closes the topmost popup and calls its onClose', () => {
    const onClose = vi.fn()
    open({}, undefined, vi.fn())
    const second = open({}, undefined, onClose)

    closePopup()
    expect(onClose).toHaveBeenCalledWith(undefined)
    expect(get(popupstore).map((p) => p.id)).not.toContain(second.id)
    expect(get(popupstore)).toHaveLength(1)
  })

  it('leaves a fixed popup where it is and closes the one under it', () => {
    const fixed = open({}, { category: 'popup', overlay: true, fixed: true })
    const plain = open()

    closePopup()
    const left = get(popupstore).map((p) => p.id)
    expect(left).toContain(fixed.id)
    expect(left).not.toContain(plain.id)

    // Nothing left but the fixed one, so another close is a no-op rather than a removal.
    closePopup()
    expect(get(popupstore).map((p) => p.id)).toEqual([fixed.id])
  })

  it('closes every popup of a category at once', () => {
    open({}, { category: 'menu', overlay: true })
    open({}, { category: 'menu', overlay: true })
    const other = open({}, { category: 'dialog', overlay: true })

    closePopup('menu')
    expect(get(popupstore).map((p) => p.id)).toEqual([other.id])
  })

  // Tooltips share modalStore with popups; closing a category must not take them with it.
  it('keeps non-popup modals when closing a category', () => {
    modalStore.set([{ label: 'tip' } as any])
    open({}, { category: 'menu', overlay: true })

    closePopup('menu')
    expect(get(popupstore)).toHaveLength(0)
    expect(get(modalStore)).toHaveLength(1)
  })

  it('routes an update through the popup own update hook', () => {
    const result = open({ a: 1 })
    const update = vi.fn()
    modalStore.update((modals) => {
      ;(modals[0] as CompAndProps).update = update
      return modals
    })

    result.update({ a: 2 })
    expect(update).toHaveBeenCalledWith({ a: 2 })
  })

  it('ignores an update for an id that is gone', () => {
    const result = open()
    result.close()
    expect(() => {
      result.update({ a: 2 })
    }).not.toThrow()
  })

  it('docks a popup whose refId is the pinned one, and only the first of them', () => {
    localStorage.setItem('dock-popup', 'ref-1')
    const docked = open({}, { category: 'popup', overlay: true, refId: 'ref-1' })
    const second = open({}, { category: 'popup', overlay: true, refId: 'ref-1' })

    expect(get(dockStore)?.id).toBe(docked.id)
    expect(get(popupstore).find((p) => p.id === second.id)?.dock).toBeUndefined()
  })

  it('leaves a popup undocked when its refId is not the pinned one', () => {
    localStorage.setItem('dock-popup', 'ref-1')
    open({}, { category: 'popup', overlay: true, refId: 'ref-2' })
    expect(get(dockStore)).toBeUndefined()
  })

  // pin() takes a popup id and remembers that popup's refId, not the refId itself.
  it('pins one popup by id and remembers its refId', () => {
    const other = open({}, { category: 'popup', overlay: true, refId: 'ref-2' })
    const target = open({}, { category: 'popup', overlay: true, refId: 'ref-1' })

    pin(target.id)
    expect(localStorage.getItem('dock-popup')).toBe('ref-1')
    expect(get(dockStore)?.id).toBe(target.id)
    expect(get(popupstore).find((p) => p.id === other.id)?.dock).toBe(false)

    unpin()
    expect(localStorage.getItem('dock-popup')).toBeNull()
    expect(get(dockStore)).toBeUndefined()
  })

  it('leaves the remembered ref alone when the pinned popup has none', () => {
    const target = open()
    pin(target.id)
    expect(localStorage.getItem('dock-popup')).toBeNull()
    expect(get(dockStore)?.id).toBe(target.id)
  })

  it('blurs a non-editable anchor, and leaves a text field focused', () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    open()
    expect(document.activeElement).not.toBe(button)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    open()
    expect(document.activeElement).toBe(input)

    button.remove()
    input.remove()
  })
})
