//
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022 Hardcore Engineering Inc.
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

import activity, { ActivityMessage, DocUpdateMessage } from '@hcengineering/activity'
import { Analytics } from '@hcengineering/analytics'
import chunter, { ChatMessage } from '@hcengineering/chunter'
import contact, { Employee, type Person } from '@hcengineering/contact'
import core, {
  AccountUuid,
  AnyAttribute,
  AttachedDoc,
  Class,
  Collaborator,
  Collection,
  combineAttributes,
  Data,
  Doc,
  getClassCollaborators,
  MeasureContext,
  PersonId,
  readOnlyGuestAccountUuid,
  Ref,
  SortingOrder,
  Space,
  Timestamp,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxMixin,
  TxProcessor,
  TxRemoveDoc,
  TxUpdateDoc
} from '@hcengineering/core'
import notification, {
  ActivityInboxNotification,
  CommonInboxNotification,
  DocNotifyContext,
  InboxNotification,
  MentionInboxNotification,
  NotificationType
} from '@hcengineering/notification'
import { getResource, translate } from '@hcengineering/platform'
import { getAccountBySocialId } from '@hcengineering/server-contact'
import { type TriggerControl } from '@hcengineering/server-core'
import { NOTIFICATION_BODY_SIZE, ReceiverInfo, SenderInfo } from '@hcengineering/server-notification'
import { markupToText, stripTags } from '@hcengineering/text-core'
import { getCollaboratorsByTx } from '@hcengineering/server-contact-resources'

import { PushNotificationsHandler } from './push'
import {
  AvailableProvidersCache,
  AvailableProvidersCacheKey,
  Content,
  ContextsCache,
  ContextsCacheKey,
  NotifyParams,
  NotifyResult
} from './types'
import {
  getHTMLPresenter,
  getNotificationContent,
  getNotificationLink,
  getNotificationProviderControl,
  getObjectSpace,
  getReceiversInfo,
  getSenderInfo,
  getTextPresenter,
  isShouldNotifyTx,
  isUserEmployeeInFieldValueTypeMatch,
  mentionTypeMatch,
  messageToMarkup,
  type NotificationProviderControl,
  replaceAll,
  updateNotifyContextsSpace
} from './utils'

export async function getCommonNotificationTxes (
  ctx: MeasureContext,
  control: TriggerControl,
  doc: Doc,
  data: Partial<Data<CommonInboxNotification>>,
  receiver: ReceiverInfo,
  sender: SenderInfo,
  attachedTo: Ref<Doc>,
  attachedToClass: Ref<Class<Doc>>,
  space: Ref<Space>,
  modifiedOn: Timestamp,
  notifyResult: NotifyResult,
  _class = notification.class.CommonInboxNotification,
  tx?: TxCUD<Doc>
): Promise<Tx[]> {
  if (notifyResult.size === 0 || !notifyResult.has(notification.providers.InboxNotificationProvider)) {
    return []
  }

  const res: Tx[] = []
  const notifyContexts = await control.findAll(ctx, notification.class.DocNotifyContext, { objectId: attachedTo })

  await pushInboxNotifications(
    ctx,
    control,
    res,
    receiver,
    sender,
    attachedTo,
    attachedToClass,
    space,
    notifyContexts,
    data,
    _class,
    modifiedOn,
    [],
    true,
    tx
  )

  return res
}

async function getTextPart (doc: Doc, control: TriggerControl): Promise<string | undefined> {
  const TextPresenter = getTextPresenter(doc._class, control.hierarchy)

  if (TextPresenter === undefined) return
  return await (
    await getResource(TextPresenter.presenter)
  )(doc, control)
}

async function getHtmlPart (doc: Doc, control: TriggerControl): Promise<string | undefined> {
  const HTMLPresenter = getHTMLPresenter(doc._class, control.hierarchy)
  return HTMLPresenter != null ? await (await getResource(HTMLPresenter.presenter))(doc, control) : undefined
}

function fillTemplate (
  template: string,
  sender: string,
  doc: string,
  data: string,
  params: Record<string, string> = {}
): string {
  let res = replaceAll(template, '{sender}', sender)
  res = replaceAll(res, '{doc}', doc)
  res = replaceAll(res, '{data}', data)

  for (const key in params) {
    res = replaceAll(res, `{${key}}`, params[key])
  }
  return res
}

