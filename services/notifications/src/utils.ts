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

import { getAccountClient } from '@hcengineering/server-client'
import core, {
  AccountUuid,
  type AnyAttribute,
  type ArrOf,
  type AttachedDoc,
  BlobType,
  type Class,
  Doc,
  getTxOperations,
  type Hierarchy,
  matchQuery,
  PersonId,
  Ref,
  type RefTo,
  Space,
  Timestamp,
  TxCreateDoc,
  TxCUD,
  TxFactory,
  TxUpdateDoc,
  WorkspaceInfoWithStatus,
  concatLink
} from '@hcengineering/core'
import contact, { Employee } from '@hcengineering/contact'
import activity, { DocUpdateMessage, ActivityMessage, Reaction } from '@hcengineering/activity'
import notification, {
  NotificationProvider,
  NotificationType,
  MessageNotificationType,
  TxNotificationType,
  DocNotificationMode,
  NotificationMessage,
  DocNotificationSetting,
  DocNotifyContext,
  NotificationIntl,
  ContextNotification,
  MentionNotification,
  getNotificationMessageId,
  notificationId
} from '@hcengineering/notification'
import serverNotification, {
  getSenderName,
  Receiver,
  Sender,
  TypeMatchClient
} from '@hcengineering/server-notification'
import { getMetadata, getResource, IntlString, translate } from '@hcengineering/platform'
import {
  Icon,
  PresenterControl,
  getDocTitle as _getDocTitle,
  getDocIdentifier as _getDocIdentifier,
  getDocUrl as _getDocUrl,
  getDocIcon as _getDocIcon,
  getDocLabel as _getDocLabel,
  getTitlePresenter,
  getIconPresenter
} from '@hcengineering/server-activity'
import chunter, { ChatMessage } from '@hcengineering/chunter'
import attachment, { Attachment } from '@hcengineering/attachment'
import serverCore from '@hcengineering/server-core'

import { Client, ObjectDisplayData, NotificationSettings, NotifyProviders, Result, TxCache } from './types'
import config from './config'
import Cache from './cache'

export const MAX_NOTIFICATION_TYPE_PRIORITY = Number.MAX_SAFE_INTEGER
const externalRegions = process.env.EXTERNAL_REGIONS?.split(';') ?? []

export async function getCollaboratorAccounts (
  client: Client,
  cache: Cache,
  doc: Doc,
  space: Space,
  notified: AccountUuid[] = []
): Promise<AccountUuid[]> {
  const collaborators = await cache.getCollaborators(doc._id, doc._class)

  const filtered = !space.private
    ? collaborators
    : collaborators.filter((it) => space.members.includes(it.collaborator))

  const accounts = new Set(filtered.map((it) => it.collaborator))

  if (client.hierarchy.isDerived(doc._class, contact.mixin.Employee)) {
    const account = (doc as Employee).personUuid

    if (account != null) {
      accounts.add(account)
    }
  }

  return Array.from(accounts).filter((it) => !notified.includes(it))
}

export async function getWorkspaceInfo (
  token: string
): Promise<(WorkspaceInfoWithStatus & { endpoint: string }) | undefined> {
  const accountClient = getAccountClient(token, 30000)
  const connectionErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND']
  const st = Date.now()
  const timeout = -1
  while (true) {
    try {
      const workspaceInfo = await accountClient.selectWorkspace('', 'internal', externalRegions)
      if (workspaceInfo === undefined) {
        throw new Error('Workspace not found')
      }

      const infoWithStatus = await accountClient.getWorkspaceInfo(false)

      if (infoWithStatus.isDisabled === true) return undefined
      if (infoWithStatus.mode !== 'active') return undefined
      return { ...infoWithStatus, endpoint: workspaceInfo.endpoint }
    } catch (err: any) {
      if (timeout > 0 && st + timeout < Date.now()) {
        // Timeout happened
        throw err
      }
      if (connectionErrorCodes.includes(err?.cause?.code)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      } else {
        throw err
      }
    }
  }
}

export function getTransactorApiEndpoint (ws: { endpoint: string }): string {
  return ws.endpoint.replace('wss://', 'https://').replace('ws://', 'http://')
}

function getAllProviders (client: Client): NotificationProvider[] {
  const providers: NotificationProvider[] = client.model.findAllSync(notification.class.NotificationProvider, {})

  if (config.AllowedNotificationProviders.includes('all')) {
    return providers
  }

  return providers.filter((it) => config.AllowedNotificationProviders.includes(it._id))
}

