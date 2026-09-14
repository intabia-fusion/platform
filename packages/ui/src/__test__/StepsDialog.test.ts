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
import type { Asset, IntlString } from '@hcengineering/platform'
import type { DialogStep } from '../types'
import type { ComponentProps } from 'svelte'
import StepsDialog from '../components/StepsDialog.svelte'
import { modalStore } from '../modals'

const ICON = 'ui:icon:Check' as Asset

// The dialog only reads `name` for the step list, so the steps here carry nothing else.
function steps (count: number): DialogStep[] {
  const step = (i: number): Partial<DialogStep> => ({ name: `ui:string:Step${i}` as IntlString })
  return Array.from({ length: count }, (_, i) => step(i) as DialogStep)
}

let target: HTMLElement

// floatAside:true keeps Panel's aside shown: Panel re-derives its width from the mounted element on
// every update and, in jsdom, that width is always 0 - which otherwise auto-collapses the aside.
function mount (props: Partial<ComponentProps<StepsDialog>>): { host: HTMLElement, component: StepsDialog } {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { floatAside: true, ...props }
  const component = new StepsDialog({ target: host, props: merged as ComponentProps<StepsDialog> })
  return { host, component }
}

describe('StepsDialog', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalStore.set([])
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the title icon only when an icon prop is given', () => {
    const withIcon = mount({ steps: steps(2), title: 'ui:string:Title' as IntlString, icon: ICON })
    expect(withIcon.host.querySelector('.wrapped-icon')).not.toBeNull()

    const withoutIcon = mount({ steps: steps(2), title: 'ui:string:Title' as IntlString })
    expect(withoutIcon.host.querySelector('.wrapped-icon')).toBeNull()
  })

  it('lists one aside item per step, with the first selected and the rest disabled', () => {
    const { host } = mount({ steps: steps(3), title: 'ui:string:Title' as IntlString })
    const items = host.querySelectorAll('ol li')
    expect(items.length).toBe(3)
    expect(items[0].classList.contains('selected')).toBe(true)
    expect(items[0].classList.contains('disabled')).toBe(false)
    expect(items[0].classList.contains('fulfilled')).toBe(false)
    expect(items[1].classList.contains('disabled')).toBe(true)
    expect(items[2].classList.contains('disabled')).toBe(true)
  })

  it('hides the Back button on the first step', () => {
    const { host } = mount({ steps: steps(3), title: 'ui:string:Title' as IntlString })
    const buttonLabels = Array.from(
      host.querySelectorAll('.popupPanel-body__header ~ * .antiButton, button.antiButton')
    )
    // Back is only rendered once currentStepIndex > 0; on the first step there is just the primary button.
    const primaryButtons = host.querySelectorAll('button.antiButton.primary')
    const regularButtons = host.querySelectorAll('button.antiButton.regular')
    expect(primaryButtons.length).toBe(1)
    expect(regularButtons.length).toBe(0)
    expect(buttonLabels.length).toBeGreaterThan(0)
  })

  it('the primary button stays disabled: isStepValid is never set without a real step component', () => {
    const { host } = mount({ steps: steps(1), title: 'ui:string:Title' as IntlString })
    const primary = host.querySelector('button.antiButton.primary') as HTMLButtonElement
    expect(primary.disabled).toBe(true)
  })

  it('a single-step dialog is its own last step: the primary button is the done button immediately', async () => {
    const { host } = mount({
      steps: steps(1),
      title: 'ui:string:Title' as IntlString,
      doneLabel: 'ui:string:Publish' as IntlString
    })
    const primary = host.querySelector('button.antiButton.primary') as HTMLButtonElement
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(primary.textContent?.trim()).toBe('ui:string:Publish')
  })

  it('a multi-step dialog shows Next, not the done label, on its first step', async () => {
    const { host } = mount({ steps: steps(2), title: 'ui:string:Title' as IntlString })
    const primary = host.querySelector('button.antiButton.primary') as HTMLButtonElement
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(primary.textContent?.trim()).toBe('ui:string:Next')
  })

  it('forwards Panel close to its own close listeners', () => {
    const { host, component } = mount({ steps: steps(2), title: 'ui:string:Title' as IntlString })
    const onClose = vi.fn()
    component.$on('close', onClose)

    const closeBtn = host.querySelector('#btnPClose') as HTMLButtonElement
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders stepsName in the aside only when provided', () => {
    const withName = mount({
      steps: steps(2),
      title: 'ui:string:Title' as IntlString,
      stepsName: 'ui:string:Steps' as IntlString
    })
    expect(withName.host.querySelector('.default-padding > h4.no-margin')).not.toBeNull()

    const withoutName = mount({ steps: steps(2), title: 'ui:string:Title' as IntlString })
    expect(withoutName.host.querySelector('.default-padding > h4.no-margin')).toBeNull()
  })

  it('clicking a disabled (later) step does not move currentStepIndex forward', async () => {
    const { host } = mount({ steps: steps(3), title: 'ui:string:Title' as IntlString })
    const items = host.querySelectorAll('ol li')
    items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    // Still on step 0: the same item is still marked selected.
    expect(host.querySelectorAll('ol li')[0].classList.contains('selected')).toBe(true)
  })
})
