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

import { getEmbeddedLabel, translateCB } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import IconSearch from '../../components/icons/Search.svelte'
import TextInput from '../../ui-kit/text-input/TextInput.svelte'
import TextInputWithBefore from './TextInputWithBefore.svelte'

vi.mock('@hcengineering/platform', async (importOriginal) => {
  const platform = await importOriginal<typeof import('@hcengineering/platform')>()
  return { ...platform, translateCB: vi.fn(platform.translateCB) }
})

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

const name = getEmbeddedLabel('Name')

function mount (props: ComponentProps<TextInput>): {
  root: HTMLElement
  input: HTMLInputElement
  component: TextInput
  inputs: string[]
  changes: string[]
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new TextInput({ target: host, props })
  mounted.push(component)
  const inputs: string[] = []
  const changes: string[] = []
  component.$on('input', (event: CustomEvent<string>) => inputs.push(event.detail))
  component.$on('change', (event: CustomEvent<string>) => changes.push(event.detail))
  const root = host.querySelector('.text-input') as HTMLElement
  return { root, input: root.querySelector('input') as HTMLInputElement, component, inputs, changes }
}

async function type (input: HTMLInputElement, text: string): Promise<void> {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

async function flush (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('ui-kit TextInput', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('is a secondary small text field named by its placeholder', async () => {
    const { root, input } = mount({ placeholder: name })
    await flush()
    expect(root.classList.contains('text-input--secondary')).toBe(true)
    expect(root.classList.contains('text-input--small')).toBe(true)
    expect(input.type).toBe('text')
    expect(input.placeholder).toBe('Name')
    expect(input.getAttribute('aria-label')).toBe('Name')
    expect(root.querySelector('button')).toBeNull()
  })

  it('reports every edit as input and the commit as change', async () => {
    const { input, inputs, changes, component } = mount({ placeholder: name })
    await type(input, 'a')
    await type(input, 'ab')
    expect(inputs).toEqual(['a', 'ab'])
    expect(changes).toEqual([])
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(changes).toEqual(['ab'])
    component.$set({ value: 'set by place' })
    await tick()
    expect(input.value).toBe('set by place')
  })

  it('shows a label above the field and marks it required', async () => {
    const { root, input } = mount({ label: name, placeholder: getEmbeddedLabel('Enter a name'), required: true })
    await flush()
    const label = root.querySelector('.text-input__label') as HTMLLabelElement
    expect(label.htmlFor).toBe(input.id)
    expect(label.textContent).toContain('Name')
    expect(label.querySelector('.text-input__required')).not.toBeNull()
    expect(input.required).toBe(true)
    expect(input.getAttribute('aria-label')).toBe('Name')
    expect(input.placeholder).toBe('Enter a name')
  })

  it('floats the label inside an extra-large field', async () => {
    const { root, input } = mount({ label: name, size: 'extra-large', type: 'password' })
    await flush()
    expect(root.classList.contains('text-input--floating')).toBe(true)
    expect(root.querySelector('.text-input__label')).toBeNull()
    expect(root.querySelector('.text-input__floating')?.textContent).toContain('Name')
    expect(input.type).toBe('password')
    expect(input.getAttribute('placeholder')).toBeNull()
  })

  it('clears with a named button and keeps the focus in the field', async () => {
    const { root, input, inputs, changes } = mount({ placeholder: name, value: 'draft', clearable: true })
    await flush()
    const clear = root.querySelector('button') as HTMLButtonElement
    expect(clear.getAttribute('aria-label')).toBe('ui:string:Clear')
    clear.click()
    await tick()
    expect(inputs).toEqual([''])
    expect(changes).toEqual([''])
    expect(input.value).toBe('')
    expect(document.activeElement).toBe(input)
    expect(root.querySelector('button')).toBeNull()
  })

  it('hides the clear button when the field cannot change', async () => {
    const { root } = mount({ placeholder: name, value: 'fixed', clearable: true, readonly: true })
    expect(root.querySelector('button')).toBeNull()
    expect((root.querySelector('input') as HTMLInputElement).readOnly).toBe(true)
  })

  it('marks heading, ghost, error, icon and full width', () => {
    const { root, input } = mount({
      placeholder: name,
      kind: 'ghost',
      size: 'large',
      heading: true,
      error: true,
      fullWidth: true,
      icon: IconSearch
    })
    expect(root.classList.contains('text-input--ghost')).toBe(true)
    expect(root.classList.contains('text-input--heading')).toBe(true)
    expect(root.classList.contains('text-input--error')).toBe(true)
    expect(root.classList.contains('text-input--full-width')).toBe(true)
    expect(root.querySelector('.text-input__icon svg')).not.toBeNull()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(root.classList.contains('text-input--inset')).toBe(false)
  })

  it('draws subtle as a ghost with its own focus plate', () => {
    const { root } = mount({ placeholder: name, kind: 'subtle' })
    expect(root.classList.contains('text-input--subtle')).toBe(true)
    expect(root.classList.contains('text-input--ghost')).toBe(true)
  })

  it('keeps the inset of a filled field on a ghost field with inset', () => {
    const { root } = mount({ placeholder: name, kind: 'ghost', size: 'large', inset: true, error: true })
    expect(root.classList.contains('text-input--ghost')).toBe(true)
    expect(root.classList.contains('text-input--inset')).toBe(true)
  })

  it('passes native attributes and the maximum length to the input', () => {
    const { input } = mount({
      'aria-label': 'Email',
      id: 'email',
      name: 'email',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      maxlength: 32,
      'data-id': 'email-field'
    })
    expect(input.id).toBe('email')
    expect(input.name).toBe('email')
    expect(input.type).toBe('email')
    expect(input.inputMode).toBe('email')
    expect(input.autocomplete).toBe('email')
    expect(input.maxLength).toBe(32)
    expect(input.dataset.id).toBe('email-field')
    expect(input.getAttribute('aria-label')).toBe('Email')
  })

  it('is named by a visible label of the place with aria-labelledby and passes keydown', async () => {
    const { input, component } = mount({
      'aria-labelledby': 'row-title',
      placeholder: name,
      'aria-describedby': 'hint'
    })
    await flush()
    expect(input.getAttribute('aria-labelledby')).toBe('row-title')
    expect(input.hasAttribute('aria-label')).toBe(false)
    expect(input.getAttribute('aria-describedby')).toBe('hint')
    const keys: string[] = []
    component.$on('keydown', (event: KeyboardEvent) => keys.push(event.key))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(keys).toEqual(['Enter'])
  })

  it('disables the field and leaves out the clear button', () => {
    const { root, input } = mount({ placeholder: name, value: 'x', clearable: true, disabled: true })
    expect(input.disabled).toBe(true)
    expect(root.classList.contains('text-input--disabled')).toBe(true)
    expect(root.querySelector('button')).toBeNull()
  })

  it('takes the focus on mount and selects on request', async () => {
    const { input, component } = mount({ placeholder: name, value: 'rename me', autofocus: true })
    expect(document.activeElement).toBe(input)
    component.select()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('rename me'.length)
  })

  it('focuses the input on a click on the field padding, while a slotted button keeps its own click', async () => {
    const onBefore = vi.fn()
    const host = document.createElement('div')
    target.appendChild(host)
    const component = new TextInputWithBefore({ target: host, props: { onBefore } })
    mounted.push(component)
    const field = host.querySelector('.text-input__field') as HTMLElement
    const input = host.querySelector('input') as HTMLInputElement
    const inputClicks = vi.fn()
    input.addEventListener('click', inputClicks)
    field.click()
    expect(onBefore).not.toHaveBeenCalled()
    expect(inputClicks).toHaveBeenCalledTimes(1)
    ;(host.querySelector('.before') as HTMLButtonElement).click()
    expect(onBefore).toHaveBeenCalledTimes(1)
    expect(inputClicks).toHaveBeenCalledTimes(1)
  })

  it('keeps the latest label when a slower answer for a previous one arrives late', async () => {
    const { root, component } = mount({ label: name })
    await flush()
    const answers: Array<(text: string) => void> = []
    vi.mocked(translateCB).mockImplementationOnce((_label, _params, _lang, cb) => {
      answers.push(cb)
    })
    component.$set({ label: getEmbeddedLabel('Old') })
    await tick()
    vi.mocked(translateCB).mockImplementationOnce((_label, _params, _lang, deliver) => {
      deliver('New')
    })
    component.$set({ label: getEmbeddedLabel('Newer') })
    await tick()
    expect(root.querySelector('.text-input__label')?.textContent).toContain('New')
    answers[0]('Old')
    await tick()
    expect(root.querySelector('.text-input__label')?.textContent).toContain('New')
  })
})
