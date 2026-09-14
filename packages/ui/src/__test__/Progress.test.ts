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
import { get } from 'svelte/store'
import { themeStore } from '@hcengineering/theme'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'svelte'
import Progress from '../components/Progress.svelte'
import { deviceOptionsStore } from '../index'

let target: HTMLElement

interface Mounted {
  component: Progress
  host: HTMLElement
  container: HTMLElement
  bar: HTMLElement
}

function mount (props: Partial<ComponentProps<Progress>>): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Progress({ target: host, props: props as any })
  return {
    component,
    host,
    container: host.querySelector('.container') as HTMLElement,
    bar: host.querySelector('.bar') as HTMLElement
  }
}

describe('Progress', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    // fontSize feeds calcValue's pixel math; default 0 would divide by zero.
    deviceOptionsStore.update((d) => ({ ...d, fontSize: 16 }))
  })

  afterEach(() => {
    target.remove()
    deviceOptionsStore.update((d) => ({ ...d, fontSize: 0 }))
  })

  it('renders a plain percentage bar when not editable', () => {
    const { container, bar } = mount({ value: 30, min: 0, max: 100 })
    expect(container.classList.contains('editable')).toBe(false)
    expect(bar.style.width).toBe('30%')
    expect(container.querySelector('.control')).toBeNull()
  })

  it('renders the knob-aware calc() width and control when editable', () => {
    const { container, bar } = mount({ value: 25, min: 0, max: 100, editable: true })
    expect(container.classList.contains('editable')).toBe(true)
    // jsdom's cssstyle normalizes the calc() expression on read, so assert its canonical form.
    expect(bar.style.width).toBe('calc(0.5rem + 0.25 * calc(100% - 1rem))')
    const control = container.querySelector('.control') as HTMLElement
    expect(control).not.toBeNull()
    expect(control.style.left).toBe('calc(0.25 * calc(100% - 1rem))')
  })

  it('scales position from a non-default min/max range', () => {
    const { bar } = mount({ value: 13, min: 10, max: 20 })
    expect(bar.style.width).toBe('30%')
  })

  it('clamps value above max and below min on mount and on prop change', async () => {
    const { component, bar } = mount({ value: 15, min: 0, max: 10 })
    expect(bar.style.width).toBe('100%')

    component.$set({ value: -5 })
    await tick()
    expect(bar.style.width).toBe('0%')
  })

  it('falls back to the fallback percentage when min equals max', () => {
    const { bar } = mount({ value: 999, min: 5, max: 5, fallback: 42 })
    expect(bar.style.width).toBe('42%')
  })

  it('uses the theme css variable with no color, and a resolved color otherwise', () => {
    const plain = mount({ value: 10 })
    expect(plain.bar.style.backgroundColor).toBe('var(--theme-toggle-on-bg-color)')

    const colored = mount({ value: 10, color: 1 })
    expect(colored.bar.style.backgroundColor).not.toBe('var(--theme-toggle-on-bg-color)')
    expect(colored.bar.style.backgroundColor).not.toBe('')
    // sanity: color resolution is theme-dependent, but it must not be the default var either way.
    expect(get(themeStore)).toBeDefined()
  })

  it('ignores clicks when not editable', () => {
    const { component, container } = mount({ value: 10, min: 0, max: 100 })
    const onChange = vi.fn()
    component.$on('change', onChange)
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(onChange).not.toHaveBeenCalled()
  })

  // jsdom lays out nothing: getBoundingClientRect is always zero, so calcValue's pixel maths
  // degenerates to `-x/fontSize`, computed here from fontSize=16, min=0, max=100.
  it('dispatches change with the value computed from the click position (editable)', () => {
    const { component, container } = mount({ value: 0, min: 0, max: 100, editable: true })
    const onChange = vi.fn()
    component.$on('change', onChange)

    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 50 }))

    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 8, clientY: 0 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 0 }))

    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: -8, clientY: 0 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 100 }))
  })

  it('clamps a negative pos to 0, and clamps an extreme pos to 100 rather than 1', () => {
    const { component, container } = mount({ value: 0, min: 0, max: 100, editable: true })
    const onChange = vi.fn()
    component.$on('change', onChange)

    // pos goes negative for any clientX far to the right of the zero-width rect.
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40, clientY: 0 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 0 }))

    // pinned behaviour, not a desired one: pos is a 0..1 fraction everywhere else, but the guard
    // clamps it against 100 instead of 1, so an extreme drag can report a value far above `max`.
    container.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: -2000, clientY: 0 }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 10000 }))
  })

  it('drags via mousedown on the control, mousemove, then mouseup', () => {
    const { component, container } = mount({ value: 0, min: 0, max: 100, editable: true })
    const onChange = vi.fn()
    component.$on('change', onChange)
    const control = container.querySelector('.control') as HTMLElement

    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    // move alone (without a prior mousedown->drag) must not dispatch anything.
    expect(onChange).not.toHaveBeenCalled()

    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(onChange).not.toHaveBeenCalled()

    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 50 }))

    // drag is now false: a further mouseup/mouseleave must not dispatch again.
    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('also saves on mouseleave while dragging', () => {
    const { component, container } = mount({ value: 0, min: 0, max: 100, editable: true })
    const onChange = vi.fn()
    component.$on('change', onChange)
    const control = container.querySelector('.control') as HTMLElement

    control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 8, clientY: 0 }))
    container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 0 }))
  })

  it('move without drag does not throw and leaves the bar unchanged', () => {
    const { container, bar } = mount({ value: 40, min: 0, max: 100, editable: true })
    container.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0, clientY: 0 }))
    expect(bar.style.width).toBe('calc(0.5rem + 0.4 * calc(100% - 1rem))')
  })
})
