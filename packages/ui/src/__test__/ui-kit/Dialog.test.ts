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
import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Dialog from '../../ui-kit/dialog/Dialog.svelte'
import type { DialogProps } from '../../ui-kit/dialog/types'
import DialogWithSlots from './DialogWithSlots.svelte'

const LABEL = getEmbeddedLabel('New channel')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Dialog> = {}): { root: HTMLFormElement, component: Dialog } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Dialog({ target: host, props: { label: LABEL, ...props } })
  mounted.push(component)
  return { root: host.querySelector('.dialog') as HTMLFormElement, component }
}

function mountWithSlots (
  props: DialogProps = {},
  autofocusField = false
): { root: HTMLFormElement, component: DialogWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new DialogWithSlots({ target: host, props: { props: { label: LABEL, ...props }, autofocusField } })
  mounted.push(component)
  return { root: host.querySelector('.dialog') as HTMLFormElement, component }
}

function footerButtons (root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('.dialog__footer-actions button.button'))
}

function headerButtons (root: HTMLElement): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('.dialog__tools button.button'))
}

describe('ui-kit Dialog', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a large form dialog named by its title, with close, cancel and a brand submit', () => {
    const { root } = mount()
    expect(root.tagName).toBe('FORM')
    expect(root.getAttribute('role')).toBe('dialog')
    expect(root.classList.contains('dialog--large')).toBe(true)
    const title = root.querySelector(`#${root.getAttribute('aria-labelledby') ?? ''}`)
    expect(title?.textContent).toContain('New channel')
    expect(headerButtons(root)).toHaveLength(1)
    const [cancel, submit] = footerButtons(root)
    expect(cancel.classList.contains('button--secondary')).toBe(true)
    expect(submit.classList.contains('button--brand')).toBe(true)
    expect(submit.classList.contains('button--medium')).toBe(true)
    expect(submit.type).toBe('submit')
  })

  it('submits by the submit button, not while it cannot', async () => {
    const { root, component } = mount({ canSubmit: false })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const submit = footerButtons(root)[1]
    expect(submit.disabled).toBe(true)

    component.$set({ canSubmit: true })
    await tick()
    submit.click()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].detail).toBeNull()

    component.$set({ loading: true })
    await tick()
    expect(submit.disabled).toBe(true)
    expect(submit.getAttribute('aria-busy')).toBe('true')
  })

  it('ignores a plain button in the content, which submits the form', async () => {
    const { root, component } = mountWithSlots({ submitOnEnter: true })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const plain = document.createElement('button')
    plain.className = 'plain'
    root.querySelector('.dialog__content')?.appendChild(plain)

    plain.click()
    expect(onSubmit).not.toHaveBeenCalled()

    footerButtons(root).at(-1)?.click()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('submits by Enter in a field through the default button, not by a plain button before it', async () => {
    const { root, component } = mountWithSlots({ submitOnEnter: true })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const plain = document.createElement('button')
    root.querySelector('.dialog__content')?.appendChild(plain)

    // Implicit submission presses the first submit button of the form.
    const first = root.querySelector<HTMLButtonElement>('button[type="submit"]')
    expect(first?.classList.contains('dialog__enter')).toBe(true)
    first?.click()
    expect(onSubmit).toHaveBeenCalledTimes(1)

    component.$set({ props: { label: LABEL, submitOnEnter: true, canSubmit: false } })
    await tick()
    expect(root.querySelector<HTMLButtonElement>('.dialog__enter')?.disabled).toBe(true)
  })

  it('adds no hidden Enter button without submitOnEnter', () => {
    const { root } = mountWithSlots()
    expect(root.querySelector('.dialog__enter')).toBeNull()
  })

  it('keeps a disabled default button with submitOnEnter and hideSubmit, so Enter presses no button in the content', () => {
    const { root, component } = mountWithSlots({ submitOnEnter: true, hideSubmit: true })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const plain = document.createElement('button')
    const onPlain = vi.fn()
    plain.addEventListener('click', onPlain)
    root.querySelector('.dialog__content')?.appendChild(plain)

    // Implicit submission takes the first submit button and does nothing when it is disabled.
    const first = root.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')
    expect(first?.classList.contains('dialog__enter')).toBe(true)
    expect(first?.disabled).toBe(true)
    first?.click()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onPlain).not.toHaveBeenCalled()
  })

  it('stops Enter in a field unless submitOnEnter', async () => {
    const { root, component } = mountWithSlots()
    const field = root.querySelector('input.field') as HTMLInputElement
    const enter = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      field.dispatchEvent(event)
      return event
    }
    expect(enter().defaultPrevented).toBe(true)

    component.$set({ props: { label: LABEL, submitOnEnter: true } })
    await tick()
    expect(enter().defaultPrevented).toBe(false)
  })

  it('cancels and closes by the close and cancel buttons', () => {
    const { root, component } = mount()
    const events: string[] = []
    component.$on('cancel', () => events.push('cancel'))
    component.$on('close', () => events.push('close'))

    headerButtons(root)[0].click()
    footerButtons(root)[0].click()
    expect(events).toEqual(['cancel', 'close', 'cancel', 'close'])
  })

  it('stays open when cancel is prevented', () => {
    const { root, component } = mount()
    const onClose = vi.fn()
    component.$on('cancel', (event) => {
      event.preventDefault()
    })
    component.$on('close', onClose)

    footerButtons(root)[0].click()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cancels on Escape only with closeOnEscape', async () => {
    const { component } = mount()
    const onClose = vi.fn()
    component.$on('close', onClose)
    const escape = (): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    }

    escape()
    expect(onClose).not.toHaveBeenCalled()
    component.$set({ closeOnEscape: true })
    await tick()
    escape()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides the buttons, the footer and the close button on request', () => {
    const noCancel = mount({ hideCancel: true, submitLabel: getEmbeddedLabel('Create') })
    expect(footerButtons(noCancel.root).map((b) => b.textContent?.trim())).toEqual(['Create'])

    const noButtons = mount({ hideCancel: true, hideSubmit: true })
    expect(noButtons.root.querySelector('.dialog__footer')).toBeNull()

    const viewer = mount({ footer: false, closable: false })
    expect(viewer.root.querySelector('.dialog__footer')).toBeNull()
    expect(viewer.root.querySelector('.dialog__tools')).toBeNull()
  })

  it('toggles the full size and reports it', async () => {
    const { root, component } = mount({ allowFullSize: true, footer: false })
    const onFullSize = vi.fn()
    component.$on('fullsize', onFullSize)
    const [toggle] = headerButtons(root)
    await vi.waitFor(() => {
      expect(toggle.getAttribute('aria-label')).not.toBeNull()
    })
    const normalName = toggle.getAttribute('aria-label')

    toggle.click()
    await tick()
    expect(root.classList.contains('dialog--full-size')).toBe(true)
    await vi.waitFor(() => {
      expect(toggle.getAttribute('aria-label')).not.toBe(normalName)
    })
    expect(onFullSize.mock.calls.map(([event]) => event.detail)).toEqual([true])
  })

  it('takes width, padding, scrolling and embedded look', () => {
    const { root } = mount({ width: 'x-small', padding: 'none', scrollable: false, embedded: true })
    expect(root.classList.contains('dialog--x-small')).toBe(true)
    expect(root.classList.contains('dialog--embedded')).toBe(true)
    expect(root.getAttribute('role')).toBeNull()
    expect(root.querySelector('.dialog__body--padded')).toBeNull()
    expect(root.querySelector('.dialog__content--fixed')).not.toBeNull()
  })

  it('places the slots: title, header actions, footer start and extra footer buttons', () => {
    const { root } = mountWithSlots()
    expect(root.querySelector('.dialog__title .title-extra')).not.toBeNull()
    const tools = root.querySelector('.dialog__tools') as HTMLElement
    expect(tools.querySelector(':scope > .dialog__actions > .header-action')).not.toBeNull()
    // Own tools before the close button: a divider parts them, and the Escape hint stands next to the close.
    expect(tools.querySelector('.dialog__divider')).not.toBeNull()
    expect(tools.querySelector('.dialog__hotkey')?.textContent).toContain('Esc')
    expect(root.querySelector('.dialog__footer-start .hint')).not.toBeNull()
    const actions = Array.from((root.querySelector('.dialog__footer-actions') as HTMLElement).children)
    expect(actions.findIndex((el) => el.classList.contains('extra'))).toBe(1)
  })

  it('is a modal dialog with focus guards; embedded is neither', () => {
    const { root } = mount()
    expect(root.getAttribute('aria-modal')).toBe('true')
    expect(root.querySelectorAll('[data-focus-guard]')).toHaveLength(2)
    expect(root.firstElementChild?.hasAttribute('data-focus-guard')).toBe(true)
    expect(root.lastElementChild?.hasAttribute('data-focus-guard')).toBe(true)

    const embedded = mount({ embedded: true })
    expect(embedded.root.getAttribute('aria-modal')).toBeNull()
    expect(embedded.root.getAttribute('tabindex')).toBeNull()
    expect(embedded.root.querySelector('[data-focus-guard]')).toBeNull()
  })

  it('takes focus on open unless a field in it autofocuses', () => {
    const { root } = mount()
    expect(document.activeElement).toBe(root)

    const withField = mountWithSlots({}, true)
    expect(document.activeElement).toBe(withField.root.querySelector('input.field'))
  })

  it('keeps Tab inside: from the last control to the first and back, skipping disabled ones', () => {
    const { root } = mount({ canSubmit: false })
    const [startGuard, endGuard] = Array.from(root.querySelectorAll<HTMLElement>('[data-focus-guard]'))
    const close = headerButtons(root)[0]
    const cancel = footerButtons(root)[0]
    const outside = document.createElement('button')
    target.appendChild(outside)
    const reach = (guard: HTMLElement, from: HTMLElement): void => {
      guard.dispatchEvent(new FocusEvent('focus', { relatedTarget: from }))
    }

    reach(endGuard, cancel)
    expect(document.activeElement).toBe(close)
    reach(startGuard, close)
    expect(document.activeElement).toBe(cancel)
    reach(startGuard, outside)
    expect(document.activeElement).toBe(close)
    reach(endGuard, outside)
    expect(document.activeElement).toBe(cancel)
    reach(startGuard, root)
    expect(document.activeElement).toBe(close)
  })

  it('gives focus back to the opener on close, unless focus has moved on', () => {
    const opener = document.createElement('input')
    target.appendChild(opener)
    opener.focus()
    const first = mount()
    expect(document.activeElement).toBe(first.root)
    first.component.$destroy()
    expect(document.activeElement).toBe(opener)

    const second = mount()
    const elsewhere = document.createElement('button')
    target.appendChild(elsewhere)
    elsewhere.focus()
    second.component.$destroy()
    expect(document.activeElement).toBe(elsewhere)
  })

  it('answers canClose of the popup host with a cancelable cancel and no close', () => {
    const { component } = mount()
    const events: string[] = []
    let keep = false
    component.$on('cancel', (event) => {
      events.push('cancel')
      if (keep) event.preventDefault()
    })
    component.$on('close', () => events.push('close'))

    expect(component.canClose()).toBe(true)
    keep = true
    expect(component.canClose()).toBe(false)
    expect(events).toEqual(['cancel', 'cancel'])
  })

  it('leaves Escape to a picker opened from the dialog and to a handled event', () => {
    const { component } = mount({ closeOnEscape: true })
    const onCancel = vi.fn()
    component.$on('cancel', onCancel)
    const picker = document.createElement('div')
    picker.className = 'popup'
    const search = document.createElement('input')
    picker.appendChild(search)
    target.appendChild(picker)

    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    handled.preventDefault()
    window.dispatchEvent(handled)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('passes id and data attributes to the form', () => {
    const { root } = mount({ id: 'create-channel', 'data-testid': 'dialog' })
    expect(root.id).toBe('create-channel')
    expect(root.dataset.testid).toBe('dialog')
  })
})
