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
import type { Asset, IntlString } from '@hcengineering/platform'
import type { ComponentProps } from 'svelte'
import Expandable from '../components/Expandable.svelte'

const ICON = 'ui:icon:Check' as Asset
const LABEL = 'ui:string:Header' as IntlString

let target: HTMLElement

function mount (props: Partial<ComponentProps<Expandable>> = {}): { component: Expandable, root: HTMLElement } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Expandable({ target: host, props: props as ComponentProps<Expandable> })
  return { component, root: host }
}

describe('Expandable', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the header with chevron', () => {
    const { root } = mount()
    expect(root.querySelector('.expandable-header')).not.toBeNull()
    expect(root.querySelector('.chevron')).not.toBeNull()
  })

  it('toggles expanded on inner div click', async () => {
    const { root, component } = mount()
    const header = root.querySelector('.expandable-header') as HTMLElement
    expect(header.classList.contains('expanded')).toBe(false)

    const inner = header.querySelector('.flex-row-center') as HTMLElement
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(header.classList.contains('expanded')).toBe(true)
  })

  it('does not toggle when expandable is false', async () => {
    const { root } = mount({ expandable: false })
    const header = root.querySelector('.expandable-header') as HTMLElement
    const inner = header.querySelector('.flex-row-center') as HTMLElement
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(header.classList.contains('expanded')).toBe(false)
  })

  it('adds bordered class when bordered is true', () => {
    const { root } = mount({ bordered: true })
    expect(root.querySelector('.expandable-header')?.classList.contains('bordered')).toBe(true)
  })

  it('adds content-color class when contentColor is true', () => {
    const { root } = mount({ contentColor: true })
    expect(root.querySelector('.overflow-label')?.classList.contains('content-color')).toBe(true)
  })

  it('renders an icon when provided', () => {
    const { root } = mount({ icon: ICON, label: LABEL })
    expect(root.querySelector('svg')).not.toBeNull()
  })
})