export async function getContentByTemplate (
  doc: Doc | undefined,
  sender: string,
  type: Ref<NotificationType>,
  control: TriggerControl,
  data: string,
  notificationData?: InboxNotification,
  message?: ActivityMessage
): Promise<Content | undefined> {
  if (doc === undefined) return
  const notificationType = control.modelDb.getObject(type)
  if (notificationType.templates === undefined) return

  const params: Record<string, string> =
    notificationData !== undefined
      ? await getTranslatedNotificationContent(notificationData, notificationData._class, control)
      : {}

  let textPart = await getTextPart(doc, control)
  if (textPart === undefined) {
    if (
      notificationData !== undefined &&
      control.hierarchy.isDerived(notificationData._class, notification.class.CommonInboxNotification)
    ) {
      textPart = params.title ?? params.body ?? ''
    }
    if (textPart === undefined || textPart === '') return
  }

  if (
    notificationData !== undefined &&
    control.hierarchy.isDerived(notificationData._class, notification.class.MentionInboxNotification)
  ) {
    const messageContent = (notificationData as MentionInboxNotification).messageHtml
    const text = messageContent !== undefined ? markupToText(messageContent) : undefined
    params.body = text ?? params.body
    params.message = text ?? params.message
  }

  if (message !== undefined) {
    const markup = await messageToMarkup(control, message)
    params.message = markup !== undefined ? markupToText(markup) : (params.message ?? '')
  } else if (params.message === undefined) {
    params.message = params.body ?? ''
  }

  const link = await getNotificationLink(control, doc, message?._id)
  const app = control.branding?.title ?? 'Huly'
  const linkText = await translate(notification.string.ViewIn, { app })

  params.link = `<a href='${link}'>${linkText}</a>`

  const text = fillTemplate(notificationType.templates.textTemplate, sender, textPart, data, params)
  const htmlPart = await getHtmlPart(doc, control)
  const html = fillTemplate(notificationType.templates.htmlTemplate, sender, htmlPart ?? textPart, data, params)
  const subject = fillTemplate(notificationType.templates.subjectTemplate, sender, textPart, data, params)

  if (subject === '') return

  return {
    text,
    html,
    subject
  }
}

export async function pushInboxNotifications (
  ctx: MeasureContext,
  control: TriggerControl,
  res: Tx[],
  receiver: ReceiverInfo,
  sender: SenderInfo,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  contexts: DocNotifyContext[],
  data: Partial<Data<InboxNotification>>,
  _class: Ref<Class<InboxNotification>>,
  modifiedOn: Timestamp,
  types: Ref<NotificationType>[],
  shouldUpdateTimestamp = true,
  tx?: TxCUD<Doc>
): Promise<TxCreateDoc<InboxNotification> | undefined> {
  const context = getDocNotifyContext(control, contexts, objectId, receiver.account)
  let docNotifyContextId: Ref<DocNotifyContext>

  if (context === undefined) {
    docNotifyContextId = await createNotifyContext(
      ctx,
      control,
      objectId,
      objectClass,
      objectSpace,
      receiver,
      sender.socialId,
      shouldUpdateTimestamp ? modifiedOn : undefined,
      tx
    )
  } else {
    docNotifyContextId = context._id
  }

  const notificationData = {
    user: receiver.account,
    isViewed: receiver.role === 'GUEST' && receiver.account === readOnlyGuestAccountUuid,
    docNotifyContext: docNotifyContextId,
    archived: false,
    objectId,
    objectClass,
    types,
    ...data
  }
  const notificationTx = control.txFactory.createTxCreateDoc(_class, receiver.space, notificationData)
  res.push(notificationTx)

  return notificationTx
}

async function activityInboxNotificationToText (
  doc: Data<ActivityInboxNotification>
): Promise<{ title: string, body: string, [key: string]: string }> {
  let title: string = ''
  let body: string = ''

  const params = doc.intlParams ?? {}
  if (doc.intlParamsNotLocalized != null && Object.keys(doc.intlParamsNotLocalized).length > 0) {
    for (const key in doc.intlParamsNotLocalized) {
      const val = doc.intlParamsNotLocalized[key]
      params[key] = await translate(val, params)
    }
  }
  if (doc.title != null) {
    title = await translate(doc.title, params)
  }
  if (doc.body != null) {
    body = await translate(doc.body, params)
  }

  return { ...params, title, body }
}

async function commonInboxNotificationToText (
  doc: Data<CommonInboxNotification>
): Promise<{ title: string, body: string, [key: string]: string }> {
  let title: string = ''
  let body: string = ''

  let params = doc.intlParams ?? {}
  if (doc.props != null) {
    params = { ...params, ...doc.props }
  }
  if (doc.intlParamsNotLocalized != null && Object.keys(doc.intlParamsNotLocalized).length > 0) {
    for (const key in doc.intlParamsNotLocalized) {
      const val = doc.intlParamsNotLocalized[key]
      params[key] = await translate(val, params)
    }
  }
  if (doc.header != null) {
    title = await translate(doc.header, params)
  }
  if (doc.messageHtml != null) {
    body = stripTags(doc.messageHtml, NOTIFICATION_BODY_SIZE)
  }
  if (doc.message != null) {
    body = await translate(doc.message, params)
  }
  return { ...params, title, body }
}

