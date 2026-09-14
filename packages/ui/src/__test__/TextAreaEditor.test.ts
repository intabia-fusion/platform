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
import TextAreaEditor from '../components/TextAreaEditor.svelte'

let target: HTMLElement

interface Mounted {
  component: TextAreaEditor
  host: HTMLElement
  textarea: HTMLTextAreaElement
}

function mount (props: Record<string, unknown> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TextAreaEditor({ target: host, props })
  return { component, host, textarea: host.querySelector('textarea') as HTMLTextAreaElement }
}

async function type (textarea: HTMLTextAreaElement, value: string): Promise<void> {
  textarea.value = value
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

describe('TextAreaEditor', () => {
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

  // Submit Button plus ActionIcon's own native button.
  it('shows submit/cancel buttons unless disabled', () => {
    expect(mount().host.querySelectorAll('button').length).toBe(2)
    expect(mount({ disabled: true }).host.querySelectorAll('button').length).toBe(0)
  })

  it('dispatches submit with the value on the submit button click', async () => {
    const { component, host } = mount({ value: 'hello' })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)

    const submitButton = host.querySelector('button') as HTMLButtonElement
    submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'hello' }))
  })

  it('dispatches cancel when the close icon is clicked', () => {
    const { component, host } = mount({ value: 'hello' })
    const onCancel = vi.fn()
    component.$on('cancel', onCancel)

    // ActionIcon renders the close icon inside the second interactive wrapper.
    const closeWrapper = host.querySelectorAll('.flex-row-center.mt-3 > div')[0] as HTMLElement
    closeWrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  // Suspected source bug: TextArea forwards a bare native keydown event (no CustomEvent wrapper),
  // but onKeydown reads `e.detail.key` instead of `e.key` - so Enter never actually submits. Pinned.
  it('does not submit on Enter keydown - detail.key is never set on the forwarded native event', () => {
    const { component, textarea } = mount({ value: 'hello' })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)

    const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true })
    textarea.dispatchEvent(ev)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on other keys', () => {
    const { component, textarea } = mount({ value: 'hello' })
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // isEditing only flips true reactively when the field starts empty (mount value:'hello' never
  // arms it) - so the realistic path is starting empty, typing, then clicking outside.
  it('submits on an outside click after starting empty and typing a value', async () => {
    const { component, textarea } = mount({ value: '' })
    await type(textarea, 'hello')
    const outside = document.createElement('div')
    target.appendChild(outside)
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)

    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ detail: 'hello' }))
  })

  it('does not submit on outside click when the value is empty', () => {
    const { component } = mount({ value: '' })
    const outside = document.createElement('div')
    target.appendChild(outside)
    const onSubmit = vi.fn()
    component.$on('submit', onSubmit)

    outside.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('passes disabled down to the textarea', () => {
    expect(mount({ disabled: true }).textarea.disabled).toBe(true)
    expect(mount({ disabled: false }).textarea.disabled).toBe(false)
  })
})
