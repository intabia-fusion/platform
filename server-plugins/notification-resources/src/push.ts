//
// Copyright © 2025 Hardcore Engineering Inc.
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

import serverCore, { TriggerControl } from '@hcengineering/server-core'
import serverNotification from '@hcengineering/server-notification'
import { AccountUuid, Class, concatLink, Doc, Hierarchy, Ref, Tx, TxCreateDoc, TxProcessor } from '@hcengineering/core'
import notification, {
  ActivityInboxNotification,
  getNotificationMessageId,
  getNotificationThreadId,
  InboxNotification,
  MentionInboxNotification,
  notificationId,
  PushData,
  PushSubscription
} from '@hcengineering/notification'
import activity, { ActivityMessage } from '@hcengineering/activity'
import serverView from '@hcengineering/server-view'
import { getMetadata, getResource } from '@hcengineering/platform'
import { workbenchId } from '@hcengineering/workbench'
import { encodeObjectURI } from '@hcengineering/view'
import { PersonSpace } from '@hcengineering/contact'
import chunter, { ThreadMessage } from '@hcengineering/chunter'

import { getTranslatedNotificationContent } from './utils'

async function createPush (
  control: TriggerControl,
  n: InboxNotification,
  receiver: AccountUuid,
  soundAlert: boolean,
  receiverSpace: Ref<PersonSpace>,
  subscriptions: PushSubscription[]
): Promise<Tx | undefined> {
  const { title, body } = await getTranslatedNotificationContent(n, control.branding?.defaultLanguage ?? 'en')

  const objectIdentity = await getObjectIdentity(n, control)

  const linkProviders = control.modelDb.findAllSync(serverView.mixin.ServerLinkIdProvider, {})
  const provider = linkProviders.find(({ _id }) => _id === objectIdentity._class)

  let id: string = objectIdentity._id

  if (provider !== undefined) {
    const encodeFn = await getResource(provider.encode)
    const cache: Map<Ref<Doc>, Doc> = control.contextCache.get('PushNotificationsHandler') ?? new Map()
    const doc =
      cache.get(objectIdentity._id) ??
      (await control.findAll(control.ctx, objectIdentity._class, { _id: objectIdentity._id }))[0]

    if (doc === undefined) {
      return
    }

    cache.set(doc._id, doc)
    control.contextCache.set('PushNotificationsHandler', cache)

    id = await encodeFn(doc, control)
  }

  const messageId = getNotificationMessageId(n, control.hierarchy)
  const threadId = getNotificationThreadId(n, control.hierarchy)
  const path =
    threadId != null
      ? [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, n.objectClass), threadId]
      : [workbenchId, control.workspace.url, notificationId, encodeObjectURI(id, n.objectClass)]
  const query = messageId != null ? { message: messageId } : undefined

  if (subscriptions.length > 0) {
    await createPushNotification(control, receiver, title, body, n._id, subscriptions, path, query)
  }

  const messageInfo = getMessageInfo(n, control.hierarchy)
  return control.txFactory.createTxCreateDoc(notification.class.BrowserNotification, receiverSpace, {
    user: receiver,
    title: n.title ?? notification.string.CommonNotificationTitle,
    body: n.body ?? notification.string.UpdateNotificationBody,
    intlParams: n.intlParams ?? { title },
    intlParamsNotLocalized: n.intlParamsNotLocalized,
    sender: n.createdBy ?? n.modifiedBy,
    tag: n._id,
    objectId: n.objectId,
    objectClass: n.objectClass,
    messageId: messageInfo._id,
    messageClass: messageInfo._class,
    onClickLocation: {
      path
    },
    soundAlert
  })
}

function getMessageInfo (
  n: InboxNotification,
  hierarchy: Hierarchy
): {
    _id?: Ref<ActivityMessage>
    _class?: Ref<Class<ActivityMessage>>
  } {
  if (hierarchy.isDerived(n._class, notification.class.ActivityInboxNotification)) {
    const activityNotification = n as ActivityInboxNotification

    if (
      activityNotification.attachedToClass === activity.class.DocUpdateMessage &&
      hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
    ) {
      return {
        _id: activityNotification.objectId as Ref<ActivityMessage>,
        _class: activityNotification.objectClass
      }
    }

    return {
      _id: activityNotification.attachedTo,
      _class: activityNotification.attachedToClass
    }
  }

  if (hierarchy.isDerived(n._class, notification.class.MentionInboxNotification)) {
    const mentionNotification = n as MentionInboxNotification
    if (hierarchy.isDerived(mentionNotification.mentionedInClass, activity.class.ActivityMessage)) {
      return {
        _id: mentionNotification.mentionedIn as Ref<ActivityMessage>,
        _class: mentionNotification.mentionedInClass
      }
    }
  }

  return {}
}