async function mentionInboxNotificationToText (
  doc: Data<MentionInboxNotification>,
  control: TriggerControl
): Promise<{ title: string, body: string, [key: string]: string }> {
  let obj = (await control.findAll(control.ctx, doc.mentionedInClass, { _id: doc.mentionedIn }, { limit: 1 }))[0]
  if (obj !== undefined) {
    if (control.hierarchy.isDerived(obj._class, chunter.class.ChatMessage)) {
      obj = (
        await control.findAll(
          control.ctx,
          (obj as ChatMessage).attachedToClass,
          { _id: (obj as ChatMessage).attachedTo },
          { limit: 1 }
        )
      )[0]
    }
    if (obj !== undefined) {
      const textPresenter = getTextPresenter(obj._class, control.hierarchy)
      if (textPresenter !== undefined) {
        const textPresenterFunc = await getResource(textPresenter.presenter)
        const title = await textPresenterFunc(obj, control)
        doc.intlParams = {
          ...doc.intlParams,
          title
        }
      }
    }
  }
  return await commonInboxNotificationToText(doc)
}

export async function getTranslatedNotificationContent (
  data: Data<InboxNotification>,
  _class: Ref<Class<InboxNotification>>,
  control: TriggerControl
): Promise<{ title: string, body: string, [key: string]: string }> {
  if (control.hierarchy.isDerived(_class, notification.class.ActivityInboxNotification)) {
    return await activityInboxNotificationToText(data as Data<ActivityInboxNotification>)
  } else if (control.hierarchy.isDerived(_class, notification.class.MentionInboxNotification)) {
    return await mentionInboxNotificationToText(data as Data<MentionInboxNotification>, control)
  } else if (control.hierarchy.isDerived(_class, notification.class.CommonInboxNotification)) {
    return await commonInboxNotificationToText(data as Data<CommonInboxNotification>)
  }

  return { title: '', body: '' }
}

/**
 * @public
 */
export async function pushActivityInboxNotifications (
  ctx: MeasureContext,
  originTx: TxCUD<Doc>,
  control: TriggerControl,
  res: Tx[],
  receiver: ReceiverInfo,
  sender: SenderInfo,
  object: Doc,
  docNotifyContexts: DocNotifyContext[],
  activityMessage: ActivityMessage,
  types: Ref<NotificationType>[],
  shouldUpdateTimestamp: boolean
): Promise<TxCreateDoc<InboxNotification> | undefined> {
  const content = await getNotificationContent(originTx, receiver.employee, sender, object, control)
  const data: Partial<Data<ActivityInboxNotification>> = {
    ...content,
    attachedTo: activityMessage._id,
    attachedToClass: activityMessage._class
  }

  return await pushInboxNotifications(
    ctx,
    control,
    res,
    receiver,
    sender,
    activityMessage.attachedTo,
    activityMessage.attachedToClass,
    object.space,
    docNotifyContexts,
    data,
    notification.class.ActivityInboxNotification,
    activityMessage.modifiedOn,
    types,
    shouldUpdateTimestamp,
    originTx
  )
}

async function createNotifyContext (
  ctx: MeasureContext,
  control: TriggerControl,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  receiver: ReceiverInfo,
  sender: PersonId,
  updateTimestamp?: Timestamp,
  tx?: TxCUD<Doc>
): Promise<Ref<DocNotifyContext>> {
  const contextsCache: ContextsCache = control.cache.get(ContextsCacheKey) ?? {
    contexts: new Map<string, Ref<DocNotifyContext>>()
  }
  const cacheKey = `${objectId}_${receiver.account}`
  const cachedId = contextsCache.contexts.get(cacheKey)

  if (cachedId !== undefined) {
    if (control.removedMap.has(cachedId)) {
      contextsCache.contexts.delete(cacheKey)
    } else {
      return cachedId
    }
  }

  const lastViewedTimestamp =
    receiver.role === 'GUEST' && receiver.account === readOnlyGuestAccountUuid
      ? Number.MAX_VALUE
      : receiver.socialIds.some((it) => it === sender)
        ? updateTimestamp
        : undefined

  const createTx = control.txFactory.createTxCreateDoc(notification.class.DocNotifyContext, receiver.space, {
    user: receiver.account,
    objectId,
    objectClass,
    objectSpace,
    isPinned: false,
    hidden: false,
    tx: tx?._id,
    lastUpdateTimestamp: updateTimestamp,
    lastViewedTimestamp
  })

  contextsCache.contexts.set(cacheKey, createTx.objectId)
  control.cache.set(ContextsCacheKey, contextsCache)
  await ctx.with('apply', {}, () => control.apply(control.ctx, [createTx]))
  return createTx.objectId
}

