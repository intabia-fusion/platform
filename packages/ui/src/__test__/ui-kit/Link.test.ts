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

import Link from '../../ui-kit/link/Link.svelte'

const LABEL = getEmbeddedLabel('Create an application')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ComponentProps<Link>): { root: HTMLElement, component: Link } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Link({ target: host, props })
  mounted.push(component)
  return { root: host.querySelector('.link') as HTMLElement, component }
}

describe('ui-kit Link', () => {
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

  it('is an anchor with href, a new tab and no opener when external', () => {
    const { root } = mount({ label: LABEL, href: 'https://example.com', external: true })
    expect(root.tagName).toBe('A')
    expect(root.getAttribute('href')).toBe('https://example.com')
    expect(root.getAttribute('target')).toBe('_blank')
    expect(root.getAttribute('rel')).toBe('noopener noreferrer')
    expect(root.textContent?.trim()).toBe('Create an application')
  })

  it('marks only an address for the underline at rest', () => {
    expect(mount({ label: LABEL, href: '/a' }).root.classList.contains('link--anchor')).toBe(true)
    expect(mount({ label: LABEL }).root.classList.contains('link--anchor')).toBe(false)
  })

  it('is a button without href and reports clicks', () => {
    const { root, component } = mount({ label: LABEL, 'data-id': 'create' })
    const onClick = vi.fn()
    component.$on('click', onClick)
    expect(root.tagName).toBe('BUTTON')
    expect(root.getAttribute('type')).toBe('button')
    expect(root.getAttribute('data-id')).toBe('create')
    root.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('drops href of a disabled anchor and disables the button', () => {
    const anchor = mount({ label: LABEL, href: '/a', disabled: true }).root
    expect(anchor.hasAttribute('href')).toBe(false)
    expect(anchor.getAttribute('aria-disabled')).toBe('true')
    expect(anchor.getAttribute('role')).toBe('link')
    const button = mount({ label: LABEL, disabled: true }).root as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('keeps clicks of a disabled anchor from the place and from the containers around', async () => {
    const { root, component } = mount({ label: LABEL, href: '/a', disabled: true })
    const onClick = vi.fn()
    const onParent = vi.fn()
    component.$on('click', onClick)
    target.addEventListener('click', onParent)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    root.dispatchEvent(event)
    expect(onClick).not.toHaveBeenCalled()
    expect(onParent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    component.$set({ disabled: false })
    await tick()
    expect(root.getAttribute('href')).toBe('/a')
    root.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('opens an internal href in the same tab and hides the icon from assistive technology', () => {
    const { root } = mount({ label: LABEL, href: '/a', icon: 'ui:icon:Link' as Asset })
    expect(root.hasAttribute('target')).toBe(false)
    expect(root.hasAttribute('rel')).toBe(false)
    expect(root.querySelector('.link__icon')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('cuts a long label in the middle and keeps its ending whole', async () => {
    const { root } = mount({ label: getEmbeddedLabel('quarterly-report-final-version-2026.pdf'), truncate: 'middle' })
    await tick()
    await tick()
    const label = root.querySelector('.link__label--middle') as HTMLElement
    expect(label.textContent).toBe('quarterly-report-final-version-2026.pdf')
    expect(label.querySelector('.link__head')?.textContent).toBe('quarterly-report-final-vers')
    const short = mount({ label: getEmbeddedLabel('report.pdf'), truncate: 'middle' }).root
    await tick()
    await tick()
    expect(short.querySelector('.link__head')?.textContent).toBe('report.pdf')
  })
})
