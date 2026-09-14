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
import CheckBox from '../components/CheckBox.svelte'

let target: HTMLElement

interface Mounted {
  component: CheckBox
  label: HTMLLabelElement
  input: HTMLInputElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new CheckBox({ target: host, props })
  return {
    component,
    label: host.querySelector('.checkbox-container') as HTMLLabelElement,
    input: host.querySelector('input') as HTMLInputElement
  }
}

describe('CheckBox', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('binds checked both ways and dispatches value on change', async () => {
    const { component, input } = mount({ checked: false })
    const onValue = vi.fn()
    component.$on('value', onValue)
    expect(input.checked).toBe(false)

    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))

    component.$set({ checked: false })
    await tick()
    expect(input.checked).toBe(false)
  })

  it('does not dispatch value when the change event reports the same state', async () => {
    const { component, input } = mount({ checked: true })
    const onValue = vi.fn()
    component.$on('value', onValue)

    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onValue).not.toHaveBeenCalled()
  })

  it('disables the input, and readonly also disables it and blocks dispatch', async () => {
    expect(mount({ disabled: true }).input.disabled).toBe(true)

    const { component, input } = mount({ readonly: true, checked: false })
    expect(input.disabled).toBe(true)
    const onValue = vi.fn()
    component.$on('value', onValue)
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(onValue).not.toHaveBeenCalled()
  })

  it('carries size, kind and symbol classes', () => {
    const { label } = mount({ size: 'large', kind: 'primary', symbol: 'minus' })
    expect(label.classList.contains('large')).toBe(true)
    expect(label.classList.contains('primary')).toBe(true)
    expect(label.classList.contains('minus')).toBe(true)
  })

  it('defaults to small, default kind and check symbol', () => {
    const { label } = mount()
    expect(label.classList.contains('small')).toBe(true)
    expect(label.classList.contains('default')).toBe(true)
    expect(label.classList.contains('check')).toBe(true)
  })

  it('carries the circle and checked classes', () => {
    expect(mount({ circle: true }).label.classList.contains('circle')).toBe(true)
    expect(mount({ checked: true }).label.classList.contains('checked')).toBe(true)
  })

  it('sets --checkbox-color and the colored class only when color is given', () => {
    const withColor = mount({ color: 'red' })
    expect(withColor.label.classList.contains('colored')).toBe(true)
    expect(withColor.label.style.getPropertyValue('--checkbox-color')).toBe('red')

    const withoutColor = mount()
    expect(withoutColor.label.classList.contains('colored')).toBe(false)
  })

  it('passes the id through to the input', () => {
    expect(mount({ id: 'cb1' }).input.id).toBe('cb1')
  })

  it('stops the click event from propagating past the label', () => {
    const { label } = mount()
    const onParent = vi.fn()
    target.addEventListener('click', onParent)
    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onParent).not.toHaveBeenCalled()
  })
})
