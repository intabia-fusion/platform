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
import { getEmbeddedLabel, getResource } from '@hcengineering/platform'
import { tick } from 'svelte'
import { get } from 'svelte/store'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { modalStore } from '../../modals'
import { popupstore } from '../../popups'
import type { AnyComponent } from '../../types'
import Kbd from '../../ui-kit/kbd/Kbd.svelte'
import Menu from '../../ui-kit/menu/Menu.svelte'
import type { MenuItem } from '../../ui-kit/menu/types'

// The real popups module: a submenu given by a resource is still loading while it is closed.
vi.mock('@hcengineering/platform', async (importOriginal) => {
  const platform = await importOriginal<typeof import('@hcengineering/platform')>()
  return { ...platform, getResource: vi.fn() }
})

const t = getEmbeddedLabel
const mounted: Array<{ $destroy: () => void }> = []

afterEach(() => {
  mounted.splice(0).forEach((c) => {
    c.$destroy()
  })
  modalStore.set([])
  document.body.innerHTML = ''
})

async function flush (): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function gatedResource (): () => void {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.mocked(getResource).mockImplementation((async () => {
    await gate
    return Kbd
  }) as any)
  return release
}

function mount (): { menu: Menu, rows: HTMLElement[] } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const items: MenuItem[] = [
    { id: 'a', label: t('A'), popup: { component: 'test:component:Pop' as AnyComponent, props: { keys: ['x'] } } },
    { id: 'b', label: t('B') }
  ]
  const menu = new Menu({ target: host, props: { autofocus: false, items } })
  mounted.push(menu)
  return { menu, rows: Array.from(host.querySelectorAll<HTMLElement>('.menu__row')) }
}

describe('Menu submenu given by a resource', () => {
  it('does not show up once loaded after hovering another row', async () => {
    const release = gatedResource()
    const { rows } = mount()
    rows[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await tick()
    rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await tick()
    release()
    await flush()
    expect(get(popupstore)).toHaveLength(0)
  })

  it('does not show up once loaded after the menu is destroyed', async () => {
    const release = gatedResource()
    const { menu, rows } = mount()
    rows[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await tick()
    mounted.splice(mounted.indexOf(menu), 1)
    menu.$destroy()
    release()
    await flush()
    expect(get(popupstore)).toHaveLength(0)
  })

  it('shows up when it stays open', async () => {
    const release = gatedResource()
    const { rows } = mount()
    rows[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    release()
    await flush()
    expect(get(popupstore)).toHaveLength(1)
  })
})