export async function getMessageNotifyProviders (
  client: Client,
  message: ActivityMessage,
  doc: Doc,
  receiver: Receiver,
  notificationSettings: NotificationSettings,
  mode: DocNotificationMode
): Promise<NotifyProviders> {
  const types = getMatchedMessageTypes(client, message, doc)

  return await getNotifyResult(client, message, doc, receiver, notificationSettings, types, mode)
}

function getMatchedMessageTypes (client: Client, message: ActivityMessage, doc: Doc): MessageNotificationType[] {
  const allTypes = client.model.findAllSync<MessageNotificationType>(notification.class.MessageNotificationType, {})
  const filtered: MessageNotificationType[] = []
  for (const type of allTypes) {
    if (isMessageTypeMatched(client, message, doc, type)) {
      filtered.push(type)
    }
  }

  return filtered.sort(
    (a, b) => (a.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY) - (b.priority ?? MAX_NOTIFICATION_TYPE_PRIORITY)
  )
}

function isMessageTypeMatched (
  client: Client,
  message: ActivityMessage,
  doc: Doc,
  type: MessageNotificationType
): boolean {
  const { hierarchy } = client
  const baseClass = hierarchy.getBaseClass(type.objectClass)

  if (!hierarchy.isDerived(message._class, type.messageClass)) {
    return false
  }

  if (
    !hierarchy.isDerived(hierarchy.getBaseClass(message.attachedToClass), hierarchy.getBaseClass(type.attachedToClass))
  ) {
    return false
  }

  if (type.match !== undefined) {
    const res = matchQuery([message], type.match, message._class, hierarchy, true)
    if (res.length === 0) {
      return false
    }
  }

  if (!hierarchy.isDerived(message._class, activity.class.DocUpdateMessage)) {
    if (type.field !== undefined) {
      return type.field === message.collection
    }

    return true
  }

  const docUpdateMessage = message as DocUpdateMessage

  if (!hierarchy.isDerived(hierarchy.getBaseClass(docUpdateMessage.objectClass), baseClass)) {
    return false
  }

  if (type.field !== undefined) {
    if (!fieldUpdated(type.field, docUpdateMessage, doc)) {
      return false
    }
  }

  return true
}

function fieldUpdated (field: string, message: DocUpdateMessage, doc: Doc): boolean {
  const { action, attributeUpdates, objectId } = message

  if (action === 'create' && objectId === doc._id) {
    const value = (doc as any)[field]
    if (Array.isArray(value)) {
      return value != null && value.length > 0
    }
    return value !== undefined && value !== null && value !== ''
  }

  if (action !== 'update' && objectId !== doc._id) {
    return message.updateCollection === field
  }

  if (attributeUpdates === undefined) return false
  return attributeUpdates.attrKey === field
}

function isTypeAllowed (
  client: Client,
  socialIds: PersonId[],
  type: NotificationType,
  provider: NotificationProvider,
  notificationSettings: NotificationSettings
): boolean {
  const providerSettings = (notificationSettings.settingsByProvider.get(provider._id) ?? []).filter(({ createdBy }) =>
    createdBy !== undefined ? socialIds.includes(createdBy) : false
  )

  if (providerSettings.length > 0 && providerSettings.every((s) => !s.enabled)) {
    return false
  }

  if (providerSettings.length === 0 && !provider.defaultEnabled) {
    return false
  }

  const providerDefaults = client.model.findAllSync(notification.class.NotificationProviderDefaults, {})

  if (providerDefaults.some((it) => it.provider === provider._id && it.ignoredTypes.includes(type._id))) {
    return false
  }

  const setting = (notificationSettings.typesByProvider.get(provider._id) ?? []).find(
    (it) => it.type === type._id && it.createdBy !== undefined && socialIds.includes(it.createdBy)
  )

  if (setting !== undefined) {
    return setting.enabled
  }

  if (providerDefaults.some((it) => it.provider === provider._id && it.enabledTypes.includes(type._id))) {
    return true
  }

  if (type === undefined) {
    return false
  }

  return type.defaultEnabled
}

export function getAllowedProviders (
  client: Client,
  settings: NotificationSettings,
  socialIds: PersonId[],
  type: NotificationType
): Ref<NotificationProvider>[] {
  const result: Ref<NotificationProvider>[] = []
  const providers: NotificationProvider[] = getAllProviders(client)

  for (const provider of providers) {
    const allowed = isTypeAllowed(client, socialIds, type, provider, settings)

    if (allowed) {
      result.push(provider._id)
    }
  }

  return result
}

