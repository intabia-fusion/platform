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
import type { ComponentProps } from 'svelte'
import Button from '../components/Button.svelte'
import { deviceOptionsStore } from '../index'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

/** Own wrapper per mount, so a test can mount twice and still address each button. */
function mount (props: Partial<ComponentProps<Button>> = {}): { button: HTMLButtonElement, component: Button } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Button({ target: host, props: props as ComponentProps<Button> })
  return { button: host.querySelector('button') as HTMLButtonElement, component }
}

describe('Button', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('carries kind, size, justify and shape in the class list', () => {
    const { button } = mount({ kind: 'primary', size: 'large', justify: 'left', shape: 'round' })
    expect(button.classList.contains('antiButton')).toBe(true)
    expect(button.classList.contains('primary')).toBe(true)
    expect(button.classList.contains('large')).toBe(true)
    expect(button.classList.contains('jf-left')).toBe(true)
    expect(button.classList.contains('sh-round')).toBe(true)
  })

  it('falls back to no-shape and the regular kind', () => {
    const { button } = mount()
    expect(button.classList.contains('regular')).toBe(true)
    expect(button.classList.contains('sh-no-shape')).toBe(true)
    expect(button.classList.contains('bs-solid')).toBe(true)
  })

  // A primary button submits the form it sits in; every other kind must not.
  it('is a submit button only when primary', () => {
    expect(mount({ kind: 'primary' }).button.type).toBe('submit')
    expect(mount({ kind: 'secondary' }).button.type).toBe('button')
  })

  it('is disabled while loading, and shows a spinner instead of the icon', async () => {
    const { button, component } = mount({ loading: true })
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.spinner')).not.toBeNull()

    component.$set({ loading: false })
    await tick()
    expect(button.disabled).toBe(false)
    expect(button.querySelector('.spinner')).toBeNull()
  })

  it('stays disabled when disabled, with no spinner', () => {
    const { button } = mount({ disabled: true })
    expect(button.disabled).toBe(true)
    expect(button.querySelector('.spinner')).toBeNull()
  })

  it('forwards the click and stops it from propagating by default', () => {
    const { button } = mount({})
    const onClick = vi.fn()
    const onParent = vi.fn()
    button.addEventListener('click', onClick)
    target.addEventListener('click', onParent)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onParent).not.toHaveBeenCalled()
  })

  it('lets the click through with stopPropagation off', () => {
    const { button } = mount({ stopPropagation: false })
    const onParent = vi.fn()
    target.addEventListener('click', onParent)

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onParent).toHaveBeenCalledTimes(1)
  })

  it('marks itself icon-only when there is an icon and no label', async () => {
    const withIcon = mount({ icon: ICON })
    expect(withIcon.button.classList.contains('only-icon')).toBe(true)

    withIcon.component.$set({ label: 'ui:string:Ok' as IntlString })
    await tick()
    expect(withIcon.button.classList.contains('only-icon')).toBe(false)
  })

  // adaptiveShrink hides the label below the given breakpoint, which also makes the button icon-only.
  it('shrinks to the icon once the device is at or below adaptiveShrink', async () => {
    deviceOptionsStore.update((d) => ({ ...d, size: 'sm' }))
    const { button } = mount({ icon: ICON, label: 'ui:string:Ok' as IntlString, adaptiveShrink: 'sm' })
    expect(button.classList.contains('only-icon')).toBe(true)

    deviceOptionsStore.update((d) => ({ ...d, size: 'xxl' }))
    await tick()
    expect(button.classList.contains('only-icon')).toBe(false)
  })

  it('applies the inline style props it is given', () => {
    const { button } = mount({ width: '10rem', minWidth: '5rem', height: '2rem', padding: '0 1rem', shrink: 1 })
    expect(button.style.width).toBe('10rem')
    expect(button.style.minWidth).toBe('5rem')
    expect(button.style.height).toBe('2rem')
    expect(button.style.padding).toBe('0px 1rem')
    expect(button.style.flexShrink).toBe('1')
  })

  it('focuses itself on mount when asked', () => {
    const { button } = mount({ focus: true })
    expect(document.activeElement).toBe(button)
  })

  it('clicks itself on mount when asked', () => {
    const onClick = vi.fn()
    target.addEventListener('click', onClick, true)
    mount({ click: true })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('passes id, dataId and title through', () => {
    const { button } = mount({ id: 'btn', dataId: 'data-btn', title: 'hint' })
    expect(button.id).toBe('btn')
    expect(button.dataset.id).toBe('data-btn')
    expect(button.title).toBe('hint')
  })
})
