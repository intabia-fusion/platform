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
import NotificationToast from '../components/NotificationToast.svelte'
import { NotificationSeverity } from '../components/notifications/NotificationSeverity'

let target: HTMLElement

function mount (props: Record<string, unknown>): { host: HTMLElement, component: NotificationToast } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new NotificationToast({ target: host, props })
  return { host, component }
}

describe('NotificationToast', () => {
  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    target.remove()
  })

  it('renders the title with no icon and no close button by default', () => {
    const { host } = mount({ title: 'Hello' })
    expect(host.querySelector('.overflow-label')?.textContent).toBe('Hello')
    expect(host.querySelector('svg, .mr-2')).toBeNull()
    expect(host.querySelector('[data-id="btnNotifyClose"]')).toBeNull()
  })

  it('picks the icon class from severity, mapping Error and Warning to the Info icon', async () => {
    const { host, component } = mount({ title: 'T', severity: NotificationSeverity.Success })
    expect(host.querySelector('.icon-success')).not.toBeNull()

    component.$set({ severity: NotificationSeverity.Error })
    await tick()
    expect(host.querySelector('.icon-error')).not.toBeNull()

    component.$set({ severity: NotificationSeverity.Warning })
    await tick()
    expect(host.querySelector('.icon-warning')).not.toBeNull()
  })

  it('renders a close button only when onClose is provided, and forwards the click', () => {
    const onClose = vi.fn()
    const { host } = mount({ title: 'T', onClose })
    const closeBtn = host.querySelector('[data-id="btnNotifyClose"]') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()

    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the info icon for Info severity too, and drops it once severity is cleared', async () => {
    const { host, component } = mount({ title: 'T', severity: NotificationSeverity.Info })
    expect(host.querySelector('.icon-info')).not.toBeNull()

    component.$set({ severity: undefined })
    await tick()
    expect(host.querySelector('.icon-info, .icon-success, .icon-error, .icon-warning')).toBeNull()
  })

  // $$slots.buttons is undefined without a slotted button, so the row is skipped entirely.
  it('omits the buttons row when no buttons slot is passed', () => {
    const { host } = mount({ title: 'T' })
    expect(host.querySelector('.flex-between.gap-2')).toBeNull()
  })
})
