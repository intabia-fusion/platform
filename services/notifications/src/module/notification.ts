//
// Copyright © 2026 Intabia Fusion Inc.
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

import notificationPlugin, {
  ContextNotification,
  DocNotifyContext,
  NotificationProvider,
  NotificationType,
  UnreadMessage,
  UnreadReaction,
  NotificationIntl,
  CommonNotification,
  UnreadMention,
  PushSubscription,
  getNotificationMessageId,
  translateNotification,
  NotificationTemplate,
  QueueNotifyMessage,
  appendAndCollapseUnreadMessages,
  isNativePushEndpoint
} from '@hcengineering/notification'
import { Class, Doc, generateId, Ref, Space, Markup } from '@hcengineering/core'
import { Receiver } from '@hcengineering/server-notification'
import { ActivityMessage } from '@hcengineering/activity'
import { translate, IntlString } from '@hcengineering/platform'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'
import { markupToHtml } from '@hcengineering/text-html'

import { Client, ObjectDisplayData, NotificationSettings, NotifyProviders, Result, TxCache } from '../types'
import config from '../config'
import { getCreateContextTx, getNotificationUrl, getDomain, getNotificationLocation } from '../utils/utils'
import { isNotificationRecorded } from '../utils/context'
import { type HeldPush, type HeldReadBy } from '../pendingPush'
import { scheduleLetter } from '../heldLetter'

interface CreateNotificationData {
  objectId: Ref<Doc>
  objectClass: Ref<Class<Doc>>
  objectSpace: Ref<Space>

  objectDisplayData: ObjectDisplayData

  notifyProviders: NotifyProviders
  notification: ContextNotification
  intl: NotificationIntl

  unreadMessage?: UnreadMessage
  unreadReaction?: UnreadReaction
  unreadMention?: UnreadMention
  unreadCommon?: CommonNotification

  receiver: Receiver
  pushSubscriptions: PushSubscription[]

  alreadyRead?: boolean

  settings?: NotificationSettings

  // Source markup for the email template. The embedded `notification` carries an excerpt of a
  // long message; the queue and the letter get the whole text.
  markup?: Markup
}