function getAttrClass (hierarchy: Hierarchy, attribute: AnyAttribute): Ref<Class<Doc>> {
  if (hierarchy.isDerived(attribute.type._class, core.class.RefTo)) {
    return (attribute.type as RefTo<Doc>).to
  } else if (hierarchy.isDerived(attribute.type._class, core.class.ArrOf)) {
    const of = (attribute.type as ArrOf<AttachedDoc>).of
    return of._class === core.class.RefTo ? (of as RefTo<Doc>).to : of._class
  }

  return attribute.type._class
}

export function isTxTrigger (
  hierarchy: Hierarchy,
  tx: TxCUD<Doc>,
  triggerClasses: Ref<Class<Doc>>[],
  txTypes: TxNotificationType[]
): boolean {
  if (triggerClasses.some((it) => hierarchy.isDerived(tx.objectClass, it))) return true

  for (const type of txTypes) {
    if (type.objectClass !== core.class.Doc) continue
    if (type.attrTypes === undefined) continue
    if (!type.txClasses.includes(tx._class)) continue

    const attributes = getTxOperationsKeys(tx)

    for (const field of attributes) {
      const attr = hierarchy.findAttribute(tx.objectClass, field)
      if (attr === undefined) continue
      const attrClass = getAttrClass(hierarchy, attr)
      if (type.attrTypes.includes(attrClass)) return true
    }
  }

  return false
}

async function getNotifyResult (
  client: Client,
  obj: Doc,
  doc: Doc,
  receiver: Receiver,
  notificationSettings: NotificationSettings,
  types: NotificationType[],
  mode: DocNotificationMode
): Promise<NotifyProviders> {
  const authorSocialId = obj.createdBy ?? obj.modifiedBy
  const result: NotifyProviders = {}

  const providers: NotificationProvider[] = getAllProviders(client)
  const { hierarchy } = client

  for (const type of types) {
    if (mode === 'mute') continue
    if (type.notifyAuthor !== true && receiver.socialIds.includes(authorSocialId)) continue
    if (mode === 'mentions' && type.isMention !== true) continue

    if (hierarchy.hasMixin(type, serverNotification.mixin.TypeMatch)) {
      const mixin = hierarchy.as(type, serverNotification.mixin.TypeMatch)

      if (mixin.match !== undefined) {
        const f = await getResource(mixin.match)
        let res = f(getTypeMatchClient(client), type, obj, doc, receiver)
        if (res instanceof Promise) {
          res = await res
        }

        if (!res) continue
      }
    }

    for (const provider of providers) {
      const allowed = isTypeAllowed(client, receiver.socialIds, type, provider, notificationSettings)

      if (allowed) {
        const cur = result[provider._id] ?? []
        result[provider._id] = [...cur, type]
      }
    }
  }

  return result
}

export async function getTxNotifyProviders (
  client: Client,
  tx: TxCUD<Doc>,
  doc: Doc,
  receiver: Receiver,
  notificationSettings: NotificationSettings,
  types: TxNotificationType[],
  mode: DocNotificationMode
): Promise<NotifyProviders> {
  return await getNotifyResult(client, tx, doc, receiver, notificationSettings, types, mode)
}

export function isMatchedTxType (client: Client, tx: TxCUD<Doc>, type: TxNotificationType): boolean {
  const { hierarchy } = client

  if (!type.txClasses.includes(tx._class)) return false

  if (type.attachedToClass != null) {
    if (tx.attachedToClass == null) return false
    if (
      !hierarchy.isDerived(hierarchy.getBaseClass(tx.attachedToClass), hierarchy.getBaseClass(type.attachedToClass))
    ) {
      return false
    }
  }

  if (type.objectClass !== core.class.Doc) {
    if (!hierarchy.isDerived(hierarchy.getBaseClass(tx.objectClass), hierarchy.getBaseClass(type.objectClass))) {
      return false
    }
  }

  if (type.field !== undefined) {
    const keys = getTxOperationsKeys(tx)
    if (!keys.includes(type.field)) return false
  }

  if (type.attrTypes !== undefined) {
    const keys = getTxOperationsKeys(tx)

    const hasAttr = keys.some((field) => {
      const attr = hierarchy.findAttribute(tx.objectClass, field)
      if (attr == null) return false

      const attrClass = getAttrClass(hierarchy, attr)
      return type.attrTypes?.includes(attrClass) ?? false
    })

    if (!hasAttr) return false
  }

  if (type.match !== undefined) {
    const res = matchQuery([tx], type.match, tx._class, hierarchy, true)
    if (res.length === 0) return false
  }

  return true
}

