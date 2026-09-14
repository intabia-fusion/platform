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
import TextArea from '../components/TextArea.svelte'

let target: HTMLElement

interface Mounted {
  component: TextArea
  host: HTMLElement
  textarea: HTMLTextAreaElement
}

function mount (props: Partial<ComponentProps<TextArea>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TextArea({ target: host, props: props as ComponentProps<TextArea> })
  return { component, host, textarea: host.querySelector('textarea') as HTMLTextAreaElement }
}

async function type (textarea: HTMLTextAreaElement, value: string): Promise<void> {
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('TextArea', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a textarea and binds the value both ways', async () => {
    const { component, textarea } = mount({ value: 'start' })
    expect(textarea.value).toBe('start')

    await type(textarea, 'typed')
    expect(textarea.value).toBe('typed')

    component.$set({ value: 'outside' })
    await tick()
    expect(textarea.value).toBe('outside')
  })

  it('turns limit into maxlength, and no limit into none', () => {
    expect(mount({ limit: 10 }).textarea.getAttribute('maxlength')).toBe('10')
    expect(mount({ limit: 0 }).textarea.getAttribute('maxlength')).toBeNull()
  })

  it('passes disabled and wrap down to the textarea', () => {
    expect(mount({ disabled: true }).textarea.disabled).toBe(true)
    expect(mount({ disabled: false }).textarea.disabled).toBe(false)
    expect(mount({ wrap: 'hard' }).textarea.getAttribute('wrap')).toBe('hard')
  })

  it('adds the wrap-soft class only when wrap is not off', () => {
    expect(mount({ wrap: 'soft' }).textarea.classList.contains('wrap-soft')).toBe(true)
    expect(mount({ wrap: 'off' }).textarea.classList.contains('wrap-soft')).toBe(false)
    expect(mount().textarea.classList.contains('wrap-soft')).toBe(false)
  })

  it('dispatches change, keydown, keypress and blur', async () => {
    const { component, textarea } = mount({ value: '' })
    const onChange = vi.fn()
    const onKeydown = vi.fn()
    const onKeypress = vi.fn()
    const onBlur = vi.fn()
    component.$on('change', onChange)
    component.$on('keydown', onKeydown)
    component.$on('keypress', onKeypress)
    component.$on('blur', onBlur)

    textarea.dispatchEvent(new Event('change', { bubbles: true }))
    expect(onChange).toHaveBeenCalledTimes(1)

    // Suspected source bug: the textarea markup lists `on:keydown` twice, so every keydown fires twice.
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(onKeydown).toHaveBeenCalledTimes(2)

    textarea.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', bubbles: true }))
    expect(onKeypress).toHaveBeenCalledTimes(1)

    textarea.dispatchEvent(new Event('blur', { bubbles: true }))
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('shows the label only when set', () => {
    expect(mount({ label: 'ui:string:Ok' as IntlString }).host.querySelector('.label')).not.toBeNull()
    expect(mount().host.querySelector('.label')).toBeNull()
  })

  it('adds the no-focus-border class only when noFocusBorder is set', () => {
    expect(mount({ noFocusBorder: true }).host.querySelector('.textarea')?.classList.contains('no-focus-border')).toBe(
      true
    )
    expect(mount().host.querySelector('.textarea')?.classList.contains('no-focus-border')).toBe(false)
  })

  it('sets width, height and margin as inline styles', () => {
    const { host } = mount({ width: '10rem', height: '5rem', margin: '1rem' })
    const wrapper = host.querySelector('.textarea') as HTMLElement
    expect(wrapper.style.width).toBe('10rem')
    expect(wrapper.style.height).toBe('5rem')
    expect(wrapper.style.margin).toBe('1rem')
  })

  it('exposes an imperative focus()', () => {
    const { component, textarea } = mount()
    expect(document.activeElement).not.toBe(textarea)
    component.focus()
    expect(document.activeElement).toBe(textarea)
  })
})
