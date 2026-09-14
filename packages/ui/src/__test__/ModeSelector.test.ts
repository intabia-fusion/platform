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
import ModeSelector from '../components/ModeSelector.svelte'
import type { IModeSelector } from '../utils'

let target: HTMLElement

// Written out rather than taken from ComponentProps: svelte-check sees this component as generic
// and plain tsc does not, so naming its type would satisfy exactly one of the two.
interface Props {
  props: IModeSelector<string>
  kind?: 'nuance' | 'subtle'
  onlyIcons?: boolean
  expansion?: 'stretch' | 'default'
  padding?: string
}

function mount (props: Props): { host: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  // eslint-disable-next-line no-new
  new ModeSelector({ target: host, props })
  return { host }
}

describe('ModeSelector', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders nothing when config is not set', () => {
    const props: IModeSelector = { mode: 'a', config: undefined as any, onChange: vi.fn() }
    const { host } = mount({ props })
    expect(host.querySelector('.switcher-container')).toBeNull()
  })

  it('renders one radio per config entry', () => {
    const props: IModeSelector = {
      mode: 'a',
      config: [
        ['a', 'ui:string:A' as IntlString, {}],
        ['b', 'ui:string:B' as IntlString, {}]
      ],
      onChange: vi.fn()
    }
    const { host } = mount({ props })
    expect(host.querySelectorAll('input.switcher').length).toBe(2)
  })

  it('checks the radio matching the current mode', () => {
    const props: IModeSelector = {
      mode: 'b',
      config: [
        ['a', 'ui:string:A' as IntlString, {}],
        ['b', 'ui:string:B' as IntlString, {}]
      ],
      onChange: vi.fn()
    }
    const { host } = mount({ props })
    const inputs = host.querySelectorAll('input.switcher')
    expect((inputs[0] as HTMLInputElement).checked).toBe(false)
    expect((inputs[1] as HTMLInputElement).checked).toBe(true)
  })

  it('calls onChange with the id of the selected entry', async () => {
    const onChange = vi.fn()
    const props: IModeSelector = {
      mode: 'a',
      config: [
        ['a', 'ui:string:A' as IntlString, {}],
        ['b', 'ui:string:B' as IntlString, {}]
      ],
      onChange
    }
    const { host } = mount({ props })
    const second = host.querySelectorAll('input.switcher')[1] as HTMLInputElement
    second.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('passes kind and onlyIcons down to the switcher', () => {
    const props: IModeSelector = {
      mode: 'a',
      config: [['a', 'ui:string:A' as IntlString, {}]],
      onChange: vi.fn()
    }
    const { host } = mount({ props, kind: 'subtle', onlyIcons: true })
    expect(host.querySelector('.switcher-container.subtle')).not.toBeNull()
    // onlyIcons drops the label span, leaving no text content on the switch item
    expect(host.querySelector('.switcher-element span')).toBeNull()
  })
})
