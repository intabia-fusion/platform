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

import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import CodeInput from '../../ui-kit/code-input/CodeInput.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: Partial<ComponentProps<CodeInput>> = {}): {
  root: HTMLElement
  cells: HTMLInputElement[]
  component: CodeInput
  inputs: string[]
  completes: string[]
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new CodeInput({ target: host, props: { 'aria-label': 'Code', ...props } as any })
  mounted.push(component)
  const inputs: string[] = []
  const completes: string[] = []
  component.$on('input', (event: CustomEvent<string>) => inputs.push(event.detail))
  component.$on('complete', (event: CustomEvent<string>) => completes.push(event.detail))
  const root = host.querySelector('.code-input') as HTMLElement
  return { root, cells: Array.from(root.querySelectorAll('input')), component, inputs, completes }
}

async function type (cell: HTMLInputElement, text: string): Promise<void> {
  cell.value = text
  cell.dispatchEvent(new Event('input', { bubbles: true }))
  await tick()
  await tick()
}

function key (cell: HTMLInputElement, name: string): void {
  cell.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
}

async function paste (cell: HTMLInputElement, text: string): Promise<void> {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  cell.dispatchEvent(event)
  await tick()
  await tick()
}

describe('ui-kit CodeInput', () => {
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

  it('is a named group of six numeric cells split in halves', () => {
    const { root, cells } = mount()
    expect(root.getAttribute('role')).toBe('group')
    expect(root.getAttribute('aria-label')).toBe('Code')
    expect(root.classList.contains('code-input--small')).toBe(true)
    expect(cells).toHaveLength(6)
    expect(cells[0].inputMode).toBe('numeric')
    expect(cells[0].autocomplete).toBe('one-time-code')
    expect(cells[2].getAttribute('aria-label')).toBe('3 / 6')
    expect(root.querySelectorAll('.code-input__separator')).toHaveLength(1)
    expect(cells[3].previousElementSibling?.classList.contains('code-input__separator')).toBe(true)
  })

  it('moves to the next cell on typing and completes on the last one', async () => {
    const { cells, inputs, completes, component } = mount({ length: 4 })
    await type(cells[0], '1')
    expect(document.activeElement).toBe(cells[1])
    await type(cells[1], 'x')
    expect(cells[1].value).toBe('')
    expect(document.activeElement).toBe(cells[1])
    await type(cells[1], '2')
    await type(cells[2], '3')
    await type(cells[3], '4')
    expect(inputs).toEqual(['1', '12', '123', '1234'])
    expect(completes).toEqual(['1234'])
    component.clear()
    await tick()
    expect(cells.map((cell) => cell.value)).toEqual(['', '', '', ''])
    expect(document.activeElement).toBe(cells[0])
  })

  it('goes back and empties the previous cell on Backspace in an empty one', async () => {
    const { cells, inputs } = mount({ value: '12', length: 4 })
    cells[2].focus()
    key(cells[2], 'Backspace')
    await tick()
    expect(cells[1].value).toBe('')
    expect(document.activeElement).toBe(cells[1])
    expect(inputs).toEqual(['1'])
    key(cells[1], 'ArrowLeft')
    expect(document.activeElement).toBe(cells[0])
  })

  it('spreads a pasted or autofilled code over the cells', async () => {
    const { cells, completes } = mount()
    await paste(cells[3], '123 456')
    expect(cells.map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(completes).toEqual(['123456'])

    const other = mount()
    await type(other.cells[0], '654321')
    expect(other.cells.map((cell) => cell.value)).toEqual(['6', '5', '4', '3', '2', '1'])
    expect(other.completes).toEqual(['654321'])
  })

  it('takes letters when not numeric and drops the separator on request', async () => {
    const { root, cells, inputs } = mount({ numeric: false, separator: false, length: 3, size: 'large' })
    expect(root.querySelector('.code-input__separator')).toBeNull()
    expect(root.classList.contains('code-input--large')).toBe(true)
    await type(cells[0], 'a')
    expect(inputs).toEqual(['a'])
  })

  it('keeps the character of a cell when a rejected one is typed over or after it', async () => {
    const { cells, inputs } = mount({ value: '12', length: 4 })
    cells[0].focus()
    await type(cells[0], 'x')
    expect(cells[0].value).toBe('1')
    expect(document.activeElement).toBe(cells[0])
    await type(cells[1], '2x')
    expect(cells[1].value).toBe('2')
    expect(document.activeElement).toBe(cells[0])
    expect(inputs).toEqual([])
  })

  it('moves with the arrows, Home and End, and empties a cell with Delete', async () => {
    const { cells, inputs } = mount({ value: '1234', length: 4 })
    cells[1].focus()
    key(cells[1], 'ArrowRight')
    expect(document.activeElement).toBe(cells[2])
    key(cells[2], 'End')
    expect(document.activeElement).toBe(cells[3])
    key(cells[3], 'ArrowRight')
    expect(document.activeElement).toBe(cells[3])
    key(cells[3], 'Home')
    expect(document.activeElement).toBe(cells[0])
    key(cells[0], 'Delete')
    await tick()
    expect(cells[0].value).toBe('')
    expect(document.activeElement).toBe(cells[0])
    expect(inputs).toEqual(['234'])
  })

  it('marks every cell invalid with error, disables them and takes aria-labelledby', () => {
    const { root, cells } = mount({
      'aria-label': undefined,
      'aria-labelledby': 'code-title',
      error: true,
      disabled: true
    })
    expect(root.getAttribute('aria-labelledby')).toBe('code-title')
    expect(root.classList.contains('code-input--error')).toBe(true)
    expect(cells.every((cell) => cell.getAttribute('aria-invalid') === 'true')).toBe(true)
    expect(cells.every((cell) => cell.disabled)).toBe(true)
  })

  it('shows a value set by the place and focuses the first empty cell', async () => {
    const { cells, component } = mount({ autofocus: true })
    expect(document.activeElement).toBe(cells[0])
    component.$set({ value: '98' })
    await tick()
    expect(cells.map((cell) => cell.value)).toEqual(['9', '8', '', '', '', ''])
    component.focus()
    expect(document.activeElement).toBe(cells[2])
  })
})