export async function getNotificationTxes (
  ctx: MeasureContext,
  control: TriggerControl,
  object: Doc,
  tx: TxCUD<Doc>,
  receiver: ReceiverInfo,
  sender: SenderInfo,
  params: NotifyParams,
  docNotifyContexts: DocNotifyContext[],
  activityMessages: ActivityMessage[],
  settings: NotificationProviderControl
): Promise<Tx[]> {
  const res: Tx[] = []

  for (const message of activityMessages) {
    const docMessage = message._class === activity.class.DocUpdateMessage ? (message as DocUpdateMessage) : undefined
    const notifyResult = await isShouldNotifyTx(
      control,
      tx,
      object,
      receiver,
      params.isOwn,
      params.isSpace,
      settings,
      docMessage
    )

    if (notifyResult.has(notification.providers.InboxNotificationProvider)) {
      const types = (notifyResult.get(notification.providers.InboxNotificationProvider) ?? []).map((it) => it._id)
      const notificationTx = await pushActivityInboxNotifications(
        ctx,
        tx,
        control,
        res,
        receiver,
        sender,
        object,
        docNotifyContexts,
        message,
        types,
        params.shouldUpdateTimestamp
      )

      if (notificationTx !== undefined) {
        const current: AvailableProvidersCache = control.contextCache.get(AvailableProvidersCacheKey) ?? new Map()
        const providers = Array.from(notifyResult.keys())
        if (providers.length > 0) {
          current.set(notificationTx.objectId, providers)
          control.contextCache.set('AvailableNotificationProviders', current)
        }
      }
    } else {
      const context = getDocNotifyContext(control, docNotifyContexts, message.attachedTo, receiver.account)

      if (context === undefined) {
        await createNotifyContext(
          ctx,
          control,
          message.attachedTo,
          message.attachedToClass,
          object.space,
          receiver,
          sender.socialId,
          params.shouldUpdateTimestamp ? tx.modifiedOn : undefined,
          tx
        )
      }
    }
  }
  return res
}

async function updateContextsTimestamp (
  ctx: MeasureContext,
  contexts: DocNotifyContext[],
  timestamp: Timestamp,
  control: TriggerControl,
  modifiedBy: PersonId
): Promise<void> {
  if (contexts.length === 0) return
  const res: Tx[] = []
  const modifiedByAccount = await getAccountBySocialId(control, modifiedBy)

  for (const context of contexts) {
    const isViewed =
      context.lastViewedTimestamp !== undefined && (context.lastUpdateTimestamp ?? 0) <= context.lastViewedTimestamp
    const updateTx = control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
      hidden: false,
      lastUpdateTimestamp: timestamp,
      ...(isViewed && context.user === modifiedByAccount
        ? {
            lastViewedTimestamp: timestamp
          }
        : {})
    })

    res.push(updateTx)
  }

  if (res.length > 0) {
    await ctx.with('apply', {}, () => control.apply(ctx, res))
  }
}

async function removeContexts (
  ctx: MeasureContext,
  contexts: DocNotifyContext[],
  unsubscribe: AccountUuid[],
  control: TriggerControl
): Promise<void> {
  if (contexts.length === 0) return
  if (unsubscribe.length === 0) return

  const res: Tx[] = []

  for (const context of contexts) {
    if (!unsubscribe.includes(context.user)) {
      continue
    }

    const removeTx = control.txFactory.createTxRemoveDoc(context._class, context.space, context._id)

    res.push(removeTx)
  }

  await control.apply(control.ctx, res)
}

export async function createCollabDocInfo (
  ctx: MeasureContext,
  currentRes: Tx[],
  collaborators: AccountUuid[],
  control: TriggerControl,
  tx: TxCUD<Doc>,
  object: Doc,
  activityMessages: ActivityMessage[],
  params: NotifyParams,
  cache: Map<Ref<Doc>, Doc> = new Map<Ref<Doc>, Doc>()
): Promise<Tx[]> {
  let res: Tx[] = []

  if (tx.space === core.space.DerivedTx) {
    return res
  }

  const docMessages = activityMessages.filter((message) => message.attachedTo === object._id)

  if (docMessages.length === 0) {
    return res
  }

  let notifyContexts: DocNotifyContext[] = []
  if (!(object._id === tx.objectId && tx._class === core.class.TxCreateDoc)) {
    notifyContexts = await control.findAll(ctx, notification.class.DocNotifyContext, { objectId: object._id })
  }

  if (notifyContexts.length > 0) {
    await updateContextsTimestamp(ctx, notifyContexts, tx.modifiedOn, control, tx.modifiedBy)
  }

  const space = await getObjectSpace(control, object, cache)

  if (space === undefined) {
    control.ctx.error('Cannot find space for object', object)
    Analytics.handleError(
      new Error(`Cannot find space ${object.space} for objectId ${object._id}, objectClass ${object._class}`)
    )
    return res
  }

  cache.set(space._id, space)

  const filteredCollaborators = !space.private
    ? collaborators
    : collaborators.filter(
      (it) =>
        space.members.includes(it) ||
          currentRes.some((tx) => {
            if (tx._class === core.class.TxUpdateDoc) {
              const updateTx = tx as TxUpdateDoc<Space>
              if (updateTx.objectId === space._id) {
                const added = combineAttributes([updateTx.operations], 'members', '$push', '$each')
                return added.includes(it)
              }
            }
            return false
          })
    )
  const targets = new Set(filteredCollaborators)

  // user is not collaborator of himself, but we should notify user of changes related to users account (mentions, comments etc)
  if (control.hierarchy.isDerived(object._class, contact.mixin.Employee)) {
    const account = (object as Employee).personUuid

    if (account != null) {
      targets.add(account)
    }
  }

  if (targets.size === 0) {
    return res
  }

  const receivers = await getReceiversInfo(ctx, Array.from(targets), control)
  const sender: SenderInfo = await getSenderInfo(ctx, tx.modifiedBy, control)
  const settings = await getNotificationProviderControl(ctx, control)

  for (const receiver of receivers) {
    const targetRes = await getNotificationTxes(
      ctx,
      control,
      object,
      tx,
      receiver,
      sender,
      params,
      notifyContexts,
      docMessages,
      settings
    )

    res = res.concat(targetRes)
  }
  return res
}

