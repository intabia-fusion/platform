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
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ComponentProps } from 'svelte'
import RadioGroup from '../components/RadioGroup.svelte'
import type { RadioItem } from '../types'

let target: HTMLElement

function makeItems (): RadioItem[] {
  return [
    { id: 'r1', value: 'a', label: 'A' },
    { id: 'r2', value: 'b', label: 'B' },
    { id: 'r3', value: 'c', label: 'C' }
  ]
}

interface Mounted {
  component: RadioGroup
  host: HTMLElement
  inputs: HTMLInputElement[]
}

function mount (props: Partial<ComponentProps<RadioGroup>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const items = (props.items as RadioItem[] | undefined) ?? makeItems()
  const merged = { ...props, items }
  const component = new RadioGroup({ target: host, props: merged as ComponentProps<RadioGroup> })
  return { component, host, inputs: Array.from(host.querySelectorAll('input[type=radio]')) }
}

describe('RadioGroup', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders nothing when items is empty', () => {
    const { host } = mount({ items: [] })
    expect(host.querySelector('.flex-col')).toBeNull()
  })

  it('renders one RadioButton per item', () => {
    const { inputs } = mount()
    expect(inputs).toHaveLength(3)
  })

  it('checks the input matching the initial selected value', () => {
    const { inputs } = mount({ selected: 'b' })
    expect(inputs.map((i) => i.checked)).toEqual([false, true, false])
  })

  it('checks nothing when selected matches no item', () => {
    const { inputs } = mount({ selected: 'zzz' })
    expect(inputs.every((i) => !i.checked)).toBe(true)
  })

  it('moves the checked state when a different item is clicked', async () => {
    const { inputs } = mount({ selected: 'a' })
    expect(inputs.map((i) => i.checked)).toEqual([true, false, false])

    inputs[2].click()
    await tick()
    expect(inputs.map((i) => i.checked)).toEqual([false, false, true])
  })

  it('disables every item when the group-level disabled is set, regardless of per-item disabled', () => {
    const items = makeItems()
    items[1].disabled = true
    const { inputs } = mount({ items, disabled: true })
    expect(inputs.every((i) => i.disabled)).toBe(true)
  })

  it('disables only the item whose own disabled flag is set', () => {
    const items = makeItems()
    items[1].disabled = true
    const { inputs } = mount({ items })
    expect(inputs.map((i) => i.disabled)).toEqual([false, true, false])
  })

  it('forces gap none on the last item regardless of the gap prop', () => {
    const { host } = mount({ gap: 'large' })
    const wrappers = Array.from(host.querySelectorAll('.antiRadio'))
    expect(wrappers[0].classList.contains('gap-large')).toBe(true)
    expect(wrappers[wrappers.length - 1].classList.contains('gap-none')).toBe(true)
  })
})
