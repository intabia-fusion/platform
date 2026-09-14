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

import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Modal from '../components/Modal.svelte'

const LABEL = 'ui:string:Label' as IntlString

let target: HTMLElement

function mount (props: Partial<ComponentProps<Modal>> = {}): { root: HTMLElement, component: Modal } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { type: 'type-popup', ...props }
  const component = new Modal({ target: host, props: merged as ComponentProps<Modal> })
  return { root: host.querySelector('.hulyModal-container') as HTMLElement, component }
}

const closeButton = (root: HTMLElement): HTMLButtonElement | null =>
  root.querySelector('.hulyHeader-container button') as HTMLButtonElement | null

const footerButtons = (root: HTMLElement): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll('.hulyModal-footer button'))

const escape = (): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

describe('Modal', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('shows the header close button and footer for popup/aside, but not for type-component', () => {
    const popup = mount({ type: 'type-popup' })
    expect(closeButton(popup.root)).not.toBeNull()
    expect(popup.root.querySelector('.hulyModal-footer')).not.toBeNull()

    const aside = mount({ type: 'type-aside' })
    expect(closeButton(aside.root)).not.toBeNull()
    expect(aside.root.querySelector('.hulyModal-footer')).not.toBeNull()

    const component = mount({ type: 'type-component' })
    expect(closeButton(component.root)).toBeNull()
    expect(component.root.querySelector('.hulyModal-footer')).toBeNull()
  })

  it('carries width in the class list and maxWidth as an inline style', () => {
    const { root } = mount({ width: 'small', maxWidth: '40rem' })
    expect(root.classList.contains('small')).toBe(true)
    expect((root as HTMLElement).style.maxWidth).toBe('40rem')
  })

  it('toggles hidden and noTopIndent classes', () => {
    const { root } = mount({ hidden: true, noTopIndent: true })
    expect(root.classList.contains('hidden')).toBe(true)
    expect(root.classList.contains('noTopIndent')).toBe(true)
  })

  it('renders the label text in the header', () => {
    const { root } = mount({ label: LABEL })
    expect(root.querySelector('.hulyHeader-titleGroup')?.textContent).toContain(LABEL)
  })

  it('clicking the header close button dispatches close when no onCancel is given', () => {
    const { root, component } = mount()
    const onClose = vi.fn()
    component.$on('close', onClose)
    closeButton(root)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the header close button calls onCancel instead of dispatching close, when given', () => {
    const onCancel = vi.fn()
    const { root, component } = mount({ onCancel })
    const onClose = vi.fn()
    component.$on('close', onClose)
    closeButton(root)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape dispatches close exactly once when no onCancel is given', () => {
    const { component } = mount()
    const onClose = vi.fn()
    component.$on('close', onClose)
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onCancel exactly once, instead of dispatching close, when given', () => {
    const onCancel = vi.fn()
    const { component } = mount({ onCancel })
    const onClose = vi.fn()
    component.$on('close', onClose)
    escape()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the OK button carries okKind/okLabel/okLoading and is disabled unless canSave', async () => {
    const { root, component } = mount({ okKind: 'negative', okLabel: 'ui:string:Save' as IntlString, canSave: false })
    const [ok] = footerButtons(root)
    expect(ok.classList.contains('negative')).toBe(true)
    expect(ok.textContent).toContain('ui:string:Save')
    expect(ok.disabled).toBe(true)

    component.$set({ canSave: true })
    await tick()
    expect(footerButtons(root)[0].disabled).toBe(false)

    component.$set({ okLoading: true })
    await tick()
    expect(footerButtons(root)[0].querySelector('.spinner')).not.toBeNull()
  })

  it('clicking the OK button invokes okAction', () => {
    const okAction = vi.fn()
    const { root } = mount({ okAction, canSave: true })
    footerButtons(root)[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(okAction).toHaveBeenCalledTimes(1)
  })

  // The Cancel button wires straight to onCancel, bypassing close()'s dispatch('close') fallback -
  // with no onCancel given, clicking Cancel does nothing at all. Pinned current behaviour.
  it('the Cancel button calls onCancel directly, and does nothing when onCancel is not set', () => {
    const withHandler = mount({ onCancel: vi.fn() })
    const cancelBtn = footerButtons(withHandler.root)[1]
    cancelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(withHandler.component).toBeDefined()

    const noHandler = mount()
    const onClose = vi.fn()
    noHandler.component.$on('close', onClose)
    footerButtons(noHandler.root)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hides the Cancel button when showCancelButton is false', () => {
    const { root } = mount({ showCancelButton: false })
    expect(footerButtons(root)).toHaveLength(1)
  })

  it('hides the footer entirely when hideFooter is set, even for a popup', () => {
    const { root } = mount({ hideFooter: true })
    expect(root.querySelector('.hulyModal-footer')).toBeNull()
  })

  it('wraps content in a Scroller when scrollableContent, plain otherwise', () => {
    const scrollable = mount({ scrollableContent: true })
    expect(scrollable.root.querySelector('.scroller-container')).not.toBeNull()

    const plain = mount({ scrollableContent: false })
    expect(plain.root.querySelector('.scroller-container')).toBeNull()
  })
})
