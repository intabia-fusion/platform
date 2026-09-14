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
import WizardStep from '../components/wizard/WizardStep.svelte'
import type { WizardItemPosition, WizardItemPositionState } from '../..'

const LABEL = 'wizard:string:Step1' as IntlString

let target: HTMLElement

interface Mounted {
  component: WizardStep
  host: HTMLElement
}

/** translate() has no loader registered, so it resolves to the id itself - settle waits that out. */
async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await tick()
}

async function mount (
  position: WizardItemPosition,
  positionState: WizardItemPositionState,
  extra: Record<string, unknown> = {}
): Promise<Mounted> {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new WizardStep({ target: host, props: { label: LABEL, position, positionState, ...extra } })
  await settle()
  return { component, host }
}

describe('WizardStep', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders nothing until the translation resolves', () => {
    const host = document.createElement('div')
    target.appendChild(host)
    // eslint-disable-next-line no-new
    new WizardStep({ target: host, props: { label: LABEL, position: 'start', positionState: 'current' } })
    expect(host.querySelector('.bar')).toBeNull()
  })

  it('renders the label id as text once translation resolves (no loader registered)', async () => {
    const { host } = await mount('start', 'current')
    expect(host.querySelector('.overflow-label')?.textContent).toBe(LABEL)
    expect(host.querySelector('.hidden-text')?.textContent).toBe(LABEL)
  })

  it('sizes the svg viewBox from the hidden text width plus padding, capped at 300', async () => {
    const { host } = await mount('start', 'current')
    // jsdom lays out nothing: clientWidth is always 0, so lenght settles at the 32px floor (0 + 32).
    expect(host.querySelector('.bar__back')?.getAttribute('viewBox')).toBe('0 0 32 24')
  })

  it('caps the viewBox width at 300 when the text is wide', async () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 500 })
    try {
      const { host } = await mount('start', 'current')
      expect(host.querySelector('.bar__back')?.getAttribute('viewBox')).toBe('0 0 300 24')
    } finally {
      if (original !== undefined) Object.defineProperty(Element.prototype, 'clientWidth', original)
    }
  })

  it('picks the start path for position=start', async () => {
    const { host } = await mount('start', 'current')
    const d = host.querySelector('path.bar__element')?.getAttribute('d')
    expect(d).toBe(
      'M0,5.3C0,2.4,2.3,0,5.2,0h1.3h19h1.2c0.5,0,1,0.3,1.2,0.9l4,10.7c0.1,0.3,0.1,0.7,0,0.9l-4,10.7c-0.2,0.5-0.7,0.9-1.2,0.9 l-1.2,0h-19H5.2C2.3,24,0,21.6,0,18.7V5.3z'
    )
  })

  it('picks the middle path for position=middle', async () => {
    const { host } = await mount('middle', 'current')
    const d = host.querySelector('path.bar__element')?.getAttribute('d')
    expect(d).toBe(
      'M4,11.5L0.1,0.9C-0.1,0.5,0.2,0,0.6,0h5.8h19h1.2c0.5,0,1,0.3,1.2,0.9l4,10.7c0.1,0.3,0.1,0.7,0,0.9l-4,10.7 c-0.2,0.5-0.7,0.9-1.2,0.9h-1.2h-19H0.6c-0.5,0-0.8-0.5-0.6-0.9L4,12.5C4.1,12.2,4.1,11.8,4,11.5z'
    )
  })

  it('picks the end path for position=end', async () => {
    const { host } = await mount('end', 'current')
    const d = host.querySelector('path.bar__element')?.getAttribute('d')
    expect(d).toBe(
      'M4.1,11.5l-4-10.6C-0.1,0.5,0.2,0,0.7,0h25C29,0,32,2.4,32,5.3v13.3c0,2.9-2.4,5.3-5.3,5.3h-32H0.6c-0.5,0-0.8-0.5-0.6-0.9L4,12.5C4.1,12.2,4.1,11.8,4,11.5z'
    )
  })

  it('falls back to the default path for an unrecognised position', async () => {
    // position is typed as 'start' | 'middle' | 'end', but the template has a 4th, untyped branch.
    const { host } = await mount('single' as WizardItemPosition, 'current')
    const d = host.querySelector('path.bar__element')?.getAttribute('d')
    expect(d).toBe(
      'M0,5.3C0,2.4,2.3,0,5.2,0h1.3h32h1.3C49.7,0,52,2.4,52,5.3v13.3c0,2.9-2.3,5.3-5.2,5.3h-1.3h-32H5.2 C2.3,24,0,21.6,0,18.7V5.3z'
    )
  })

  it('resolves the fill style from positionState, with the default colors', async () => {
    expect((await mount('start', 'current')).host.querySelector('.bar__element')?.getAttribute('style')).toBe(
      'fill: var(--trans-content-10);'
    )
    expect((await mount('start', 'prev')).host.querySelector('.bar__element')?.getAttribute('style')).toBe(
      'fill: var(--trans-content-10);'
    )
    expect((await mount('start', 'next')).host.querySelector('.bar__element')?.getAttribute('style')).toBe(
      'fill: var(--trans-content-05);'
    )
  })

  it('uses custom currentColor/prevColor/nextColor when given', async () => {
    const current = await mount('start', 'current', { currentColor: '#111' })
    expect(current.host.querySelector('.bar__element')?.getAttribute('style')).toBe('fill: #111;')

    const prev = await mount('start', 'prev', { prevColor: '#222' })
    expect(prev.host.querySelector('.bar__element')?.getAttribute('style')).toBe('fill: #222;')

    const next = await mount('start', 'next', { nextColor: '#333' })
    expect(next.host.querySelector('.bar__element')?.getAttribute('style')).toBe('fill: #333;')
  })

  it('re-resolves the style when positionState changes', async () => {
    const { component, host } = await mount('start', 'current')
    expect(host.querySelector('.bar__element')?.getAttribute('style')).toBe('fill: var(--trans-content-10);')

    component.$set({ positionState: 'next' })
    await tick()
    expect(host.querySelector('.bar__element')?.getAttribute('style')).toBe('fill: var(--trans-content-05);')
  })

  it('stops a click on the bar from bubbling to the parent', async () => {
    const { host } = await mount('start', 'current')
    const onParent = vi.fn()
    target.addEventListener('click', onParent)
    host.querySelector('.bar')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onParent).not.toHaveBeenCalled()
  })

  it('re-translates when the label changes', async () => {
    const { component, host } = await mount('start', 'current')
    expect(host.querySelector('.overflow-label')?.textContent).toBe(LABEL)

    const NEW_LABEL = 'wizard:string:Step2' as IntlString
    component.$set({ label: NEW_LABEL })
    await settle()
    expect(host.querySelector('.overflow-label')?.textContent).toBe(NEW_LABEL)
  })
})