async function getSpaceCollabTxes (
  ctx: MeasureContext,
  control: TriggerControl,
  doc: Doc,
  tx: TxCUD<Doc>,
  activityMessages: ActivityMessage[],
  cache: Map<Ref<Doc>, Collaborator[]>,
  docCache: Map<Ref<Doc>, Doc>
): Promise<Tx[]> {
  if (doc.space === core.space.Space) {
    return []
  }

  const space = await getObjectSpace(control, doc, docCache)
  if (space === undefined) return []

  docCache.set(space._id, space)

  const mixin = getClassCollaborators(control.modelDb, control.hierarchy, space._class)
  if (mixin !== undefined) {
    const collaborators =
      cache.get(space._id) ??
      (await control.findAll(ctx, core.class.Collaborator, {
        attachedTo: space._id
      }))
    cache.set(space._id, collaborators)
    const collabs = collaborators.map((c) => c.collaborator)
    return await createCollabDocInfo(
      ctx,
      [],
      collabs,
      control,
      tx,
      doc,
      activityMessages,
      { isSpace: true, isOwn: false, shouldUpdateTimestamp: true },
      docCache
    )
  }
  return []
}

async function createCollaboratorDoc (
  ctx: MeasureContext,
  tx: TxCreateDoc<Doc>,
  control: TriggerControl,
  activityMessage: ActivityMessage[],
  cache: Map<Ref<Doc>, Collaborator[]>,
  docCache: Map<Ref<Doc>, Doc>
): Promise<Tx[]> {
  const res: Tx[] = []
  const hierarchy = control.hierarchy
  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)
  if (mixin === undefined) {
    return res
  }

  const doc = TxProcessor.createDoc2Doc(tx)
  const collaborators =
    cache.get(doc._id) ??
    (await control.findAll(ctx, core.class.Collaborator, {
      attachedTo: doc._id
    }))
  cache.set(doc._id, collaborators)

  res.push(
    ...(await ctx.with('get-space-collabtxes', {}, (ctx) =>
      getSpaceCollabTxes(ctx, control, doc, tx, activityMessage, cache, docCache)
    ))
  )

  const notificationTxes = await ctx.with('create-collabdocinfo', {}, (ctx) =>
    createCollabDocInfo(
      ctx,
      res,
      collaborators.map((it) => it.collaborator),
      control,
      tx,
      doc,
      activityMessage,
      {
        isOwn: true,
        isSpace: false,
        shouldUpdateTimestamp: true
      },
      docCache
    )
  )

  res.push(...notificationTxes)

  return res
}

async function collectionCollabDoc (
  ctx: MeasureContext,
  tx: TxCUD<AttachedDoc>,
  control: TriggerControl,
  activityMessages: ActivityMessage[],
  cache: Map<Ref<Doc>, Collaborator[]>,
  docCache: Map<Ref<Doc>, Doc>,
  ignoreCollection: boolean = false
): Promise<Tx[]> {
  let res = await createCollaboratorNotifications(
    ctx,
    tx,
    control,
    activityMessages,
    tx,
    cache,
    docCache,
    ignoreCollection
  )

  if (![core.class.TxCreateDoc, core.class.TxRemoveDoc, core.class.TxUpdateDoc].includes(tx._class)) {
    return res
  }

  const { attachedTo, attachedToClass } = tx

  if (attachedTo === undefined || attachedToClass === undefined) {
    return res
  }

  const mixin = getClassCollaborators(control.modelDb, control.hierarchy, attachedToClass)

  if (mixin === undefined) {
    return res
  }

  const doc = await ctx.with(
    'get-doc',
    {},
    async (ctx) =>
      docCache.get(attachedTo) ?? (await control.findAll(ctx, attachedToClass, { _id: attachedTo }, { limit: 1 }))[0]
  )

  if (doc === undefined) {
    return res
  }

  docCache.set(doc._id, doc)

  const collaborators =
    cache.get(doc._id) ??
    (await control.findAll(ctx, core.class.Collaborator, {
      attachedTo: doc._id
    }))
  cache.set(doc._id, collaborators)

  res = res.concat(
    await ctx.with('create-collab-doc-info', {}, (ctx) =>
      createCollabDocInfo(
        ctx,
        res,
        collaborators.map((it) => it.collaborator),
        control,
        tx,
        doc,
        activityMessages,
        {
          isOwn: false,
          isSpace: false,
          shouldUpdateTimestamp: true
        },
        docCache
      )
    )
  )

  return res
}

