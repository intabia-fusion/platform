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

import { get } from 'svelte/store'
import { tick } from 'svelte'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntlString, Plugin } from '@hcengineering/platform'
import { addStringsLoader, Severity, Status, StatusDisplay } from '@hcengineering/platform'
import { NotificationSeverity, notificationsStore, type AnyComponent, type Notification } from '..'
import StatusNotification from '../components/notifications/StatusNotification.svelte'
import { addStatusNotification } from '../utils'

const CODE = 'test:string:Failed' as IntlString
const TIMEOUT_KEY = '#platform.notification.timeout'

function errorStatus (timeout?: number): Status {
  return new Status(Severity.ERROR, CODE, {}, undefined, { timeout, display: StatusDisplay.Notification })
}

function clearNotifications (): void {
  for (const n of get(notificationsStore)) notificationsStore.removeNotification(n.id)
}

describe('addStatusNotification', () => {
  beforeAll(() => {
    addStringsLoader('ui' as Plugin, async () => ({
      string: { StatusError: 'Error', StatusWarning: 'Warning', StatusInfo: 'Information' }
    }))
    addStringsLoader('test' as Plugin, async () => ({
      string: {
        Failed: 'Field is required',
        Title: '{task} status not changed'
      }
    }))
  })

  beforeEach(() => {
    localStorage.removeItem(TIMEOUT_KEY)
    clearNotifications()
  })

  afterEach(() => {
    clearNotifications()
  })

  it('shows an error status as an Error toast with the status timeout', async () => {
    const status = errorStatus(5000)
    expect(await addStatusNotification(status)).toBe(true)

    const [n] = get(notificationsStore)
    expect(n.title).toBe('Error')
    expect(n.severity).toBe(NotificationSeverity.Error)
    expect(n.closeTimeout).toBe(5000)
    expect(n.component).toBe(StatusNotification)
    expect(n.params?.status).toBe(status)
  })

  it('maps warning and info severities', async () => {
    await addStatusNotification(new Status(Severity.WARNING, CODE, {}))
    await addStatusNotification(new Status(Severity.INFO, CODE, {}))
    expect(get(notificationsStore).map((n) => n.severity)).toEqual([
      NotificationSeverity.Warning,
      NotificationSeverity.Info
    ])
  })

  it('takes the title from the status options and fills it with the status params', async () => {
    const status = new Status(Severity.ERROR, CODE, { task: 'TSK-12' }, undefined, {
      display: StatusDisplay.Notification,
      title: 'test:string:Title' as IntlString
    })
    await addStatusNotification(status)
    expect(get(notificationsStore)[0].title).toBe('TSK-12 status not changed')
  })

  it('renders the toast with the component from the status options', async () => {
    const component = 'test:component:Toast' as AnyComponent
    await addStatusNotification(new Status(Severity.ERROR, CODE, {}, undefined, { component }))
    expect(get(notificationsStore)[0].component).toBe(component)
  })

  it('replaces the toast of the same group instead of stacking a new one', async () => {
    const grouped = (task: string): Status =>
      new Status(Severity.ERROR, CODE, { task }, undefined, { group: `${CODE}:${task}` })
    await addStatusNotification(grouped('TSK-1'))
    await addStatusNotification(grouped('TSK-2'))
    await addStatusNotification(grouped('TSK-1'))
    expect(get(notificationsStore).map((n) => n.params?.status.params.task)).toEqual(['TSK-1', 'TSK-2'])
  })

  it('falls back to the notification timeout when the status has none', async () => {
    await addStatusNotification(errorStatus())
    expect(get(notificationsStore)[0].closeTimeout).toBe(10000)
  })

  it('skips an OK status so the status bar can clear itself', async () => {
    expect(await addStatusNotification(new Status(Severity.OK, CODE, {}))).toBe(false)
    expect(get(notificationsStore)).toHaveLength(0)
  })

  it('skips when the user turned notifications off', async () => {
    localStorage.setItem(TIMEOUT_KEY, '0')
    expect(await addStatusNotification(errorStatus(5000))).toBe(false)
    expect(get(notificationsStore)).toHaveLength(0)
  })
})

describe('StatusNotification', () => {
  it('renders the title and the status text, and closes through onRemove', async () => {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const onRemove = vi.fn()
    const notification = {
      id: 'n1',
      title: 'Error',
      severity: NotificationSeverity.Error,
      params: { status: errorStatus() }
    } as unknown as Notification
    // eslint-disable-next-line no-new
    new StatusNotification({ target, props: { notification, onRemove } })
    await vi.waitFor(() => {
      expect(target.querySelector('.content')?.textContent?.trim()).toBe('Field is required')
    })
    expect(target.querySelector('.fs-bold')?.textContent).toBe('Error')
    expect(target.querySelector('.icon-error')).not.toBeNull()
    ;(target.querySelector('[data-id="btnNotifyClose"]') as HTMLElement).click()
    await tick()
    expect(onRemove).toHaveBeenCalled()
    target.remove()
  })
})
