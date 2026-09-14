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
import ModernDialog from '../components/ModernDialog.svelte'

const LABEL = 'ui:string:Label' as IntlString

let target: HTMLElement

function mount (props: Record<string, unknown> = {}): { root: HTMLElement, component: ModernDialog } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernDialog({ target: host, props: { label: LABEL, ...props } })
  return { root: host.firstElementChild as HTMLElement, component }
}

describe('ModernDialog', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a form when isForm, and a div otherwise', () => {
    expect(mount({ isForm: true }).root.tagName).toBe('FORM')
    expect(mount({ isForm: false }).root.tagName).toBe('DIV')
  })

  it('carries shadow, embedded and width in the root element', () => {
    const { root } = mount({ shadow: true, embedded: true, width: '30rem' })
    expect(root.classList.contains('shadow')).toBe(true)
    expect(root.classList.contains('embedded')).toBe(true)
    expect((root as HTMLElement).style.width).toBe('30rem')
  })

  it('shows the back button only when hasBack, and dispatches back on click', () => {
    const withBack = mount({ hasBack: true })
    const backButton = withBack.root.querySelector('.back button') as HTMLButtonElement
    expect(backButton).not.toBeNull()
    const onBack = vi.fn()
    withBack.component.$on('back', onBack)
    backButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onBack).toHaveBeenCalledTimes(1)

    const withoutBack = mount({ hasBack: false })
    expect(withoutBack.root.querySelector('.back')).toBeNull()
  })

  it('shows the close button unless embedded, and dispatches close on click', () => {
    const { root, component } = mount({ embedded: false })
    const closeButton = root.querySelector('.header button') as HTMLButtonElement
    expect(closeButton).not.toBeNull()
    const onClose = vi.fn()
    component.$on('close', onClose)
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const embedded = mount({ embedded: true })
    expect(embedded.root.querySelector('.header button')).toBeNull()
  })

  it('wraps content in a Scroller when scrollableContent, plain div otherwise', () => {
    const scrollable = mount({ scrollableContent: true })
    expect(scrollable.root.querySelector('.scroller-container')).not.toBeNull()
    expect(scrollable.root.querySelector('.content')).not.toBeNull()

    const plain = mount({ scrollableContent: false })
    expect(plain.root.querySelector('.scroller-container')).toBeNull()
    expect(plain.root.querySelector('.content')).not.toBeNull()
  })

  it('renders the top/bottom padding spacers unless noContentPadding', () => {
    const padded = mount({ scrollableContent: false })
    expect(padded.root.querySelector('.htPadding')).not.toBeNull()
    expect(padded.root.querySelector('.hbPadding')).not.toBeNull()
    expect(padded.root.querySelector('.content')?.classList.contains('noPadding')).toBe(false)

    const noPadding = mount({ scrollableContent: false, noContentPadding: true })
    expect(noPadding.root.querySelector('.htPadding')).toBeNull()
    expect(noPadding.root.querySelector('.hbPadding')).toBeNull()
    expect(noPadding.root.querySelector('.content')?.classList.contains('noPadding')).toBe(true)
  })

  it('hides the footer when withoutFooter and no footer slots are used', () => {
    const { root } = mount({ withoutFooter: true })
    expect(root.querySelector('.footer')).toBeNull()
  })

  it('shows the footer by default, with a border unless isFooterBorderHidden', () => {
    const bordered = mount()
    expect(bordered.root.querySelector('.footer')?.classList.contains('footerWithBorder')).toBe(true)

    const borderless = mount({ isFooterBorderHidden: true })
    expect(borderless.root.querySelector('.footer')?.classList.contains('footerWithBorder')).toBe(false)
  })

  it('hides the submit button when hideSubmit, and disables it unless canSubmit', () => {
    const hidden = mount({ hideSubmit: true })
    expect(hidden.root.querySelectorAll('.footerButtons button')).toHaveLength(1)

    const disabled = mount({ canSubmit: false })
    const buttons = disabled.root.querySelectorAll('.footerButtons button')
    expect(buttons).toHaveLength(2)
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true)

    const enabled = mount({ canSubmit: true })
    expect((enabled.root.querySelectorAll('.footerButtons button')[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('dispatches submit when the submit button is clicked', () => {
    const { root, component } = mount({ canSubmit: true })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const submitButton = root.querySelectorAll('.footerButtons button')[1] as HTMLButtonElement
    submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('dispatches cancel and close together when shouldCloseOnCancel', () => {
    const { root, component } = mount({ shouldCloseOnCancel: true })
    const onCancel = vi.fn()
    const onClose = vi.fn()
    component.$on('cancel', onCancel)
    component.$on('close', onClose)
    const cancelButton = root.querySelectorAll('.footerButtons button')[0] as HTMLButtonElement
    cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('dispatches cancel without close when shouldCloseOnCancel is off', () => {
    const { root, component } = mount({ shouldCloseOnCancel: false })
    const onCancel = vi.fn()
    const onClose = vi.fn()
    component.$on('cancel', onCancel)
    component.$on('close', onClose)
    const cancelButton = root.querySelectorAll('.footerButtons button')[0] as HTMLButtonElement
    cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('submits on form submit only when isForm and shouldSubmitOnEnter are both set', async () => {
    const on = mount({ isForm: true, shouldSubmitOnEnter: true })
    const onSubmitOn = vi.fn()
    on.component.$on('submit', onSubmitOn)
    on.root.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    expect(onSubmitOn).toHaveBeenCalledTimes(1)

    // isForm false renders a div, which never fires a submit event, so shouldSubmitOnEnter is moot there.
    const off = mount({ isForm: true, shouldSubmitOnEnter: false })
    const onSubmitOff = vi.fn()
    off.component.$on('submit', onSubmitOff)
    off.root.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await tick()
    expect(onSubmitOff).not.toHaveBeenCalled()
  })

  it('passes loading down to both footer buttons', () => {
    const { root } = mount({ loading: true, canSubmit: true })
    const buttons = root.querySelectorAll('.footerButtons button')
    expect(buttons[0].querySelector('.spinner')).not.toBeNull()
    expect(buttons[1].querySelector('.spinner')).not.toBeNull()
  })
})