export async function createPushNotification (
  control: TriggerControl,
  target: AccountUuid,
  title: string,
  body: string,
  _id: string,
  subscriptions: PushSubscription[],
  path?: string[],
  query?: Record<string, string>
): Promise<void> {
  const pushURL: string | undefined = getMetadata(serverNotification.metadata.WebPushUrl)
  // TODO: Remove auth token after migration to new services
  const authToken: string | undefined = getMetadata(serverNotification.metadata.MailAuthToken)
  if (pushURL === undefined || pushURL === '') return
  const userSubscriptions = subscriptions.filter((it) => it.user === target)
  const data: PushData = {
    title,
    body
  }
  if (_id !== undefined) {
    data.tag = _id
  }
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const domainPath = `${workbenchId}/${control.workspace.url}`
  data.domain = concatLink(front, domainPath)
  if (path !== undefined) {
    let url = concatLink(front, path.join('/'))
    if (query !== undefined) {
      const searchParams = new URLSearchParams(query)
      url += '?' + searchParams.toString()
    }
    data.url = url
  }

  void sendPushToSubscription(pushURL, authToken, control, target, userSubscriptions, data)
}

async function sendPushToSubscription (
  pushURL: string,
  mailAuth: string | undefined,
  control: TriggerControl,
  targetUser: AccountUuid,
  subscriptions: PushSubscription[],
  data: PushData
): Promise<void> {
  try {
    const result: Ref<PushSubscription>[] = (
      await (
        await fetch(concatLink(pushURL, '/web-push'), {
          method: 'post',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(mailAuth != null ? { Authorization: `Bearer ${mailAuth}` } : {})
          },
          body: JSON.stringify({
            subscriptions,
            data
          })
        })
      ).json()
    ).result
    if (result.length > 0) {
      const domain = control.hierarchy.findDomain(notification.class.PushSubscription)
      if (domain !== undefined) {
        await control.lowLevel.clean(control.ctx, domain, result)
      }
    }
  } catch (err) {
    control.ctx.info('Cannot send push notification to', { user: targetUser, err })
  }
}

export async function PushNotificationsHandler (
  txes: TxCreateDoc<InboxNotification>[],
  control: TriggerControl
): Promise<Tx[]> {
  const all: InboxNotification[] = txes
    .map((tx) => TxProcessor.createDoc2Doc(tx))
    .filter((it) => (it.allowedProviders?.[notification.providers.PushNotificationProvider]?.length ?? 0) !== 0)

  if (all.length === 0) return []

  const receivers = new Set(all.map((it) => it.user))
  const subscriptions = (await control.queryFind(control.ctx, notification.class.PushSubscription, {})).filter((it) =>
    receivers.has(it.user)
  )

  const subscriptionSettings = await control.queryFind(control.ctx, notification.class.PushSubscriptionSetting, {})
  const filteredSubscriptions = subscriptions.filter((sub) => {
    const setting = subscriptionSettings.find(({ attachedTo }) => attachedTo === sub._id)
    return setting?.enabled !== false
  })
  const res: Tx[] = []

  for (const inboxNotification of all) {
    const { user } = inboxNotification
    const userSubscriptions = filteredSubscriptions.filter((it) => it.user === user)

    const soundAlert =
      (inboxNotification.allowedProviders?.[notification.providers.SoundNotificationProvider]?.length ?? 0) > 0
    const tx = await createPush(
      control,
      inboxNotification,
      user,
      soundAlert,
      inboxNotification.space,
      userSubscriptions
    )

    if (tx !== undefined) {
      res.push(tx)
    }
  }

  return res
}

async function getObjectIdentity (
  inboxNotification: InboxNotification,
  control: TriggerControl
): Promise<Pick<Doc, '_id' | '_class'>> {
  const { hierarchy } = control
  if (!hierarchy.isDerived(inboxNotification._class, notification.class.ActivityInboxNotification)) {
    return {
      _id: inboxNotification.objectId,
      _class: inboxNotification.objectClass
    }
  }

  const activityNotification = inboxNotification as ActivityInboxNotification

  if (
    hierarchy.isDerived(activityNotification.attachedToClass, chunter.class.ThreadMessage) &&
    hierarchy.isDerived(activityNotification.objectClass, activity.class.ActivityMessage)
  ) {
    const attachedTo = (
      await control.findAll<ThreadMessage>(control.ctx, activityNotification.attachedToClass, {
        _id: activityNotification.attachedTo as Ref<ThreadMessage>
      })
    )[0]

    if (attachedTo != null) {
      return { _id: attachedTo.objectId, _class: attachedTo.objectClass }
    }
  }

  return { _id: activityNotification.objectId, _class: activityNotification.objectClass }
}
