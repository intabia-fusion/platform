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

import { Severity, Status, type IntlString } from '@hcengineering/platform'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import StatusMessage from '../../ui-kit/status-message/StatusMessage.svelte'

const CODE = 'embedded:embedded:Wrong password' as IntlString

let target: HTMLElement
const mounted: Array<{ $destroy: () => void }> = []

function mount (status: Status, wrap = false): { host: HTMLElement, component: StatusMessage } {
  const host = document.createElement('div')
  target.appendChild(host)
  const component = new StatusMessage({ target: host, props: { status, wrap } })
  mounted.push(component)
  return { host, component }
}

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await tick()
}

describe('ui-kit StatusMessage', () => {
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

  it('shows nothing for OK', () => {
    const { host } = mount(new Status(Severity.OK, CODE, {}))
    expect(host.querySelector('.status-message')).toBeNull()
  })

  it('announces an error as an alert with an error icon and its text', async () => {
    const { host } = mount(new Status(Severity.ERROR, CODE, {}))
    await tick()
    const message = host.querySelector('.status-message') as HTMLElement
    expect(message.getAttribute('role')).toBe('alert')
    expect(message.classList.contains('status-message--error')).toBe(true)
    expect(message.querySelector('.status-icon--error')).not.toBeNull()
    expect(message.textContent?.trim()).toBe('Wrong password')
  })

  it('maps warning and info to polite statuses and follows a new status', async () => {
    const { host, component } = mount(new Status(Severity.WARNING, CODE, {}), true)
    const message = (): HTMLElement => host.querySelector('.status-message') as HTMLElement
    expect(message().getAttribute('role')).toBe('status')
    expect(message().textContent?.trim()).toBe('')
    await settle()
    expect(message().classList.contains('status-message--warning')).toBe(true)
    expect(message().classList.contains('status-message--wrap')).toBe(true)
    component.$set({ status: new Status(Severity.INFO, CODE, {}) })
    await tick()
    expect(message().querySelector('.status-icon--info')).not.toBeNull()
    component.$set({ status: new Status(Severity.OK, CODE, {}) })
    await tick()
    expect(host.querySelector('.status-message')).toBeNull()
  })

  it('fills a polite status after it is in the page, again when it comes back from OK', async () => {
    const { host, component } = mount(new Status(Severity.OK, CODE, {}))
    component.$set({ status: new Status(Severity.INFO, CODE, {}) })
    await tick()
    const message = (): HTMLElement => host.querySelector('.status-message') as HTMLElement
    expect(message().textContent?.trim()).toBe('')
    await settle()
    expect(message().textContent?.trim()).toBe('Wrong password')

    component.$set({ status: new Status(Severity.OK, CODE, {}) })
    await tick()
    component.$set({ status: new Status(Severity.INFO, CODE, {}) })
    await tick()
    expect(message().textContent?.trim()).toBe('')
  })
})
