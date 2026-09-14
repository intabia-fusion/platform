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
import type { ComponentProps } from 'svelte'
import CodeForm from '../components/CodeForm.svelte'

const fields = [0, 1, 2, 3].map((i) => ({ id: `code-${i}`, name: `code-${i}`, optional: false }))

let target: HTMLElement

interface Mounted {
  component: CodeForm
  inputs: HTMLInputElement[]
  submitted: ReturnType<typeof vi.fn>
}

function mount (): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const merged = { fields }
  const component = new CodeForm({ target: host, props: merged as ComponentProps<CodeForm> })
  const submitted = vi.fn()
  component.$on('submit', submitted)
  return { component, inputs: [...host.querySelectorAll('input')] as HTMLInputElement[], submitted }
}

async function typeDigit (input: HTMLInputElement, digit: string): Promise<void> {
  input.value = digit
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
}

function press (input: HTMLInputElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

function paste (input: HTMLInputElement, text: string): void {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as any
  event.clipboardData = { getData: () => text }
  input.dispatchEvent(event)
}

describe('CodeForm', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders one input per field and focuses the first', () => {
    const { inputs } = mount()
    expect(inputs).toHaveLength(fields.length)
    expect(document.activeElement).toBe(inputs[0])
  })

  it('walks focus forward as digits are typed', async () => {
    const { inputs } = mount()
    await typeDigit(inputs[0], '1')
    expect(document.activeElement).toBe(inputs[1])
    await typeDigit(inputs[1], '2')
    expect(document.activeElement).toBe(inputs[2])
  })

  it('stays put when the field is cleared rather than filled', async () => {
    const { inputs } = mount()
    inputs[1].focus()
    await typeDigit(inputs[1], '')
    expect(document.activeElement).toBe(inputs[1])
  })

  it('submits the joined code once every field is filled', async () => {
    const { inputs, submitted } = mount()
    for (let i = 0; i < inputs.length; i++) {
      await typeDigit(inputs[i], String(i + 1))
    }
    expect(submitted).toHaveBeenCalledTimes(1)
    expect(submitted).toHaveBeenLastCalledWith(expect.objectContaining({ detail: '1234' }))
  })

  it('clears the field under backspace and only then steps back', async () => {
    const { inputs } = mount()
    await typeDigit(inputs[0], '1')
    await typeDigit(inputs[1], '2')
    inputs[1].focus()

    press(inputs[1], 'Backspace')
    await tick()
    expect(inputs[1].value).toBe('')
    expect(document.activeElement).toBe(inputs[1])

    press(inputs[1], 'Backspace')
    await tick()
    expect(document.activeElement).toBe(inputs[0])
  })

  it('does not step back past the first field', async () => {
    const { inputs } = mount()
    press(inputs[0], 'Backspace')
    await tick()
    expect(document.activeElement).toBe(inputs[0])
  })

  it('ignores keys that are not backspace or delete', async () => {
    const { inputs } = mount()
    await typeDigit(inputs[0], '7')
    press(inputs[0], 'a')
    await tick()
    expect(inputs[0].value).toBe('7')
  })

  it('spreads a pasted code over the fields and submits', async () => {
    const { inputs, submitted } = mount()
    paste(inputs[0], '1234')
    await tick()
    expect(inputs.map((i) => i.value)).toEqual(['1', '2', '3', '4'])
    expect(document.activeElement).toBe(inputs[3])
    expect(submitted).toHaveBeenLastCalledWith(expect.objectContaining({ detail: '1234' }))
  })

  it('drops spaces out of a pasted code', async () => {
    const { inputs } = mount()
    paste(inputs[0], '12 34')
    await tick()
    expect(inputs.map((i) => i.value)).toEqual(['1', '2', '3', '4'])
  })

  // A paste of the wrong length is more likely the wrong clipboard than a code to spread.
  it('ignores a paste that does not fill the form exactly', async () => {
    const { inputs, submitted } = mount()
    paste(inputs[0], '12345')
    await tick()
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', ''])
    expect(submitted).not.toHaveBeenCalled()
  })

  it('empties every field on clear()', async () => {
    const { component, inputs } = mount()
    paste(inputs[0], '1234')
    await tick()

    component.clear()
    await tick()
    expect(inputs.map((i) => i.value)).toEqual(['', '', '', ''])
  })
})
