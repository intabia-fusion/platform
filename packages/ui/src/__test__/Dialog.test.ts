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
import type { IntlString } from '@hcengineering/platform'
import Dialog from '../components/Dialog.svelte'
import { deviceOptionsStore } from '../index'

const LABEL = 'ui:string:Ok' as IntlString

let target: HTMLElement

interface Mounted {
  component: Dialog
  host: HTMLElement
}

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
  await tick()
}

async function mount (props: Record<string, unknown> = {}): Promise<Mounted> {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Dialog({ target: host, props })
  await settle()
  return { component, host }
}

describe('Dialog', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
    deviceOptionsStore.update((d) => ({ ...d, size: null }))
  })

  it('renders no title, an unrounded-if-footerless content, no fullsize class by default', async () => {
    const { host } = await mount()
    expect(host.querySelector('.title')).toBeNull()
    expect(host.querySelector('.content')?.classList.contains('rounded')).toBe(true)
    expect(host.querySelector('.footer')).toBeNull()
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(false)
  })

  it('renders the label id as the title when label is given', async () => {
    const { host } = await mount({ label: LABEL })
    expect(host.querySelector('.title')?.textContent).toBe(LABEL)
  })

  it('applies the padding prop to the content, defaulting to 1rem', async () => {
    expect((await mount()).host.querySelector('.content')?.getAttribute('style')).toContain('padding: 1rem')
    expect((await mount({ padding: '2rem' })).host.querySelector('.content')?.getAttribute('style')).toContain(
      'padding: 2rem'
    )
  })

  it('dispatches close when the close button is clicked', async () => {
    const { component, host } = await mount()
    const onClose = vi.fn()
    component.$on('close', onClose)
    host.querySelector('.header button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not render the maximize toggle when isFullSize is off', async () => {
    const { host } = await mount()
    expect(host.querySelector('#btnDialogFullScreen')).toBeNull()
  })

  it('does not render the maximize toggle once the device forces full size', async () => {
    deviceOptionsStore.update((d) => ({ ...d, size: 'sm' }))
    const { host } = await mount({ isFullSize: true })
    expect(host.querySelector('#btnDialogFullScreen')).toBeNull()
  })

  it('toggles fullsize via the maximize/minimize button, dispatching fullsize', async () => {
    const { component, host } = await mount({ isFullSize: true })
    const onFullsize = vi.fn()
    component.$on('fullsize', onFullsize)
    const toggle = host.querySelector('#btnDialogFullScreen') as HTMLButtonElement

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onFullsize).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(true)

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()
    expect(onFullsize).toHaveBeenLastCalledWith(expect.objectContaining({ detail: false }))
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(false)
  })

  it('forces fullsize on when the device narrows below md, and drops it above md', async () => {
    const { component, host } = await mount({ isFullSize: true })
    const onFullsize = vi.fn()
    component.$on('fullsize', onFullsize)

    deviceOptionsStore.update((d) => ({ ...d, size: 'sm' }))
    await tick()
    expect(onFullsize).toHaveBeenLastCalledWith(expect.objectContaining({ detail: true }))
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(true)

    deviceOptionsStore.update((d) => ({ ...d, size: 'lg' }))
    await tick()
    expect(onFullsize).toHaveBeenLastCalledWith(expect.objectContaining({ detail: false }))
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(false)
  })

  it('exposes maximize() to force the class:fullsize state directly', async () => {
    const { component, host } = await mount()
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(false)
    component.maximize()
    await tick()
    expect(host.querySelector('form')?.classList.contains('fullsize')).toBe(true)
  })
})