export async function pushNotification (
  client: Client,
  txCache: TxCache,
  result: Result,
  context: DocNotifyContext | undefined,
  _data: CreateNotificationData
): Promise<void> {
  const data: CreateNotificationData =
    _data.alreadyRead === true ? { ..._data, notifyProviders: inboxProvidersOnly(_data.notifyProviders) } : _data
  const {
    notification,
    unreadMessage,
    unreadReaction,
    unreadCommon,
    unreadMention,
    receiver,
    objectId,
    objectClass,
    objectSpace,
    notifyProviders,
    intl,
    objectDisplayData,
    pushSubscriptions
  } = data

  if (context != null && isNotificationRecorded(context, data)) {
    // Redelivered tx: the first pass already wrote this notification into the context.
    client.ctx.info('notification already recorded, skipping', {
      contextId: context._id,
      notificationId: notification.id,
      type: notification.type
    })
    return
  }

  const isUnread = unreadMessage != null || unreadReaction != null || unreadMention != null || unreadCommon != null

  const { txFactory } = client
  const modifiedOn = Math.max(context?.lastNotify ?? 0, data.notification.createdOn)
  const providers: Record<Ref<NotificationProvider>, Ref<NotificationType>[]> = Object.fromEntries(
    Object.entries(notifyProviders).map(([provider, types]) => [provider, types.map((it) => it._id)])
  ) as Record<Ref<NotificationProvider>, Ref<NotificationType>[]>

  const { title, body } = await translateNotification(intl, receiver.language)
  const domain = getDomain(client)
  const contextId = context?._id ?? generateId<DocNotifyContext>()
  const url = getNotificationUrl(client, contextId, notification, objectId, objectClass)

  if (hasDeliveryProvider(notifyProviders)) {
    const message: QueueNotifyMessage = {
      id: notification.id,
      title,
      body,
      url,
      domain,
      pushSubscriptions,
      language: receiver.language,
      account: receiver.account,
      providers,
      objectId,
      objectClass,
      objectSpace,
      createdOn: data.notification.createdOn,
      template: await getTemplate(client, txCache, notification, notifyProviders, intl, receiver, url, data.markup)
    }
    const native = pushSubscriptions.filter((it) => isNativePushEndpoint(it.endpoint))
    const web = pushSubscriptions.filter((it) => !isNativePushEndpoint(it.endpoint))
    // Only an unread notification can be read later, so only such a one waits.
    const readBy = heldReadBy(data)
    const heldPart = (provider: Ref<NotificationProvider>, part: Partial<QueueNotifyMessage>): HeldPush | undefined =>
      readBy === undefined
        ? undefined
        : {
            account: receiver.account,
            notificationId: notification.id,
            objectId,
            createdOn: data.notification.createdOn,
            readBy,
            provider,
            message: { ...message, ...part }
          }
    // While the receiver is at the computer, the push to their phone waits (client.pendingPush,
    // in memory) for them to read the notification there first; the browser gets its push at once.
    const holdsPush =
      client.pendingPush !== undefined &&
      readBy !== undefined &&
      receiver.online &&
      !receiver.away &&
      native.length > 0 &&
      (notifyProviders[notificationPlugin.providers.PushNotificationProvider]?.length ?? 0) > 0
    if (holdsPush) {
      const push = heldPart(notificationPlugin.providers.PushNotificationProvider, {
        pushSubscriptions: native,
        providers: pushProvidersOnly(providers),
        template: undefined
      })
      if (push !== undefined) client.pendingPush?.hold(push)
    }
    // A letter waits its own, longer while wherever the person is (it is for what they did not
    // see), in the time machine rather than in memory.
    const letters = readBy !== undefined ? letterHolds(client, data) : []
    for (const letter of letters) {
      const held = heldPart(letter.provider, { pushSubscriptions: [], providers: onlyProviders(providers, [letter.provider]) })
      if (held !== undefined) scheduleLetter(result, held, letter.holdMs)
    }

    const heldProviders = [...(holdsPush ? pushProviders() : []), ...letters.map((it) => it.provider)]
    const immediate: QueueNotifyMessage = {
      ...message,
      pushSubscriptions: holdsPush ? web : pushSubscriptions,
      providers: letters.length > 0 ? withoutProviders(providers, letters.map((it) => it.provider)) : providers,
      template: letters.length > 0 ? undefined : message.template
    }
    if ((holdsPush && web.length > 0) || hasDeliveryProvider(withoutNotifyProviders(notifyProviders, heldProviders))) {
      result.queueMessages.push(immediate)
    }
  }
  if (context != null) {
    const updateTx = txFactory.createTxUpdateDoc(context._class, context.space, context._id, {})

    updateTx.operations.lastNotify = Math.max(modifiedOn, updateTx.operations.lastNotify ?? 0)
    updateTx.operations.$push = {
      latestNotifications: { $each: [notification], $position: 0, $slice: config.LatestNotificationsSliceSize }
    }
    if (isUnread) {
      updateTx.operations.$inc = { unreadCount: 1 }

      if (unreadMessage != null) {
        const { collapsed, didCollapse } = appendAndCollapseUnreadMessages(context.unreadMessages ?? [], unreadMessage)
        if (didCollapse) {
          updateTx.operations.unreadMessages = collapsed
        } else {
          updateTx.operations.$push = {
            ...updateTx.operations.$push,
            unreadMessages: unreadMessage
          }
        }
      } else if (unreadReaction != null) {
        updateTx.operations.$push = {
          ...updateTx.operations.$push,
          unreadReactions: unreadReaction
        }
      } else if (unreadMention != null) {
        updateTx.operations.$push = {
          ...updateTx.operations.$push,
          unreadMentions: unreadMention
        }
      } else if (unreadCommon != null) {
        updateTx.operations.$push = {
          ...updateTx.operations.$push,
          unreadCommons: unreadCommon
        }
      }
    }

    result.updateContextTx.push(updateTx)
  } else {
    const createTx = getCreateContextTx(
      contextId,
      objectId,
      objectClass,
      objectSpace,
      receiver,
      result,
      client.txFactory,
      objectDisplayData
    )

    createTx.attributes.lastNotify = Math.max(createTx.attributes.lastNotify ?? 0, modifiedOn)
    createTx.attributes.latestNotifications = [notification, ...createTx.attributes.latestNotifications].slice(
      0,
      config.LatestNotificationsSliceSize
    )
    createTx.attributes.unreadCount = isUnread
      ? (createTx.attributes.unreadCount ?? 0) + 1
      : (createTx.attributes.unreadCount ?? 0)
    if (isUnread) {
      if (unreadMessage != null) {
        const currentUnread = createTx.attributes.unreadMessages ?? []
        createTx.attributes.unreadMessages = [...currentUnread, unreadMessage]
      } else if (unreadReaction != null) {
        createTx.attributes.unreadReactions = [...(createTx.attributes.unreadReactions ?? []), unreadReaction]
      } else if (unreadMention != null) {
        createTx.attributes.unreadMentions = [...(createTx.attributes.unreadMentions ?? []), unreadMention]
      } else if (unreadCommon != null) {
        createTx.attributes.unreadCommons = [...(createTx.attributes.unreadCommons ?? []), unreadCommon]
      }
    }
  }

  createAppPushNotification(client, result, data, contextId)
}

