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

// Messages between a tab and the service worker: the worker asks what a tab shows (the reply
// comes back over the port sent along), and tells a tab that a notification was clicked.
export const VIEWING_QUERY = 'viewing-query'
export interface ViewingQueryMessage {
  type: typeof VIEWING_QUERY
}

export const VIEWING_REPLY = 'viewing'
export interface ViewingReplyMessage {
  type: typeof VIEWING_REPLY
  objectIds: Array<Ref<Doc>>
}

export const NOTIFICATION_CLICK = 'notification-click'
export interface NotificationClickMessage {
  type: typeof NOTIFICATION_CLICK
  url?: string
  _id?: string
}

export type PushVisibilityState = 'visible' | 'hidden'

// Chromium lets a focused tab of the origin skip the notification; WebKit revokes the
// subscription after a few silent pushes instead.
export function canSuppressPush (userAgent: string): boolean {
  return !(userAgent.includes('AppleWebKit') && !/Chrom(e|ium)|Edg|OPR/.test(userAgent))
}

export interface PushWindowClient {
  id?: string
  focused: boolean
  visibilityState: PushVisibilityState
  url: string
}

// What each tab reported it shows, by client id; a tab that did not answer is absent.
export type ViewedObjects = ReadonlyMap<string, ReadonlyArray<Ref<Doc>>>

// No push about a document a focused, visible tab shows (main panel or sidebar, as the tab
// reported); for a tab that did not answer, the URL path decides.
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

// A path segment names a document as `<id>`, `<id>|<class>` or `<name>-<id>` (encodeChatURI).
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
