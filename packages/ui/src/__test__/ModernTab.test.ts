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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Asset, IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import ModernTab from '../components/ModernTab.svelte'

const ICON = 'ui:icon:Check' as Asset

let target: HTMLElement

interface Mounted {
  component: ModernTab
  host: HTMLElement
  container: HTMLElement
}

function mount (props: Partial<ComponentProps<ModernTab>> = {}): Mounted {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new ModernTab({ target: host, props: props as ComponentProps<ModernTab> })
  return { component, host, container: host.querySelector('.container') as HTMLElement }
}

describe('ModernTab', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders a plain label and a bold label as plain text', () => {
    const { container } = mount({ label: 'plain', boldLabel: 'bold' })
    expect(container.textContent).toContain('plain')
    expect(container.querySelector('.label')?.textContent).toContain('bold')
  })

  it('renders labelIntl and boldLabelIntl through Label (unregistered - shows the id)', () => {
    const { container } = mount({
      labelIntl: 'ui:string:Ok' as IntlString,
      boldLabelIntl: 'ui:string:Cancel' as IntlString
    })
    expect(container.textContent).toContain('ui:string:Ok')
    expect(container.querySelector('.label')?.textContent).toContain('ui:string:Cancel')
  })

  it('renders the icon only when an icon prop is given', () => {
    // scope to the tab's own icon wrapper - the close button has its own nested ".icon" div
    expect(mount({ label: 'x' }).container.querySelector(':scope > .icon')).toBeNull()
    expect(mount({ label: 'x', icon: ICON }).container.querySelector(':scope > .icon')).not.toBeNull()
  })

  it('carries orientation, kind, highlighted and italic in the class list', () => {
    const { container } = mount({ orientation: 'vertical', kind: 'secondary', highlighted: true, italic: true })
    expect(container.classList.contains('vertical')).toBe(true)
    expect(container.classList.contains('secondary')).toBe(true)
    expect(container.classList.contains('active')).toBe(true)
    expect(container.classList.contains('italic')).toBe(true)
  })

  it('defaults to horizontal orientation and primary kind, not highlighted or italic', () => {
    const { container } = mount({ label: 'x' })
    expect(container.classList.contains('horizontal')).toBe(true)
    expect(container.classList.contains('primary')).toBe(true)
    expect(container.classList.contains('active')).toBe(false)
    expect(container.classList.contains('italic')).toBe(false)
  })

  it('applies maxSize as max-width for horizontal and max-height for vertical', () => {
    const horiz = mount({ orientation: 'horizontal', maxSize: '10rem' }).container
    expect(horiz.style.maxWidth).toBe('10rem')
    expect(horiz.style.maxHeight).toBe('auto')

    const vert = mount({ orientation: 'vertical', maxSize: '10rem' }).container
    expect(vert.style.maxHeight).toBe('10rem')
    expect(vert.style.maxWidth).toBe('auto')
  })

  it('shows a close button by default and dispatches close on click', () => {
    const { host, component } = mount({ label: 'x' })
    const closeBtn = host.querySelector('.close-button button') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()

    const onClose = vi.fn()
    component.$on('close', onClose)
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('hides the close button when canClose is false or readonly is true', () => {
    expect(mount({ label: 'x', canClose: false }).host.querySelector('.close-button')).toBeNull()
    expect(mount({ label: 'x', readonly: true }).host.querySelector('.close-button')).toBeNull()
  })

  it('dispatches contextmenu with the event, unless readonly', () => {
    const { container, component } = mount({ label: 'x' })
    const onContextMenu = vi.fn()
    component.$on('contextmenu', onContextMenu)

    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    container.dispatchEvent(evt)
    expect(onContextMenu).toHaveBeenLastCalledWith(expect.objectContaining({ detail: evt }))
  })

  it('does not dispatch contextmenu when readonly', () => {
    const { container, component } = mount({ label: 'x', readonly: true })
    const onContextMenu = vi.fn()
    component.$on('contextmenu', onContextMenu)

    container.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(onContextMenu).not.toHaveBeenCalled()
  })

  it('forwards click and dblclick as component events', () => {
    const { container, component } = mount({ label: 'x' })
    const onClick = vi.fn()
    const onDblClick = vi.fn()
    component.$on('click', onClick)
    component.$on('dblclick', onDblClick)

    container.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    container.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(onDblClick).toHaveBeenCalledTimes(1)
  })
})