async function removeContextNotifications (
  control: TriggerControl,
  notifyContextRefs: Ref<DocNotifyContext>[]
): Promise<Tx[]> {
  const inboxNotifications = await control.findAll(
    control.ctx,
    notification.class.InboxNotification,
    {
      docNotifyContext: { $in: notifyContextRefs }
    },
    {
      projection: {
        _id: 1,
        _class: 1,
        space: 1
      }
    }
  )

  return inboxNotifications.map((notification) =>
    control.txFactory.createTxRemoveDoc(notification._class, notification.space, notification._id)
  )
}
async function removeCollaboratorDoc (tx: TxRemoveDoc<Doc>, control: TriggerControl): Promise<Tx[]> {
  const mixin = getClassCollaborators(control.modelDb, control.hierarchy, tx.objectClass)

  if (mixin === undefined) {
    return []
  }

  const res: Tx[] = []
  const notifyContexts = await control.findAll(
    control.ctx,
    notification.class.DocNotifyContext,
    { objectId: tx.objectId },
    {
      projection: {
        _id: 1,
        _class: 1,
        space: 1
      }
    }
  )

  if (notifyContexts.length === 0) {
    return []
  }

  const notifyContextRefs = notifyContexts.map(({ _id }) => _id)

  const txes = await removeContextNotifications(control, notifyContextRefs)
  res.push(...txes)
  notifyContexts.forEach((context) => {
    res.push(control.txFactory.createTxRemoveDoc(context._class, context.space, context._id))
  })

  return res
}

async function updateCollaboratorDoc (
  ctx: MeasureContext,
  tx: TxUpdateDoc<Doc> | TxMixin<Doc, Doc>,
  control: TriggerControl,
  activityMessages: ActivityMessage[],
  cache: Map<Ref<Doc>, Collaborator[]>,
  docCache: Map<Ref<Doc>, Doc>
): Promise<Tx[]> {
  const hierarchy = control.hierarchy
  let res: Tx[] = []
  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)
  if (mixin === undefined) return []
  const doc = await ctx.with(
    'find-doc',
    { _class: tx.objectClass },
    async (ctx) =>
      docCache.get(tx.objectId) ?? (await control.findAll(ctx, tx.objectClass, { _id: tx.objectId }, { limit: 1 }))[0]
  )
  if (doc === undefined) return []
  docCache.set(doc._id, doc)
  const params: NotifyParams = { isOwn: true, isSpace: false, shouldUpdateTimestamp: true }
  const collaborators =
    cache.get(doc._id) ??
    (await control.findAll(ctx, core.class.Collaborator, {
      attachedTo: doc._id
    }))
  cache.set(doc._id, collaborators)

  res = res.concat(
    await ctx.with('create-collab-docinfo', {}, (ctx) =>
      createCollabDocInfo(
        ctx,
        res,
        collaborators.map((it) => it.collaborator),
        control,
        tx,
        doc,
        activityMessages,
        params,
        docCache
      )
    )
  )

  res = res.concat(
    await ctx.with('get-space-collabtxes', {}, (ctx) =>
      getSpaceCollabTxes(ctx, control, doc, tx, activityMessages, cache, docCache)
    )
  )
  res = res.concat(
    await ctx.with('update-notify-context-space', {}, (ctx) => updateNotifyContextsSpace(ctx, control, tx))
  )

  return res
}

/**
 * @public
 */
