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

import { getResource } from '@hcengineering/platform'
import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { modalStore } from '../modals'
import { closePopup, dockStore, pin, popupstore, showPopup, unpin, updatePopup, type CompAndProps } from '../popups'

vi.mock('@hcengineering/platform', async (importOriginal) => {
  const platform = await importOriginal<typeof import('@hcengineering/platform')>()
  return { ...platform, getResource: vi.fn(platform.getResource) }
})

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

  describe('focus of the control that opened it', () => {
    function button (): HTMLButtonElement {
      const element = document.createElement('button')
      document.body.appendChild(element)
      element.focus()
      return element
    }

    it('is taken off while the popup is open and given back on close', async () => {
      const anchor = button()
      const popup = open()
      expect(document.activeElement).not.toBe(anchor)
      popup.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(anchor)
      anchor.remove()
    })

    it('comes back after closePopup too', async () => {
      const anchor = button()
      open()
      closePopup()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(anchor)
      anchor.remove()
    })

    it('stays where the user moved it', async () => {
      const anchor = button()
      const popup = open()
      const other = document.createElement('input')
      document.body.appendChild(other)
      other.focus()
      popup.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(other)
      anchor.remove()
      other.remove()
    })

    it('stays off the control while a popup opened after it is still open', async () => {
      const anchor = button()
      const menu = open()
      const confirm = open()
      menu.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).not.toBe(anchor)
      confirm.close()
      anchor.remove()
    })

    it('comes back to the control under a nested popup when the nested one closes', async () => {
      const anchor = button()
      const parent = open()
      const inner = document.createElement('button')
      document.body.appendChild(inner)
      inner.focus()
      const child = open()
      child.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(inner)
      inner.remove()
      parent.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(anchor)
      anchor.remove()
    })

    it('carries the control over when a popup is reopened under the same id', async () => {
      const anchor = button()
      open({}, { category: 'popup', overlay: true, id: 'again' })
      const inside = document.createElement('button')
      document.body.appendChild(inside)
      inside.focus()
      const again = open({}, { category: 'popup', overlay: true, id: 'again' })
      inside.remove()
      again.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(anchor)
      anchor.remove()
    })

    it('does not come back to a removed control or on a replaced popup', async () => {
      const anchor = button()
      open({}, { category: 'popup', overlay: true, id: 'same' })
      open({}, { category: 'popup', overlay: true, id: 'same' })
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).not.toBe(anchor)
      const second = button()
      const popup = open()
      second.remove()
      popup.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(document.body)
      anchor.remove()
    })
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

  // Owners (MenuButton, Dropdown…) reset their open state in onClose, so a category close must call it too.
  it('gives the focus back after a category close', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    anchor.focus()
    open({}, { category: 'menu', overlay: true })
    closePopup('menu')
    await new Promise((resolve) => setTimeout(resolve))
    expect(document.activeElement).toBe(anchor)
    anchor.remove()
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

  it('routes an update to its popup when a tooltip comes first in modalStore', () => {
    modalStore.set([{ label: 'tip' } as any])
    const first = open()
    const second = open()
    const updates: Record<string, any[]> = { [first.id]: [], [second.id]: [] }
    modalStore.update((modals) => {
      for (const m of modals) {
        if (m.type === 'popup') m.update = (props) => updates[m.id].push(props)
      }
      return modals
    })

    updatePopup(first.id, { props: { a: 1 } })
    expect(updates[first.id]).toEqual([{ a: 1 }])
    expect(updates[second.id]).toEqual([])
  })

  describe('a popup by resource id', () => {
    function deferred (): { promise: Promise<any>, resolve: (value: any) => void } {
      let resolve: (value: any) => void = () => {}
      const promise = new Promise<any>((_resolve) => {
        resolve = _resolve
      })
      return { promise, resolve }
    }

    it('shows up once its component is loaded', async () => {
      const load = deferred()
      vi.mocked(getResource).mockReturnValueOnce(load.promise)
      showPopup('ui:component:Test' as any, {})
      expect(get(popupstore)).toHaveLength(0)
      load.resolve(Comp)
      await load.promise
      await Promise.resolve()
      expect(get(popupstore)).toHaveLength(1)
    })

    it('never shows up when closed before loading, and gives the focus back', async () => {
      const load = deferred()
      vi.mocked(getResource).mockReturnValueOnce(load.promise)
      const anchor = document.createElement('button')
      document.body.appendChild(anchor)
      anchor.focus()
      const popup = showPopup('ui:component:Test' as any, {})
      popup.close()
      load.resolve(Comp)
      await load.promise
      await new Promise((resolve) => setTimeout(resolve))
      expect(get(popupstore)).toHaveLength(0)
      expect(document.activeElement).toBe(anchor)

      // Its order is gone too, so a later popup gives the focus back to its own control.
      const plain = open()
      plain.close()
      await new Promise((resolve) => setTimeout(resolve))
      expect(document.activeElement).toBe(anchor)
      anchor.remove()
    })
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
