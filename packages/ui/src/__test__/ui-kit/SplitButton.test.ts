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
import { getEmbeddedLabel, type Asset } from '@hcengineering/platform'
import { tick, type ComponentProps } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DropdownIntlItem } from '../../types'
import SplitButton from '../../ui-kit/split-button/SplitButton.svelte'

const popups = vi.hoisted(() => ({
  showPopup: vi.fn(),
  close: vi.fn(),
  update: vi.fn()
}))

vi.mock('../../popups', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  showPopup: popups.showPopup
}))

const ITEMS: DropdownIntlItem[] = [
  { id: 'create-open', label: getEmbeddedLabel('Create and open') },
  { id: 'create-new', label: getEmbeddedLabel('Create and new') }
]

const LABEL = getEmbeddedLabel('Create issue')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<SplitButton>): {
  root: HTMLElement
  buttons: HTMLButtonElement[]
  component: SplitButton
} {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new SplitButton({ target: host, props })
  mounted.push(component)
  return {
    root: host.querySelector('.split-button') as HTMLElement,
    buttons: Array.from(host.querySelectorAll('button')),
    component
  }
}

function click (button: HTMLButtonElement): void {
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('ui-kit SplitButton', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    popups.showPopup.mockReset().mockReturnValue({ id: 'popup', close: popups.close, update: popups.update })
    popups.close.mockReset()
    popups.update.mockReset()
  })

  afterEach(() => {
    mounted.splice(0).forEach((component) => {
      component.$destroy()
    })
    target.remove()
  })

  it('renders a main button and a menu button of the same kind and size, joined', () => {
    const { root, buttons } = mount({ label: LABEL, kind: 'brand', size: 'medium' })
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.classList.contains('button--brand')).toBe(true)
      expect(button.classList.contains('button--medium')).toBe(true)
    }
    expect(root.classList.contains('split-button--joined')).toBe(true)
    expect(root.classList.contains('split-button--compact')).toBe(false)
    expect(buttons[1].getAttribute('aria-haspopup')).toBe('true')
  })

  it('marks the ghost kind for its divider and quiet label', () => {
    const { root, buttons } = mount({ label: LABEL, kind: 'ghost' })
    expect(root.classList.contains('split-button--ghost')).toBe(true)
    expect(buttons.every((button) => button.classList.contains('button--ghost'))).toBe(true)
  })

  it('keeps a single plain button without the menu', () => {
    const { root, buttons } = mount({ label: LABEL, hasMenu: false })
    expect(buttons).toHaveLength(1)
    expect(root.classList.contains('split-button--joined')).toBe(false)
  })

  it('dispatches click from the main button and menu with the click from the menu button', () => {
    const { buttons, component } = mount({ label: LABEL })
    const onClick = vi.fn()
    const onMenu = vi.fn()
    component.$on('click', onClick)
    component.$on('menu', onMenu)
    click(buttons[0])
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onMenu).not.toHaveBeenCalled()
    click(buttons[1])
    expect(onMenu).toHaveBeenCalledTimes(1)
    expect(onMenu.mock.calls[0][0].detail).toBeInstanceOf(MouseEvent)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('reports an open menu on the menu button', async () => {
    const { buttons, component } = mount({ label: LABEL })
    component.$set({ menuPressed: true })
    await tick()
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true')
  })

  it('does not open the menu while the main action loads, and disables both when disabled', async () => {
    const { buttons, component } = mount({ label: LABEL, loading: true })
    const onMenu = vi.fn()
    component.$on('menu', onMenu)
    click(buttons[1])
    expect(onMenu).not.toHaveBeenCalled()
    expect(buttons[1].disabled).toBe(false)
    expect(buttons[1].getAttribute('aria-disabled')).toBe('true')
    expect(buttons[1].closest('.split-button')?.classList.contains('split-button--loading')).toBe(true)

    component.$set({ loading: false, disabled: true })
    await tick()
    expect(buttons[0].disabled).toBe(true)
    expect(buttons[1].disabled).toBe(true)
  })

  it('passes attributes to the main button', () => {
    const { buttons } = mount({ label: LABEL, id: 'issue-create-button' })
    expect(buttons[0].id).toBe('issue-create-button')
    expect(buttons[1].id).toBe('')
  })

  it('opens its items from the menu button, reports the choice and closes the list with itself', async () => {
    const { buttons, component } = mount({ label: LABEL, items: ITEMS })
    const onSelected = vi.fn()
    const onMenu = vi.fn()
    component.$on('selected', onSelected)
    component.$on('menu', onMenu)

    click(buttons[1])
    await tick()
    expect(popups.showPopup).toHaveBeenCalledTimes(1)
    expect(popups.showPopup.mock.calls[0][1]).toEqual({ items: ITEMS })
    expect(popups.showPopup.mock.calls[0][2]).toBe(buttons[1])
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true')
    expect(onMenu).not.toHaveBeenCalled()

    const onClose = popups.showPopup.mock.calls[0][3] as (result: string | undefined) => void
    onClose('create-new')
    await tick()
    expect(onSelected.mock.calls[0][0].detail).toBe('create-new')
    expect(buttons[1].getAttribute('aria-expanded')).toBe('false')

    click(buttons[1])
    mounted.pop()?.$destroy()
    expect(popups.close).toHaveBeenCalled()
  })

  it('is compact with an icon-only main button, without a label and slot', () => {
    const { buttons } = mount({ icon: 'ui:icon:Settings' as Asset, tooltip: { label: LABEL } })
    expect(buttons[0].classList.contains('button--icon-only')).toBe(true)
    expect(buttons[0].closest('.split-button')?.classList.contains('split-button--compact')).toBe(true)
    expect(buttons[0].getAttribute('aria-label')).not.toBeNull()
  })

  it('updates an open list when items change, without an echo right after opening', async () => {
    const { buttons, component } = mount({ label: LABEL, items: ITEMS })
    click(buttons[1])
    await tick()
    expect(popups.update).not.toHaveBeenCalled()

    const next = [ITEMS[0]]
    component.$set({ items: next })
    await tick()
    expect(popups.update).toHaveBeenCalledTimes(1)
    expect(popups.update).toHaveBeenCalledWith({ items: next })
  })

  it('passes tabindex to the main button only', () => {
    const { buttons } = mount({ label: LABEL, tabindex: -1 })
    expect(buttons[0].tabIndex).toBe(-1)
    expect(buttons[1].tabIndex).toBe(0)
  })
})
