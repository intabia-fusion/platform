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
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { WizardDialogProps } from '../../ui-kit/wizard-dialog/types'
import WizardDialogWithFooter from './WizardDialogWithFooter.svelte'

const STEPS = [
  { id: 'file', label: getEmbeddedLabel('Select file') },
  { id: 'review', label: getEmbeddedLabel('Review') },
  { id: 'import', label: getEmbeddedLabel('Import') }
]

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: Partial<WizardDialogProps> = {}): { root: HTMLElement, component: WizardDialogWithFooter } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new WizardDialogWithFooter({
    target: host,
    props: {
      props: { label: getEmbeddedLabel('Import'), steps: STEPS, submitLabel: getEmbeddedLabel('Run'), ...props }
    }
  })
  mounted.push(component)
  return { root: host.querySelector('.dialog') as HTMLElement, component }
}

function buttons (root: HTMLElement, part: 'start' | 'actions'): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll(`.dialog__footer-${part} button.button`))
}

function current (root: HTMLElement): string | undefined {
  return root.querySelector('[aria-current="step"]')?.textContent?.replace(/\s+/g, ' ').trim()
}

describe('ui-kit WizardDialog', () => {
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

  it('starts on the first step: steps aside, Next only, no cancel', () => {
    const { root } = mount()
    expect(root.classList.contains('dialog--x-large')).toBe(true)
    expect(current(root)).toBe('1. Select file')
    expect(buttons(root, 'start')).toHaveLength(0)
    const [next] = buttons(root, 'actions')
    expect(buttons(root, 'actions')).toHaveLength(1)
    expect(next.classList.contains('button--brand')).toBe(true)
    expect(root.querySelector('.dialog__footer-start .message')).not.toBeNull()
    expect(root.querySelector('.step-body')).not.toBeNull()
  })

  it('goes forward and back, reporting the step', async () => {
    const { root, component } = mount()
    const onSelect = vi.fn()
    component.$on('select', onSelect)

    buttons(root, 'actions')[0].click()
    await tick()
    expect(current(root)).toBe('2. Review')
    const [back] = buttons(root, 'start')
    expect(back.classList.contains('button--secondary')).toBe(true)

    back.click()
    await tick()
    expect(current(root)).toBe('1. Select file')
    expect(onSelect.mock.calls.map(([event]) => event.detail)).toEqual(['review', 'file'])
  })

  it('keeps the step when select is prevented', async () => {
    const { root, component } = mount()
    component.$on('select', (event) => {
      event.preventDefault()
    })

    buttons(root, 'actions')[0].click()
    await tick()
    expect(current(root)).toBe('1. Select file')
  })

  it('blocks Next until the step can proceed', () => {
    const { root } = mount({ canProceed: false })
    expect(buttons(root, 'actions')[0].disabled).toBe(true)
  })

  it('submits by a positive button on the last step', async () => {
    const { root, component } = mount({ selected: 'import', canSubmit: false })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const [submit] = buttons(root, 'actions')
    expect(submit.classList.contains('button--positive')).toBe(true)
    expect(submit.textContent?.trim()).toBe('Run')
    expect(submit.disabled).toBe(true)

    component.$set({ props: { label: getEmbeddedLabel('Import'), steps: STEPS, selected: 'import', canSubmit: true } })
    await tick()
    submit.click()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps the navigation on the left and the submit on the right with earlySubmit', async () => {
    const { root, component } = mount({ earlySubmit: true, canSubmit: false, selected: 'review' })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    const [back, next] = buttons(root, 'start')
    expect(buttons(root, 'start')).toHaveLength(2)
    expect(back.classList.contains('button--secondary')).toBe(true)
    expect(next.classList.contains('button--brand')).toBe(true)
    // The footerStart slot of the place follows the navigation
    expect(root.querySelector('.dialog__footer-start .message')).not.toBeNull()
    const [submit] = buttons(root, 'actions')
    expect(buttons(root, 'actions')).toHaveLength(1)
    expect(submit.classList.contains('button--secondary')).toBe(true)
    expect(submit.textContent?.trim()).toBe('Run')
    expect(submit.disabled).toBe(true)

    component.$set({
      props: { label: getEmbeddedLabel('Import'), steps: STEPS, submitLabel: getEmbeddedLabel('Run'), earlySubmit: true, canSubmit: true, selected: 'review' }
    })
    await tick()
    buttons(root, 'actions')[0].click()
    expect(onSubmit).toHaveBeenCalledTimes(1)

    next.click()
    await tick()
    expect(current(root)).toBe('3. Import')
    expect(buttons(root, 'start')).toHaveLength(1)
    const [last] = buttons(root, 'actions')
    expect(last.classList.contains('button--positive')).toBe(true)
  })

  it('blocks Back while loading', () => {
    const { root } = mount({ selected: 'review', loading: true })
    expect(buttons(root, 'start')[0].disabled).toBe(true)
    expect(buttons(root, 'actions')[0].disabled).toBe(true)
  })

  it('moves focus to the main button when the focused one disappears', async () => {
    const { root } = mount({ selected: 'review' })
    const [back] = buttons(root, 'start')
    back.focus()
    back.click()
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(buttons(root, 'actions')[0])
    })
    expect(current(root)).toBe('1. Select file')

    const next = buttons(root, 'actions')[0]
    next.click()
    await tick()
    buttons(root, 'actions')[0].focus()
    buttons(root, 'actions')[0].click()
    await vi.waitFor(() => {
      expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Run')
    })
  })

  it('falls back to the first step for an unknown selected id', () => {
    const { root } = mount({ selected: 'missing' })
    expect(current(root)).toBe('1. Select file')
    expect(buttons(root, 'start')).toHaveLength(0)
  })

  it('answers canClose of the popup host through its dialog', () => {
    const { component } = mount()
    let keep = false
    component.$on('cancel', (event) => {
      if (keep) event.preventDefault()
    })
    expect(component.canClose()).toBe(true)
    keep = true
    expect(component.canClose()).toBe(false)
  })

  it('forwards a prevented cancel, so the dialog stays open', () => {
    const { root, component } = mount()
    const onClose = vi.fn()
    component.$on('cancel', (event) => {
      event.preventDefault()
    })
    component.$on('close', onClose)
    ;(root.querySelector('.dialog__tools button') as HTMLButtonElement).click()
    expect(onClose).not.toHaveBeenCalled()
  })
})
