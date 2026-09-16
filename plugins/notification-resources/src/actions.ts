/**
 Copyright © 2026 Intabia Fusion.

 Licensed under the Eclipse Public License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License. You may
 obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

 See the License for the specific language governing permissions and
 limitations under the License.
 */

import notification, { type DocNotifyContext } from '@hcengineering/notification'
import {
  closePanel,
  getCurrentLocation,
  getEventPositionElement,
  type Location,
  locationStorageKeyId,
  navigate,
  showPopup
} from '@hcengineering/ui'
import { decodeObjectURI } from '@hcengineering/view'
import core, {
  type Class,
  type Doc,
  generateId,
  getClassCollaborators,
  getCurrentAccount,
  type Ref,
  type Space,
  type TxOperations
} from '@hcengineering/core'
import { getClient, MessageBox } from '@hcengineering/presentation'
import { type ActivityMessage } from '@hcengineering/activity'
import { NotificationClientImpl } from './client'

export async function canReadNotifyContext (doc: DocNotifyContext): Promise<boolean> {
  return doc.unreadCount > 0
}

export async function readNotifyContext (doc: DocNotifyContext): Promise<void> {
  const inboxClient = NotificationClientImpl.getClient()
  const me = getCurrentAccount()
  const ops = getClient().apply(undefined, 'readNotifyContext', true)
  try {
    const state = await inboxClient.getReadState(doc.objectId)
    if (state != null) {
      await ops.update(state, {
        [me.uuid]: {
          messageId: generateId<ActivityMessage>(),
          timestamp: Date.now()
        }
      })
    }
    await ops.update(doc, {
      unreadCount: 0,
      unreadMessages: [],
      unreadCommons: [],
      unreadMentions: [],
      unreadReactions: []
    })
  } finally {
    await ops.commit()
  }
}

export async function removeDocNotifyContext (context?: DocNotifyContext): Promise<void> {
  if (context === undefined) return

  const inboxClient = NotificationClientImpl.getClient()
  const me = getCurrentAccount()
  const client = getClient()

  await client.remove(context)

  const state = await inboxClient.getReadState(context.objectId)
  if (state != null) {
    await client.update(state, {
      [me.uuid]: {
        messageId: generateId<ActivityMessage>(),
        timestamp: Date.now()
      }
    })
  }
}

export async function subscribeDoc (
  client: TxOperations,
  docClass: Ref<Class<Doc>>,
  docId: Ref<Doc>,
  op: 'add' | 'remove',
  doc?: Doc
): Promise<void> {
  const myAcc = getCurrentAccount()
  const hierarchy = client.getHierarchy()
  const classCollaborators = getClassCollaborators(client.getModel(), hierarchy, docClass)
  if (classCollaborators === undefined) return

  const target = doc ?? (await client.findOne(docClass, { _id: docId }))
  if (target === undefined) return
  const current = await client.findOne(core.class.Collaborator, {
    attachedTo: docId,
    collaborator: myAcc.uuid
  })
  if (op === 'remove') {
    if (current === undefined) return // already removed
    await client.remove(current)
  } else {
    if (current !== undefined) return // already added
    await client.addCollection(core.class.Collaborator, target.space, target._id, target._class, 'collaborators', {
      collaborator: myAcc.uuid
    })
  }
}

export async function unsubscribe (context: DocNotifyContext): Promise<void> {
  const client = getClient()
  const hierarchy = client.getHierarchy()
  const isSpace = hierarchy.isDerived(context.objectClass, core.class.Space)
  const params = { name: context.objectTitle }

  showPopup(
    MessageBox,
    {
      label: isSpace
        ? notification.string.UnsubscribeSpaceConfirmationTitle
        : notification.string.UnsubscribeConfirmationTitle,
      labelProps: params,
      message: isSpace
        ? notification.string.UnsubscribeSpaceConfirmationMessage
        : notification.string.UnsubscribeConfirmationMessage,
      params,
      dangerous: true,
      action: async () => {
        if (isSpace) {
          const space = await client.findOne(core.class.Space, { _id: context.objectId as Ref<Space> })
          if (space === undefined) return
          await client.update(space, { $pull: { members: getCurrentAccount().uuid } })
          closeObjectLocation(context.objectId)
        } else {
          await subscribeDoc(client, context.objectClass, context.objectId, 'remove')
        }
      }
    },
    'top'
  )
}

function closeObjectLocation (objectId: Ref<Doc>): void {
  closePanel()
  forgetSavedLocations(objectId)

  const loc = getCurrentLocation()
  const [locId] = decodeObjectURI(loc.path[3] ?? '')
  if (locId !== objectId) return

  loc.path.length = 3
  loc.query = {}
  loc.fragment = undefined
  navigate(loc)
}

function forgetSavedLocations (objectId: Ref<Doc>): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(locationStorageKeyId)) continue
      const raw = localStorage.getItem(key)
      if (raw?.includes(objectId) !== true) continue
      const [locId] = decodeObjectURI((JSON.parse(raw) as Location).path[3] ?? '')
      if (locId === objectId) localStorage.removeItem(key)
    }
  } catch (err) {
    console.error('Failed to clear saved locations', err)
  }
}

export async function subscribe (docClass: Ref<Class<Doc>>, docId: Ref<Doc>): Promise<void> {
  const client = getClient()
  await subscribeDoc(client, docClass, docId, 'add')
}

export async function clearAll (): Promise<void> {
  const client = NotificationClientImpl.getClient()

  showPopup(
    MessageBox,
    {
      label: notification.string.RemoveAllConfirmationTitle,
      message: notification.string.RemoveAllConfirmationMessage,
      action: async () => {
        await client.clearAll()
      }
    },
    'top'
  )
}

export async function readAll (): Promise<void> {
  const client = NotificationClientImpl.getClient()

  await client.readAll()
}

export async function editDocNotificationsVisibilityTester (doc: Doc | Doc[] | undefined): Promise<boolean> {
  if (doc == null) return false
  const object = Array.isArray(doc) ? doc[0] : doc
  if (object == null) return false

  const client = getClient()
  const classCollaborators = getClassCollaborators(client.getModel(), client.getHierarchy(), object._class)
  if (classCollaborators === undefined) return false
  const collaborator = await client.findOne(core.class.Collaborator, {
    attachedTo: object._id,
    collaborator: getCurrentAccount().uuid
  })

  return collaborator != null
}

export async function editDocNotificationsAction (doc: Doc | Doc[], evt: MouseEvent): Promise<void> {
  const value = Array.isArray(doc) ? doc[0] : doc
  showPopup(notification.component.MutePopup, { value }, getEventPositionElement(evt))
}
