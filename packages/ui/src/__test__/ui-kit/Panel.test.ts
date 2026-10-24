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

import type { PanelProps } from '../../ui-kit/panel/types'
import PanelWithSlots from './PanelWithSlots.svelte'

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: Record<string, any> = {}): { root: HTMLElement, component: PanelWithSlots } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new PanelWithSlots({ target: host, props: { props: {}, ...props } })
  mounted.push(component)
  return { root: host.querySelector('.popupPanel') as HTMLElement, component }
}

describe('ui-kit Panel', () => {
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

  it('draws the kit header with the close button first, the title and the content', () => {
    const { root } = mount()
    const header = root.querySelector('.panel-header') as HTMLElement
    expect(header).not.toBeNull()
    const close = header.querySelector('#btnPClose') as HTMLElement
    const title = header.querySelector('.title') as HTMLElement
    expect(close.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(root.querySelector('.popupPanel-body .content')).not.toBeNull()
  })

  it('closes from the close button and hides it when not closable', async () => {
    const { root, component } = mount()
    const onClose = vi.fn()
    component.$on('close', onClose)
    ;(root.querySelector('#btnPClose') as HTMLButtonElement).click()
    expect(onClose).toHaveBeenCalledTimes(1)

    const other = mount({ props: { closable: false } satisfies PanelProps })
    expect(other.root.querySelector('#btnPClose')).toBeNull()
    await tick()
  })

  it('sets the before slot apart from the close button with a line', () => {
    const { root } = mount({ withAside: false, withBefore: true })
    const before = root.querySelector('.before') as HTMLElement
    expect(before.previousElementSibling?.classList.contains('panel__divider')).toBe(true)
  })

  it('puts the aside toggle after the actions; a narrow panel opens without the aside, the toggle floats it', async () => {
    const { root } = mount({ props: { selectedAside: true } satisfies PanelProps })
    const toggle = root.querySelector('#btnPAside') as HTMLButtonElement
    const util = root.querySelector('.util') as HTMLElement
    expect(util.compareDocumentPosition(toggle)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    await tick()
    expect(root.querySelector('.aside')).toBeNull()
    toggle.click()
    await tick()
    expect(root.querySelector('.popupPanel-body__aside.float .aside')).not.toBeNull()
    toggle.click()
    await tick()
    expect(root.querySelector('.aside')).toBeNull()
  })

  it('switches several asides with a button group and reports the choice', async () => {
    const items = [
      { id: 'history', label: 'History' as any },
      { id: 'links', label: 'Links' as any }
    ]
    const { root, component } = mount({ customAside: items, props: { selectedAside: false } satisfies PanelProps })
    const onSelect = vi.fn()
    component.$on('select', onSelect)
    expect(root.querySelector('#btnPAside')).toBeNull()
    expect(root.querySelector('.aside')).toBeNull()
    const buttons = root.querySelectorAll<HTMLButtonElement>('.panel-header__actions button')
    const history = [...buttons].find(
      (b) => b.textContent?.includes('History') || b.getAttribute('aria-label') === 'History'
    )
    ;(history ?? buttons[buttons.length - 2]).click()
    await tick()
    expect(onSelect).toHaveBeenCalled()
    expect(root.querySelector('.aside')).not.toBeNull()
  })

  it('shows the width button for useMaxWidth and reports the switch', async () => {
    const { root, component } = mount({ props: { useMaxWidth: false } satisfies PanelProps })
    const onWidth = vi.fn()
    component.$on('maxWidth', onWidth)
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.panel-header__actions button')]
    const width = buttons.find((b) => b.getAttribute('aria-pressed') === 'false')
    expect(width).toBeDefined()
    width?.click()
    await tick()
    expect(onWidth).toHaveBeenCalledWith(expect.objectContaining({ detail: true }))
  })
})
