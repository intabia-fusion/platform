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

import type { Doc, Ref } from '@hcengineering/core'
import type { PushData } from './types'
import {
  NOTIFICATION_CLICK,
  shouldSuppressPush,
  VIEWING_QUERY,
  VIEWING_REPLY,
  type NotificationClickMessage,
  type PushWindowClient,
  type ViewedObjects,
  type ViewingQueryMessage,
  type ViewingReplyMessage
} from './pushDecision'

// The package compiles against the DOM lib, which has no service worker types; the pieces of
// the worker scope this file touches are declared here.

interface ExtendableEvent extends Event {
  waitUntil: (promise: Promise<unknown>) => void
}

interface PushEvent extends ExtendableEvent {
  data: { json: () => PushData }
}

interface NotificationClickData {
  domain?: string
  url?: string
  notificationId?: string
}

interface NotificationClickEvent extends ExtendableEvent {
  notification: {
    data: NotificationClickData
    close: () => void
  }
}

interface WorkerWindowClient extends PushWindowClient {
  id: string
  postMessage: (message: NotificationClickMessage | ViewingQueryMessage, transfer?: Transferable[]) => void
  focus: () => Promise<WorkerWindowClient>
}

interface WorkerScope {
  location: { href: string }
  clients: {
    matchAll: (options: { type: 'window', includeUncontrolled: boolean }) => Promise<readonly WorkerWindowClient[]>
    openWindow: (url: string) => Promise<WorkerWindowClient | null>
    claim: () => Promise<void>
  }
  registration: {
    showNotification: (title: string, options: NotificationOptions & { data: NotificationClickData }) => Promise<void>
  }
  skipWaiting: () => Promise<void>
  addEventListener: ((type: 'push', listener: (event: PushEvent) => void) => void) &
    ((type: 'notificationclick', listener: (event: NotificationClickEvent) => void) => void) &
    ((type: 'install' | 'activate', listener: (event: ExtendableEvent) => void) => void)
}

declare const self: WorkerScope

// How long a tab gets to say what it shows before the push is decided by its URL alone.
const VIEWING_REPLY_TIMEOUT_MS = 300

/** Asks one tab what it shows; no answer in time counts as no answer, never as an error. */
async function askViewing (client: WorkerWindowClient): Promise<Array<Ref<Doc>> | undefined> {
  return await new Promise((resolve) => {
    const channel = new MessageChannel()
    // One answer per question: the port is closed on every exit, not left to the GC.
    const done = (ids: Array<Ref<Doc>> | undefined): void => {
      clearTimeout(timer)
      channel.port1.close()
      resolve(ids)
    }
    const timer = setTimeout(() => {
      done(undefined)
    }, VIEWING_REPLY_TIMEOUT_MS)
    channel.port1.onmessage = (event: MessageEvent<ViewingReplyMessage | undefined>) => {
      const ids = event.data?.type === VIEWING_REPLY ? event.data.objectIds : undefined
      done(Array.isArray(ids) ? ids : undefined)
    }
    try {
      client.postMessage({ type: VIEWING_QUERY }, [channel.port2])
    } catch {
      done(undefined)
    }
  })
}

async function handlePush (payload: PushData): Promise<void> {
  // The tab that shows the document reads the message itself; a system notification on top of
  // it is noise. A focused tab of this origin also lifts the browser's "show something" rule.
  // Only such tabs are asked what they show: the sidebar is not in the URL.
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const viewing = new Map<string, Array<Ref<Doc>>>()
  if (payload.objectId != null) {
    const candidates = windowClients.filter((it) => it.focused && it.visibilityState === 'visible')
    const replies = await Promise.all(candidates.map(async (it) => [it.id, await askViewing(it)] as const))
    for (const [id, ids] of replies) {
      if (ids !== undefined) viewing.set(id, ids)
    }
  }
  if (shouldSuppressPush(payload, windowClients, viewing satisfies ViewedObjects)) return

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: payload.icon,
    tag: payload.tag,
    data: {
      domain: payload.domain,
      url: payload.url,
      notificationId: payload.tag
    }
  })
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(handlePush(event.data.json()))
})

async function handleNotificationClick (event: NotificationClickEvent): Promise<void> {
  event.notification.close()
  const { notificationId, url: notificationUrl, domain } = event.notification.data

  if (notificationUrl !== undefined && domain !== undefined) {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const message: NotificationClickMessage = { type: NOTIFICATION_CLICK, url: notificationUrl, _id: notificationId }

    const targetUrl = new URL(notificationUrl)
    for (const client of windowClients) {
      const clientUrl = new URL(client.url, self.location.href)
      if (decodeURI(clientUrl.pathname) === targetUrl.pathname) {
        client.postMessage(message)
        await client.focus()
        return
      }
    }

    for (const client of windowClients) {
      if (client.url.startsWith(domain)) {
        client.postMessage(message)
        await client.focus()
        return
      }
    }

    console.log('No matching client found')
    // If no client with the same URL origin is found, open a new window/tab
    await self.clients.openWindow(notificationUrl)
  }
}

self.addEventListener('notificationclick', (e: NotificationClickEvent) => {
  e.waitUntil(handleNotificationClick(e))
})

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})