function getTxOperationsKeys (tx: TxCUD<Doc>): string[] {
  const ops = getTxOperations(tx)
  const keys = Object.keys(ops)
  const res: string[] = []
  for (const key of keys) {
    if (key === '$push') {
      res.push(...Object.keys(ops[key] ?? {}))
    } else if (key === '$pull') {
      res.push(...Object.keys(ops[key] ?? {}))
    } else {
      res.push(key)
    }
  }

  return res
}

export function getNotifiedUsers (result: Result): AccountUuid[] {
  return result.queueMessages.map((it) => it.account)
}

export function getTypeMatchClient (client: Client): TypeMatchClient {
  return {
    hierarchy: client.hierarchy,
    modelDb: client.model,
    txFactory: client.txFactory,
    ctx: client.ctx,
    branding: client.branding ?? null,
    findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
  }
}

function getPresenterControl (client: Client): PresenterControl {
  return {
    ctx: client.ctx,
    workspace: client.workspace,
    hierarchy: client.hierarchy,
    modelDb: client.model,
    branding: client.branding ?? null,
    findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
  }
}

export async function getDocTitle (
  client: Client,
  txCache: TxCache,
  doc: Doc,
  account?: AccountUuid
): Promise<string | undefined> {
  const presenter = getTitlePresenter(doc._class, client.hierarchy)
  const personalized = account != null && presenter?.personalized === true

  if (personalized) {
    const cached = txCache.titleByDoc.get(doc._id)?.[account]
    if (cached != null) return cached
  } else {
    const cached = txCache.titleByDoc.get(doc._id)?.['']
    if (cached != null) return cached
  }

  const title = await _getDocTitle(getPresenterControl(client), doc, { account })
  if (title != null) {
    const key = personalized ? account : ''
    txCache.titleByDoc.set(doc._id, {
      ...txCache.titleByDoc.get(doc._id),
      [key]: title
    })
  }

  return title
}

export async function getDocIdentifier (client: Client, txCache: TxCache, doc: Doc): Promise<string | undefined> {
  const cached = txCache.identifierByDoc.get(doc._id)
  if (cached != null) return cached

  const identifier = await _getDocIdentifier(getPresenterControl(client), doc)
  if (identifier != null) {
    txCache.identifierByDoc.set(doc._id, identifier)
  }

  return identifier
}

export async function getDocUrl (client: Client, txCache: TxCache, doc: Doc): Promise<string | undefined> {
  const cached = txCache.urlByDoc.get(doc._id)
  if (cached != null) return cached

  const url = await _getDocUrl(getPresenterControl(client), doc)
  if (url != null) {
    txCache.urlByDoc.set(doc._id, url)
  }

  return url
}

export async function getDocLabel (client: Client, txCache: TxCache, doc: Doc): Promise<IntlString | undefined> {
  const cached = txCache.labelByDoc.get(doc._id)
  if (cached != null) return cached

  const label = await _getDocLabel(getPresenterControl(client), doc)
  if (label != null) {
    txCache.labelByDoc.set(doc._id, label)
  }

  return label
}

export async function getDocIcon (
  client: Client,
  txCache: TxCache,
  doc: Doc,
  account: AccountUuid
): Promise<Icon | undefined> {
  const presenter = getIconPresenter(doc._class, client.hierarchy)
  const personalized = account != null && presenter?.personalized === true
  if (personalized) {
    const cached = txCache.iconByDoc.get(doc._id)?.[account]
    if (cached != null) return cached
  } else {
    const cached = txCache.iconByDoc.get(doc._id)?.['']
    if (cached != null) return cached
  }

  const icon = await _getDocIcon(getPresenterControl(client), doc, { account })
  if (icon != null) {
    const key = personalized ? account : ''
    txCache.iconByDoc.set(doc._id, {
      ...txCache.iconByDoc.get(doc._id),
      [key]: icon
    })
  }

  return icon
}

export function emptyResult (): Result {
  return {
    updateContextTx: [],
    updateOpContextTx: [],
    createContextTx: [],

    queueMessages: [],

    createUserMentionInfoTx: [],
    updateUserMentionInfoTx: [],
    removeUserMentionInfoTx: []
  }
}

