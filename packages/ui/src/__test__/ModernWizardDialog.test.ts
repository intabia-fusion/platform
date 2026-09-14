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
import ModernWizardDialog from '../components/wizard/ModernWizardDialog.svelte'
import ui from '../plugin'
import type { IWizardStep } from '../types'

const STEPS: readonly IWizardStep[] = [
  { id: 'a', title: 'wiz:string:A' as IntlString },
  { id: 'b', title: 'wiz:string:B' as IntlString },
  { id: 'c', title: 'wiz:string:C' as IntlString }
]
const SUBMIT_LABEL = 'wiz:string:Finish' as IntlString

let target: HTMLElement

interface Mounted {
  component: ModernWizardDialog
  host: HTMLElement
}

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await tick()
}

async function mount (props: Partial<ComponentProps<ModernWizardDialog>>): Promise<Mounted> {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { label: 'wiz:string:Title' as IntlString, submitLabel: SUBMIT_LABEL, steps: STEPS, ...props }
  const component = new ModernWizardDialog({
    target: host,
    props: merged as ComponentProps<ModernWizardDialog>
  })
  await settle()
  return { component, host }
}

function buttonByLabel (host: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll('button')).find((b) => b.querySelector('.label')?.textContent === label)
}

describe('ModernWizardDialog', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the header label id and the step count in the wizard bar', async () => {
    const { host } = await mount({ selectedStep: 'a' })
    expect(host.querySelector('.label')?.textContent).toBe('wiz:string:Title')
    expect(host.querySelectorAll('.circle')).toHaveLength(3)
  })

  it('shows only Next on the first step', async () => {
    const { host } = await mount({ selectedStep: 'a' })
    expect(buttonByLabel(host, ui.string.Back)).toBeUndefined()
    expect(buttonByLabel(host, ui.string.NextStep)).not.toBeUndefined()
    expect(buttonByLabel(host, SUBMIT_LABEL)).toBeUndefined()
  })

  it('shows Back and Next on a middle step', async () => {
    const { host } = await mount({ selectedStep: 'b' })
    expect(buttonByLabel(host, ui.string.Back)).not.toBeUndefined()
    expect(buttonByLabel(host, ui.string.NextStep)).not.toBeUndefined()
    expect(buttonByLabel(host, SUBMIT_LABEL)).toBeUndefined()
  })

  it('shows Back and Submit (no Next) on the last step', async () => {
    const { host } = await mount({ selectedStep: 'c' })
    expect(buttonByLabel(host, ui.string.Back)).not.toBeUndefined()
    expect(buttonByLabel(host, ui.string.NextStep)).toBeUndefined()
    expect(buttonByLabel(host, SUBMIT_LABEL)).not.toBeUndefined()
  })

  // pinned behaviour, not a desired one: with no selectedStep, selectedIdx is -1, and
  // -1 < steps.length - 1 is true, so hasNext renders Next even though nothing is selected.
  it('shows Next (not Back or Submit) with no selectedStep', async () => {
    const { host } = await mount({ selectedStep: '' })
    expect(buttonByLabel(host, ui.string.Back)).toBeUndefined()
    expect(buttonByLabel(host, ui.string.NextStep)).not.toBeUndefined()
    expect(buttonByLabel(host, SUBMIT_LABEL)).toBeUndefined()
  })

  it('advances stepChanged forward and back between steps', async () => {
    const { component, host } = await mount({ selectedStep: 'b' })
    const onStepChanged = vi.fn()
    component.$on('stepChanged', onStepChanged)

    buttonByLabel(host, ui.string.NextStep)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onStepChanged).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'c' }))

    buttonByLabel(host, ui.string.Back)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onStepChanged).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  // pinned behaviour: findIndex returns -1 for an unknown id, and both handlers then fall
  // through to steps[0] - "next" from an unknown step does not mean "second step".
  it('resets to the first step when selectedStep does not match any step', async () => {
    const { component, host } = await mount({ selectedStep: 'unknown' })
    const onStepChanged = vi.fn()
    component.$on('stepChanged', onStepChanged)

    buttonByLabel(host, ui.string.NextStep)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onStepChanged).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'a' }))
  })

  it('dispatches submit when the submit button on the last step is clicked', async () => {
    const { component, host } = await mount({ selectedStep: 'c' })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)
    buttonByLabel(host, SUBMIT_LABEL)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('disables submit with canSubmit=false and next with canProceed=false', async () => {
    const submitDisabled = await mount({ selectedStep: 'c', canSubmit: false })
    expect(buttonByLabel(submitDisabled.host, SUBMIT_LABEL)?.disabled).toBe(true)

    const nextDisabled = await mount({ selectedStep: 'a', canProceed: false })
    expect(buttonByLabel(nextDisabled.host, ui.string.NextStep)?.disabled).toBe(true)
  })

  it('passes loading down to the step buttons', async () => {
    const { host } = await mount({ selectedStep: 'b', loading: true })
    expect(buttonByLabel(host, ui.string.Back)?.disabled).toBe(true)
    expect(buttonByLabel(host, ui.string.NextStep)?.disabled).toBe(true)
  })

  it('dispatches close when the header close button is clicked', async () => {
    const { component, host } = await mount({ selectedStep: 'a' })
    const onClose = vi.fn()
    component.$on('close', onClose)
    const headerButtons = Array.from(host.querySelectorAll('.header button'))
    headerButtons[headerButtons.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('forwards width to the dialog root style', async () => {
    const { host } = await mount({ selectedStep: 'a', width: '40rem' })
    // the outer ModernDialog element (form or div, both class "root") carries the style, not the
    // inner wizard-layout div which shares the same class name.
    const rootEl = host.querySelector('.root') as HTMLElement
    expect(rootEl.style.width).toBe('40rem')
  })

  it('highlights the wizard-bar circle up to the selected step', async () => {
    const { host } = await mount({ selectedStep: 'b' })
    const circles = Array.from(host.querySelectorAll('.circle'))
    expect(circles[0].classList.contains('filledHighlighted')).toBe(true) // past
    expect(circles[1].classList.contains('filled')).toBe(false) // current
    expect(circles[1].classList.contains('filledHighlighted')).toBe(false)
    expect(circles[2].classList.contains('filled')).toBe(true) // future
  })
})
