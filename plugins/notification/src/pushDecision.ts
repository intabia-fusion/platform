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

// Messages between a tab and the service worker.

/** The worker asks a tab what it shows; the reply comes back over the port sent with the query. */
export const VIEWING_QUERY = 'viewing-query'
export interface ViewingQueryMessage {
  type: typeof VIEWING_QUERY
}

export const VIEWING_REPLY = 'viewing'
export interface ViewingReplyMessage {
  type: typeof VIEWING_REPLY
  // The main panel's object and the sidebar's, when there is one.
  objectIds: Array<Ref<Doc>>
}

/** The worker tells a tab that a notification was clicked; the tab navigates and drops the app push. */
export const NOTIFICATION_CLICK = 'notification-click'
export interface NotificationClickMessage {
  type: typeof NOTIFICATION_CLICK
  url?: string
  _id?: string
}

export type PushVisibilityState = 'visible' | 'hidden'

/** The part of a service worker `WindowClient` the decision needs. */
export interface PushWindowClient {
  id?: string
  focused: boolean
  visibilityState: PushVisibilityState
  url: string
}

/** What each tab reported it shows, by client id; a tab that did not answer in time is absent. */
export type ViewedObjects = ReadonlyMap<string, ReadonlyArray<Ref<Doc>>>

/**
 * A push about a document the person is looking at right now is noise: the message is already
 * on the screen. "Looking at" means a focused, visible window that shows the document either in
 * its main panel or in the sidebar. The tab reports both when the worker asks (`viewing`); the
 * path is the fallback for a tab that did not answer: it addresses a document as `<id>`,
 * `<id>|<class>` (objects) or `<name>-<id>` (channels and directs, see chunter-resources
 * `encodeChatURI`), and a thread by its root message id.
 */
export function shouldSuppressPush (
  payload: Pick<PushData, 'objectId'>,
  clients: readonly PushWindowClient[],
  viewing?: ViewedObjects
): boolean {
  const objectId = payload.objectId
  if (objectId == null || objectId === '') return false
  return clients.some((client) => {
    if (!client.focused || client.visibilityState !== 'visible') return false
    const reported = client.id !== undefined ? viewing?.get(client.id) : undefined
    return reported?.includes(objectId) === true || pathAddresses(client.url, objectId)
  })
}

function pathAddresses (url: string, objectId: Ref<Doc>): boolean {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return false
  }
  return pathname.split('/').some((segment) => {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      decoded = segment
    }
    return decoded === objectId || decoded.startsWith(`${objectId}|`) || decoded.endsWith(`-${objectId}`)
  })
}