export function getResultTxes (result: Result): TxCUD<Doc>[] {
  return [
    ...result.createContextTx,
    ...result.updateContextTx,
    ...result.updateOpContextTx,
    ...result.createUserMentionInfoTx,
    ...result.updateUserMentionInfoTx,
    ...result.removeUserMentionInfoTx
  ].sort((a, b) => a.modifiedOn - b.modifiedOn)
}

export function isEmptyResult (result: Result): boolean {
  return (
    result.updateContextTx.length === 0 &&
    result.updateOpContextTx.length === 0 &&
    result.createContextTx.length === 0 &&
    result.queueMessages.length === 0 &&
    result.createUserMentionInfoTx.length === 0 &&
    result.updateUserMentionInfoTx.length === 0 &&
    result.removeUserMentionInfoTx.length === 0
  )
}

export function toNotificationMessage (message: ActivityMessage): NotificationMessage {
  const {
    attachedTo,
    attachedToClass,
    editedOn,
    replies,
    repliedPersons,
    reactions,
    isPinned,
    lastReply,
    ...notificationMessage
  } = message

  return notificationMessage
}

export function getMode (docSettings: DocNotificationSetting[], account: AccountUuid): DocNotificationMode {
  const settingDoc = docSettings.find((it) => it.account === account)
  return settingDoc?.mode ?? 'all'
}

export function isMuted (mode: DocNotificationMode): boolean {
  return mode === 'mute'
}

export async function getBaseDisplayParams (
  client: Client,
  txCache: TxCache,
  type: NotificationType,
  doc: Doc,
  sender: Sender
): Promise<Pick<NotificationIntl, 'intlParams' | 'intlParamsNotLocalized'>> {
  const intlParams: Record<string, string | number> = {}
  const intlParamsNotLocalized: Record<string, IntlString> = {}

  const title = await getDocTitle(client, txCache, doc)
  const url = await getDocUrl(client, txCache, doc)
  const identifier = await getDocIdentifier(client, txCache, doc)

  if (title != null) {
    intlParams.title = title
    intlParams.doc = title
  }
  if (url != null && url.length > 0) {
    intlParams.url = url
  }
  if (identifier != null && identifier.length > 0) {
    intlParams.identifier = identifier
  }

  const senderName = getSenderName(sender, client.branding?.lastNameFirst)

  if (type.notificationMessage != null) {
    intlParamsNotLocalized.message = type.notificationMessage
  }

  return {
    intlParams: { ...intlParams, senderName },
    intlParamsNotLocalized
  }
}

export function hasMessageNotification (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'message' && it.messageId === _id)
}

export function hasReactionNotificationByMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'reaction' && it.messageId === _id)
}

export function hasMentionNotificationByMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.latestNotifications.some((it) => it.type === 'mention' && it.messageId === _id)
}

export function hasReactionNotification (context: DocNotifyContext, _id: Ref<Reaction>): boolean {
  return context.latestNotifications.some((it) => it.type === 'reaction' && it.id === _id)
}

export function hasUnreadReactionByMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.unreadReactions.some((it) => it.attachedTo === _id)
}

export function hasUnreadReaction (context: DocNotifyContext, _id: Ref<Reaction>): boolean {
  return context.unreadReactions.some((it) => it.id === _id)
}

export function hasUnreadMentionByMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.unreadMentions.some((it) => it.messageId === _id)
}

export function hasUnreadMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): boolean {
  return context.unreadMessages.some((it) => '_id' in it && it._id === _id)
}

export function getNotificationsByMessage (context: DocNotifyContext, _id: Ref<ActivityMessage>): ContextNotification[] {
  return context.latestNotifications.filter(
    (it) =>
      (it.type === 'message' && it.messageId === _id) ||
      (it.type === 'reaction' && it.messageId === _id) ||
      (it.type === 'mention' && it.messageId === _id)
  )
}

export function getMentionNotification (
  context: DocNotifyContext,
  _id: Ref<ActivityMessage> | null
): MentionNotification | undefined {
  if (_id != null) {
    return context.latestNotifications.find(
      (it) => it.type === 'mention' && it.messageId === _id
    ) as MentionNotification
  }

  return context.latestNotifications.find((it) => it.type === 'mention' && it.messageId == null) as MentionNotification
}