export async function OnAttributeCreate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const attribute = TxProcessor.createDoc2Doc(tx as TxCreateDoc<AnyAttribute>)
    const group = (
      await control.modelDb.findAll(notification.class.NotificationGroup, { objectClass: attribute.attributeOf })
    )[0]
    if (group === undefined) {
      continue
    }
    const isCollection: boolean = core.class.Collection === attribute.type._class
    const objectClass = !isCollection ? attribute.attributeOf : (attribute.type as Collection<AttachedDoc>).of
    const txClasses = !isCollection
      ? [control.hierarchy.isMixin(attribute.attributeOf) ? core.class.TxMixin : core.class.TxUpdateDoc]
      : [core.class.TxCreateDoc, core.class.TxRemoveDoc]
    const data: Data<NotificationType> = {
      attribute: attribute._id,
      group: group._id,
      field: attribute.name,
      generated: true,
      objectClass,
      txClasses,
      hidden: false,
      defaultEnabled: false,
      templates: {
        textTemplate: '{body}',
        htmlTemplate: '<p>{body}</p><p>{link}</p>',
        subjectTemplate: '{doc} updated'
      },
      label: attribute.label
    }
    if (isCollection) {
      data.attachedToClass = attribute.attributeOf
    }
    const id =
      `${notification.class.NotificationType}_${attribute.attributeOf}_${attribute.name}` as Ref<NotificationType>
    result.push(control.txFactory.createTxCreateDoc(notification.class.NotificationType, core.space.Model, data, id))
  }
  return result
}

/**
 * @public
 */
export async function OnAttributeUpdate (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const ctx = tx as TxUpdateDoc<AnyAttribute>
    if (ctx.operations.hidden === undefined) {
      continue
    }
    const type = (
      await control.findAll(control.ctx, notification.class.NotificationType, { attribute: ctx.objectId })
    )[0]
    if (type === undefined) {
      continue
    }
    result.push(
      control.txFactory.createTxUpdateDoc(type._class, type.space, type._id, {
        hidden: ctx.operations.hidden
      })
    )
  }
  return result
}

async function updateCollaborators (ctx: MeasureContext, control: TriggerControl, tx: TxCUD<Doc>): Promise<Tx[]> {
  if (tx._class !== core.class.TxUpdateDoc && tx._class !== core.class.TxMixin) return []

  const hierarchy = control.hierarchy

  if (hierarchy.classHierarchyMixin(tx.objectClass, activity.mixin.ActivityDoc) === undefined) return []

  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)
  if (mixin === undefined) return []

  const doc = (await control.findAll(ctx, tx.objectClass, { _id: tx.objectId }, { limit: 1 }))[0]
  if (doc === undefined) return []

  const collabsResult = await getCollaboratorsByTx(ctx, control, tx, doc, new Map())
  if (collabsResult.added.length === 0 && collabsResult.removed.length === 0) return []

  const res: Tx[] = []

  const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, { objectId: tx.attachedTo })
  const addedInfo = collabsResult.added.length > 0 ? await getReceiversInfo(ctx, collabsResult.added, control) : []

  for (const info of addedInfo) {
    const context = getDocNotifyContext(control, contexts, doc._id, info.account)
    if (context !== undefined) {
      if (context.hidden) {
        res.push(control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, { hidden: false }))
      }
    }
    await createNotifyContext(ctx, control, doc._id, doc._class, doc.space, info, tx.modifiedBy, undefined, tx)
  }

  return res
}

async function OnCollaboratorRemoved (txes: TxRemoveDoc<Collaborator>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []

  for (const tx of txes) {
    const collaborator = control.removedMap.get(tx._id) as Collaborator | undefined
    if (collaborator === undefined) continue

    const { attachedTo, attachedToClass } = collaborator

    if (control.hierarchy.classHierarchyMixin(attachedToClass, activity.mixin.ActivityDoc) === undefined) return []

    const doc = (await control.findAll(control.ctx, attachedToClass, { _id: attachedTo }, { limit: 1 }))[0]
    if (doc === undefined) continue

    const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
      objectId: attachedTo,
      user: collaborator.collaborator
    })

    await removeContexts(control.ctx, contexts, [collaborator.collaborator], control)
  }

  return res
}

export async function createCollaboratorNotifications (
  ctx: MeasureContext,
  tx: TxCUD<Doc>,
  control: TriggerControl,
  activityMessages: ActivityMessage[],
  originTx?: TxCUD<Doc>,
  cache: Map<Ref<Doc>, Collaborator[]> = new Map<Ref<Doc>, Collaborator[]>(),
  docCache: Map<Ref<Doc>, Doc> = new Map<Ref<Doc>, Doc>(),
  ignoreCollection: boolean = false
): Promise<Tx[]> {
  if (tx.space === core.space.DerivedTx) {
    // do not forgot update collaborators for derived  tx
    return await ctx.with('updateDerivedCollaborators', {}, (ctx) => updateCollaborators(ctx, control, tx))
  }

  if (activityMessages.length === 0) {
    return []
  }

  if (tx.attachedTo !== undefined && !ignoreCollection) {
    return await ctx.with('collectionCollabDoc', {}, (ctx) =>
      collectionCollabDoc(ctx, tx as TxCUD<AttachedDoc>, control, activityMessages, cache, docCache, true)
    )
  }

  switch (tx._class) {
    case core.class.TxCreateDoc: {
      return await ctx.with('createCollaboratorDoc', {}, (ctx) =>
        createCollaboratorDoc(ctx, tx as TxCreateDoc<Doc>, control, activityMessages, cache, docCache)
      )
    }
    case core.class.TxUpdateDoc:
    case core.class.TxMixin: {
      return await ctx.with('updateCollaboratorDoc', {}, (ctx) =>
        updateCollaboratorDoc(ctx, tx as TxUpdateDoc<Doc>, control, activityMessages, cache, docCache)
      )
    }
  }

  return []
}