// A message is read by the chat's read position; the rest by the
// explicit lists of a ReadNotificationAction. A notification recorded as read has nothing to wait for.
function heldReadBy (data: CreateNotificationData): HeldReadBy | undefined {
  if (data.unreadMessage != null) return 'position'
  if (data.unreadReaction != null) return 'reactions'
  if (data.unreadMention != null) return 'mentions'
  if (data.unreadCommon != null) return 'commons'
  return undefined
}

interface LetterHold {
  provider: Ref<NotificationProvider>
  holdMs: number
}

// Providers with a hold window of their own (`NotificationProvider.holdMs`, the letter) that
// deliver this notification: the receiver's setting wins over the provider's default, zero
// means at once.
function letterHolds (client: Client, data: CreateNotificationData): LetterHold[] {
  const holds: LetterHold[] = []
  for (const provider of client.model.findAllSync(notificationPlugin.class.NotificationProvider, {})) {
    if (provider.holdMs === undefined) continue
    if ((data.notifyProviders[provider._id]?.length ?? 0) === 0) continue
    const setting = data.settings?.settingsByProvider
      .get(provider._id)
      ?.find((it) => it.createdBy !== undefined && data.receiver.socialIds.includes(it.createdBy))
    const holdMs = setting?.holdMs ?? provider.holdMs
    if (holdMs > 0) holds.push({ provider: provider._id, holdMs })
  }
  return holds
}

function inboxProvidersOnly (providers: NotifyProviders): NotifyProviders {
  const inbox = providers[notificationPlugin.providers.InboxNotificationProvider]
  return inbox != null ? { [notificationPlugin.providers.InboxNotificationProvider]: inbox } : {}
}

type ProviderRef = Ref<NotificationProvider>

// Push and its dependent Sound: the providers a held (native) push carries on its own. Read on
// call, not at import: the module tests mock the plugin lazily.
function pushProviders (): ProviderRef[] {
  return [notificationPlugin.providers.PushNotificationProvider, notificationPlugin.providers.SoundNotificationProvider]
}

// The entries of a provider map, keyed as the refs they are (Object.entries widens keys to string).
function providerEntries<T> (providers: Record<ProviderRef, T>): Array<[ProviderRef, T]> {
  return Object.entries(providers) as Array<[ProviderRef, T]>
}

function withoutNotifyProviders (providers: NotifyProviders, excluded: ProviderRef[]): NotifyProviders {
  return Object.fromEntries(providerEntries(providers).filter(([provider]) => !excluded.includes(provider)))
}

function pushProvidersOnly (providers: QueueNotifyMessage['providers']): QueueNotifyMessage['providers'] {
  return onlyProviders(providers, pushProviders())
}

function onlyProviders (providers: QueueNotifyMessage['providers'], kept: ProviderRef[]): QueueNotifyMessage['providers'] {
  return Object.fromEntries(providerEntries(providers).filter(([provider]) => kept.includes(provider)))
}

function withoutProviders (
  providers: QueueNotifyMessage['providers'],
  excluded: ProviderRef[]
): QueueNotifyMessage['providers'] {
  return Object.fromEntries(providerEntries(providers).filter(([provider]) => !excluded.includes(provider)))
}

function hasDeliveryProvider (providers: NotifyProviders): boolean {
  return Object.entries(providers).some(
    ([provider, types]) => provider !== notificationPlugin.providers.InboxNotificationProvider && types.length > 0
  )
}

function createAppPushNotification (
  client: Client,
  result: Result,
  data: CreateNotificationData,
  contextId: Ref<DocNotifyContext>
): void {
  const { txFactory } = client
  const { notification, notifyProviders, objectId, objectClass, receiver, intl } = data
  const shouldPush = (notifyProviders[notificationPlugin.providers.PushNotificationProvider]?.length ?? 0) > 0

  if (shouldPush) {
    const messageId: Ref<ActivityMessage> | undefined = getNotificationMessageId(notification)
    const { path, query } = getNotificationLocation(client, contextId, notification, objectId, objectClass)

    const soundAlert = (notifyProviders[notificationPlugin.providers.SoundNotificationProvider]?.length ?? 0) > 0

    const appNotificationTx = txFactory.createTxCreateDoc(
      notificationPlugin.class.AppPushNotification,
      receiver.space,
      {
        ...intl,
        account: receiver.account,
        sender: notification.createdBy,
        tag: notification.id,
        objectId,
        objectClass,
        messageId,
        onClickLocation: {
          path,
          query
        },
        soundAlert
      }
    )

    result.createAppPushNotificationTx.push(appNotificationTx)
  }
}

