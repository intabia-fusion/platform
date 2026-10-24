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

import WorkbenchTab from '../../ui-kit/workbench-tab/WorkbenchTab.svelte'

const LABEL = getEmbeddedLabel('Specification')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (
  props: ComponentProps<WorkbenchTab>,
  host: HTMLElement = target
): { root: HTMLElement, component: WorkbenchTab } {
  const wrapper = document.createElement('div')
  host.appendChild(wrapper)
  const component = new WorkbenchTab({ target: wrapper, props })
  mounted.push(component)
  return { root: wrapper.querySelector('.tab') as HTMLElement, component }
}

function key (element: HTMLElement, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
}

describe('ui-kit WorkbenchTab', () => {
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

  it('is a horizontal secondary tab, a tab stop in its strip only while selected', async () => {
    target.setAttribute('role', 'tablist')
    const { root, component } = mount({ label: LABEL, icon: 'ui:icon:Doc' as Asset })
    await tick()
    expect(root.getAttribute('role')).toBe('tab')
    expect(root.getAttribute('aria-selected')).toBe('false')
    expect(root.tabIndex).toBe(-1)
    expect(root.classList.contains('tab--secondary')).toBe(true)
    expect(root.classList.contains('tab--horizontal')).toBe(true)
    expect(root.querySelector('.tab__label')?.textContent?.trim()).toBe('Specification')
    expect(root.querySelector('.tab__icon svg')).not.toBeNull()
    expect(root.querySelector('.tab__close')).toBeNull()

    component.$set({ selected: true })
    await tick()
    expect(root.getAttribute('aria-selected')).toBe('true')
    expect(root.tabIndex).toBe(0)
  })

  it('stays a tab stop outside a strip, where no sibling can take the focus', async () => {
    const { root } = mount({ label: LABEL })
    await tick()
    expect(root.tabIndex).toBe(0)
  })

  it('closes by the button and by Delete without a click on the tab', async () => {
    const { root, component } = mount({ label: LABEL, closable: true, selected: true })
    const onClose = vi.fn<(event: CustomEvent<null>) => void>()
    const onClick = vi.fn()
    component.$on('close', onClose)
    component.$on('click', onClick)
    await tick()

    const close = root.querySelector('.tab__close button') as HTMLButtonElement
    expect(close.tabIndex).toBe(-1)
    close.click()
    key(root, 'Delete')
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(onClose.mock.calls[0][0].detail).toBeNull()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('closes a closable tab by a middle click, not a plain one', () => {
    const closable = mount({ label: LABEL, closable: true })
    const plain = mount({ label: LABEL })
    const onClose = vi.fn()
    closable.component.$on('close', onClose)
    plain.component.$on('close', onClose)
    const middle = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    closable.root.dispatchEvent(middle)
    expect(middle.defaultPrevented).toBe(true)
    closable.root.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }))
    plain.root.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('activates with Enter and Space', () => {
    const { root, component } = mount({ label: LABEL })
    const onClick = vi.fn()
    component.$on('click', onClick)
    key(root, 'Enter')
    key(root, ' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('reports the context menu with the mouse event and suppresses the browser one', () => {
    const { root, component } = mount({ label: LABEL })
    const onMenu = vi.fn<(event: CustomEvent<MouseEvent>) => void>()
    component.$on('menu', onMenu)
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onMenu.mock.calls[0][0].detail).toBe(event)
  })

  it('moves along the tablist of the place with arrows and activates the next tab', async () => {
    const strip = document.createElement('div')
    strip.setAttribute('role', 'tablist')
    target.appendChild(strip)
    const tabs = ['A', 'B', 'C'].map((name, i) => mount({ label: getEmbeddedLabel(name), selected: i === 0 }, strip))
    const clicks = tabs.map(({ component }) => {
      const fn = vi.fn()
      component.$on('click', fn)
      return fn
    })

    key(tabs[0].root, 'ArrowRight')
    expect(document.activeElement).toBe(tabs[1].root)
    key(tabs[1].root, 'End')
    key(tabs[2].root, 'ArrowRight')
    expect(clicks.map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1])
    expect(document.activeElement).toBe(tabs[0].root)
  })

  it('uses Up / Down in the vertical strip, with the outline kind and the preview style', () => {
    const strip = document.createElement('div')
    strip.setAttribute('role', 'tablist')
    target.appendChild(strip)
    const first = mount({ label: LABEL, orientation: 'vertical', kind: 'outline', preview: true }, strip)
    const second = mount({ label: LABEL, orientation: 'vertical' }, strip)
    expect(first.root.classList.contains('tab--vertical')).toBe(true)
    expect(first.root.classList.contains('tab--outline')).toBe(true)
    expect(first.root.classList.contains('tab--preview')).toBe(true)

    key(first.root, 'ArrowRight')
    expect(document.activeElement).not.toBe(second.root)
    key(first.root, 'ArrowDown')
    expect(document.activeElement).toBe(second.root)
  })
})
