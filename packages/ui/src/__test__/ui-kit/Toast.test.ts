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

import { getEmbeddedLabel } from '@hcengineering/platform'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Toast from '../../ui-kit/toast/Toast.svelte'
import type { ToastProps } from '../../ui-kit/toast/types'
import ToastWithSlots from './ToastWithSlots.svelte'

const title = getEmbeddedLabel('Export finished')

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (props: ToastProps): { toast: HTMLElement, component: Toast } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new Toast({ target: host, props })
  mounted.push(component)
  return { toast: host.querySelector('.toast') as HTMLElement, component }
}

function mountWithSlots (props: ToastProps): HTMLElement {
  const host = document.createElement('div')
  target.appendChild(host)
  mounted.push(new ToastWithSlots({ target: host, props: { props } }))
  return host.querySelector('.toast') as HTMLElement
}

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

describe('ui-kit Toast', () => {
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

  it('is a polite status with its title, no icon, no close button and no empty rows', async () => {
    const { toast } = mount({ title })
    await settle()
    expect(toast.getAttribute('role')).toBe('status')
    expect(toast.querySelector('.toast__title')?.textContent).toBe('Export finished')
    expect(toast.querySelector('.status-icon')).toBeNull()
    expect(toast.querySelector('button')).toBeNull()
    expect(toast.querySelector('.toast__content')).toBeNull()
    expect(toast.querySelector('.toast__actions')).toBeNull()
  })

  it('maps the tone to the icon and announces errors and warnings at once', async () => {
    const { toast, component } = mount({ title, tone: 'success' })
    await settle()
    expect(toast.querySelector('.status-icon--positive.status-icon--medium')).not.toBeNull()
    component.$set({ tone: 'error' })
    await tick()
    expect(toast.querySelector('.status-icon--error')).not.toBeNull()
    expect(toast.getAttribute('role')).toBe('alert')
    component.$set({ tone: 'warning' })
    await tick()
    expect(toast.getAttribute('role')).toBe('alert')
    component.$set({ tone: 'info' })
    await tick()
    expect(toast.querySelector('.status-icon--info')).not.toBeNull()
    expect(toast.getAttribute('role')).toBe('status')
  })

  it('closes by its named button without bubbling the click', async () => {
    const { toast, component } = mount({ title, closable: true })
    const onClose = vi.fn<(event: CustomEvent<null>) => void>()
    const onOuterClick = vi.fn()
    component.$on('close', onClose)
    target.addEventListener('click', onOuterClick)
    await settle()
    const button = toast.querySelector('button[data-id="btnNotifyClose"]') as HTMLButtonElement
    expect(button.getAttribute('aria-label')).toBe('ui:string:Close')
    button.click()
    expect(onClose.mock.calls.map(([event]) => event.detail)).toEqual([null])
    expect(onOuterClick).not.toHaveBeenCalled()
  })

  it('renders content and actions slots', async () => {
    const toast = mountWithSlots({ title, closable: true })
    await settle()
    expect(toast.querySelector('.toast__content .content')?.textContent).toBe('Export is ready')
    expect(toast.querySelector('.toast__actions .action')).not.toBeNull()
  })

  it('puts the text into a polite status after the region is in the page, an alert at once', async () => {
    const polite = mount({ title, tone: 'info' })
    expect(polite.toast.getAttribute('role')).toBe('status')
    expect(polite.toast.textContent).toBe('')
    await settle()
    expect(polite.toast.textContent).toContain('Export finished')

    const alert = mount({ title, tone: 'error' })
    expect(alert.toast.getAttribute('role')).toBe('alert')
    await tick()
    expect(alert.toast.textContent).toContain('Export finished')
  })
})