async function getTemplate (
  client: Client,
  txCache: TxCache,
  notification: ContextNotification,
  providers: NotifyProviders,
  intl: NotificationIntl,
  receiver: Receiver,
  inboxUrl: string,
  markup?: Markup
): Promise<QueueNotifyMessage['template']> {
  const types = (providers[notificationPlugin.providers.InboxNotificationProvider] ?? []).filter(
    (it) => it.templates != null
  )

  if (types.length === 0) return undefined
  const type = types[0]

  const cacheKey = `${type._id}:${receiver.language}`
  const templateCached = txCache.templates.get(cacheKey)

  if (templateCached != null) {
    return templateCached
  }

  try {
    const content = await translateTemplate(
      client,
      type,
      intl,
      receiver,
      inboxUrl,
      markup ?? getNotificationMarkup(notification)
    )
    if (content != null) {
      const subject = content.subject
      const text = content.text
      const html = content.html

      const template = { subject, text, html }
      txCache.templates.set(cacheKey, template)
      return template
    }
  } catch (e) {
    client.ctx.error('Failed to generate template', { e, notificationId: notification.id })
  }
}

function getNotificationMarkup (notification: ContextNotification): Markup | undefined {
  if (notification.type === 'message' || notification.type === 'reaction') {
    return notification.message?.message
  }
  return notification.markup
}

async function translateTemplate (
  client: Client,
  type: NotificationType,
  intl: NotificationIntl,
  receiver: Receiver,
  inboxUrl: string,
  markup: Markup | undefined
): Promise<QueueNotifyMessage['template']> {
  const templates: NotificationTemplate = type?.templates ?? {
    text: notificationPlugin.emailTemplate.GeneratedNotificationText,
    html: notificationPlugin.emailTemplate.GeneratedNotificationHtml,
    subject: notificationPlugin.emailTemplate.GeneratedNotificationSubject
  }

  const language = receiver.language

  const params: Record<string, any> = { ...intl.intlParams }

  if (intl.intlParamsNotLocalized != null) {
    for (const [k, v] of Object.entries(intl.intlParamsNotLocalized)) {
      if (v != null) {
        params[k] = await translate(v, params, language)
      }
    }
  }

  params.sender = intl.intlParams.senderName

  const title = intl.intlParams?.title ?? intl.intlParams.doc ?? ''
  const url = intl.intlParams.url
  const identifier = intl.intlParams?.identifier

  const textTitle = identifier != null ? `${identifier}: ${title}` : title.toString()
  const htmlTitle = url !== '' ? `<a href='${url}'>${textTitle}</a>` : textTitle.toString()

  const app = client.branding?.title ?? 'Platform'
  const inboxLinkText = await translate(notificationPlugin.string.ViewIn, { app }, language)

  params.link = `<a href='${inboxUrl}'>${inboxLinkText}</a>`

  let bodyText: string
  let bodyHtml: string

  if (markup != null && markup !== '' && !isEmptyMarkup(markup)) {
    const textMessage = markupToText(markup)
    let htmlMessage = textMessage
    try {
      htmlMessage = markupToHtml(JSON.parse(markup))
    } catch (e) {
      // Fallback to plain text if markup JSON parsing fails
    }

    params.message = textMessage
    bodyText = await translate(intl.bodyIntl, params, language)

    params.message = htmlMessage
    bodyHtml = await translate(intl.bodyIntl, params, language)
  } else {
    bodyText = await translate(intl.bodyIntl, params, language)
    bodyHtml = bodyText
  }

  const text = await fillTemplate(templates.text, textTitle, { ...params, body: bodyText }, language)
  const html = await fillTemplate(templates.html, htmlTitle, { ...params, body: bodyHtml }, language)
  const subject = await fillTemplate(templates.subject, textTitle, { ...params, body: bodyText }, language)

  return {
    text,
    html,
    subject
  }
}

async function fillTemplate (
  template: IntlString,
  doc: string,
  params: Record<string, string | number>,
  lang: string
): Promise<string> {
  return await translate(
    template,
    {
      ...params,
      doc
    },
    lang
  )
}