export function getEmptyTxCache (): TxCache {
  return {
    titleByDoc: new Map(),
    urlByDoc: new Map(),
    labelByDoc: new Map(),
    identifierByDoc: new Map(),
    iconByDoc: new Map()
  }
}

export function getUpdateContextTx (
  context: DocNotifyContext,
  result: Result,
  factory: TxFactory
): TxUpdateDoc<DocNotifyContext> {
  const current = result.updateContextTx.find((it) => it.objectId === context._id)

  if (current != null) return current

  const updateTx = factory.createTxUpdateDoc(context._class, context.space, context._id, {})

  result.updateContextTx.push(updateTx)

  return updateTx
}

export function getUpdateOpContextTx (
  context: DocNotifyContext,
  result: Result,
  factory: TxFactory
): TxUpdateDoc<DocNotifyContext> {
  const current = result.updateOpContextTx.find((it) => it.objectId === context._id)

  if (current != null) return current

  const updateTx = factory.createTxUpdateDoc(context._class, context.space, context._id, {})

  result.updateOpContextTx.push(updateTx)

  return updateTx
}

export function getCreateContextTx (
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  receiver: Receiver,
  result: Result,
  factory: TxFactory,
  display: ObjectDisplayData
): TxCreateDoc<DocNotifyContext> {
  const current = result.createContextTx.find((it) => it.attributes.user === receiver.account)
  if (current != null) return current

  const tx = factory.createTxCreateDoc(notification.class.DocNotifyContext, receiver.space, {
    ...display,
    user: receiver.account,
    objectId,
    objectClass,
    objectSpace,
    latestNotifications: [],
    unreadReactions: [],
    unreadMentions: [],
    unreadCommons: [],
    unreadMessages: [],
    unreadCount: 0,
    lastNotify: 0
  })

  result.createContextTx.push(tx)
  return tx
}

export async function getObjectDisplayData (
  client: Client,
  txCache: TxCache,
  doc: Doc,
  account: AccountUuid
): Promise<ObjectDisplayData> {
  const title = (await getDocTitle(client, txCache, doc, account)) ?? ''
  const label = await getDocLabel(client, txCache, doc)
  const identifier = await getDocIdentifier(client, txCache, doc)
  const icon = await getDocIcon(client, txCache, doc, account)

  return {
    objectTitle: title,
    objectIdentifier: identifier,
    objectIcon: icon,
    objectLabel: label
  }
}

export function getLastNotify (context: DocNotifyContext): Timestamp {
  return Math.max(...context.latestNotifications.map((it) => it.createdOn), 0)
}

export function isChatMessage (message: ActivityMessage, hierarchy: Hierarchy): message is ChatMessage {
  return hierarchy.isDerived(message._class, chunter.class.ChatMessage)
}

export async function getAttachments (message: ActivityMessage, client: Client): Promise<BlobType[]> {
  const attachments: Attachment[] =
    isChatMessage(message, client.hierarchy) && (message.attachments ?? 0) > 0
      ? await client.findAll(attachment.class.Attachment, { attachedTo: message._id })
      : []
  return attachments.map((it) => ({
    file: it.file,
    type: it.type,
    name: it.name,
    size: it.size,
    metadata: it.metadata
  }))
}

export async function translateNotification (
  intl: NotificationIntl,
  language: string
): Promise<{ title: string, body: string }> {
  const params = { ...intl.intlParams }
  if (intl.intlParamsNotLocalized != null) {
    for (const [key, val] of Object.entries(intl.intlParamsNotLocalized)) {
      params[key] = await translate(val, params, language)
    }
  }

  const title = await translate(intl.titleIntl, params, language)
  const body = await translate(intl.bodyIntl, params, language)

  return { title, body }
}

export function getNotificationUrl (
  client: Client,
  notification: ContextNotification,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>
): string {
  const frontUrl = getFrontUrl(client)
  const messageId = getNotificationMessageId(notification)
  const objectEncoded = encodeURIComponent(`${objectId}|${objectClass}`)
  const path = `workbench/${client.workspace.url}/${notificationId}/${objectEncoded}`

  let url = concatLink(frontUrl, path)
  if (messageId != null) {
    url += `?message=${messageId}`
  }
  return url
}

function getFrontUrl (client: Client): string {
  return client.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
}

export function getDomain (client: Client): string {
  const frontUrl = getFrontUrl(client)

  return concatLink(frontUrl, `workbench/${client.workspace.url}`)
}