/**
 * @public
 */
export async function removeDocInboxNotifications (_id: Ref<ActivityMessage>, control: TriggerControl): Promise<Tx[]> {
  const inboxNotifications = await control.findAll(control.ctx, notification.class.InboxNotification, {
    attachedTo: _id
  })

  return inboxNotifications.map((inboxNotification) =>
    control.txFactory.createTxRemoveDoc(
      notification.class.InboxNotification,
      inboxNotification.space,
      inboxNotification._id
    )
  )
}

function getDocNotifyContext (
  control: TriggerControl,
  contexts: DocNotifyContext[],
  objectId: Ref<Doc>,
  user: AccountUuid
): DocNotifyContext | undefined {
  const context = contexts.find((it) => it.objectId === objectId && it.user === user)

  if (context !== undefined) {
    return context
  }

  const txes = [...control.txes, ...control.ctx.contextData.broadcast.txes] as TxCUD<Doc>[]

  for (const tx of txes) {
    if (tx._class === core.class.TxCreateDoc && tx.objectClass === notification.class.DocNotifyContext) {
      const doc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<DocNotifyContext>)
      if (doc.objectId === objectId && doc.user === user) {
        return doc
      }
    }
  }
  return undefined
}

async function OnActivityMessageRemove (message: ActivityMessage, control: TriggerControl): Promise<Tx[]> {
  if (control.removedMap.has(message.attachedTo)) {
    return []
  }

  const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
    objectId: message.attachedTo,
    lastUpdateTimestamp: message.createdOn
  })
  if (contexts.length === 0) return []

  const lastMessage = (
    await control.findAll(
      control.ctx,
      activity.class.ActivityMessage,
      { attachedTo: message.attachedTo, space: message.space },
      { sort: { createdOn: SortingOrder.Descending }, limit: 1 }
    )
  )[0]
  if (lastMessage === undefined) return []

  const res: Tx[] = []

  for (const context of contexts) {
    const tx = control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
      lastUpdateTimestamp: lastMessage.createdOn ?? lastMessage.modifiedOn
    })

    res.push(tx)
  }

  return res
}

async function OnEmployeeDeactivate (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    const actualTx = tx
    if (core.class.TxMixin !== actualTx._class) {
      return []
    }
    const ctx = actualTx as TxMixin<Person, Employee>
    if (ctx.mixin !== contact.mixin.Employee || ctx.attributes.active !== false) {
      return []
    }
    const person = (await control.findAll(control.ctx, contact.class.Person, { _id: ctx.objectId }))[0]
    if (person?.personUuid === undefined) return []

    const res: Tx[] = []
    const subscriptions = await control.findAll(control.ctx, notification.class.PushSubscription, {
      user: person.personUuid as AccountUuid
    })
    for (const sub of subscriptions) {
      res.push(control.txFactory.createTxRemoveDoc(sub._class, sub.space, sub._id))
    }
  }
  return result
}

async function OnDocRemove (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const ltxes = txes.filter((it) => it._class === core.class.TxRemoveDoc) as TxRemoveDoc<Doc>[]
  const res: Tx[] = []
  for (const tx of ltxes) {
    if (control.hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) {
      const message = control.removedMap.get(tx.objectId) as ActivityMessage | undefined

      if (message !== undefined) {
        const txes = await OnActivityMessageRemove(message, control)
        res.push(...txes)
      }
    } else if (control.hierarchy.isDerived(tx.objectClass, notification.class.DocNotifyContext)) {
      const contextsCache: ContextsCache | undefined = control.cache.get(ContextsCacheKey)
      if (contextsCache !== undefined) {
        for (const [key, value] of contextsCache.contexts.entries()) {
          if (value === tx.objectId) {
            contextsCache.contexts.delete(key)
          }
        }
      }

      res.push(...(await removeContextNotifications(control, [tx.objectId as Ref<DocNotifyContext>])))
    }

    res.push(...(await removeCollaboratorDoc(tx, control)))
  }
  return res
}

export * from './push'
export * from './types'
export * from './utils'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    OnAttributeCreate,
    OnAttributeUpdate,
    OnDocRemove,
    OnEmployeeDeactivate,
    PushNotificationsHandler,
    OnCollaboratorRemoved
  },
  function: {
    IsUserEmployeeInFieldValueTypeMatch: isUserEmployeeInFieldValueTypeMatch,
    MentionTypeMatch: mentionTypeMatch
  }
})
