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
  type Class,
  Doc,
  getTxOperations,
  type Hierarchy,
  matchQuery,
  PersonId,
  Ref,
  type RefTo,
  type Tx,
  TxCreateDoc,
  TxCUD,
  TxProcessor
} from '@hcengineering/core'
import activity, { DocUpdateMessage, ActivityMessage } from '@hcengineering/activity'
import notification, {
  NotificationProvider,
  NotificationType,
  MessageNotificationType,
  TxNotificationType,
  InboxNotification,
  NotificationContent
} from '@hcengineering/notification'
import serverNotification, {
  getSenderName,
  normalizeTextMessage,
  Receiver,
  Sender,
  TypeMatchClient
} from '@hcengineering/server-notification'
import { getResource, IntlString } from '@hcengineering/platform'
import { WorkspaceLoginInfo } from '@hcengineering/account-client'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'
import chunter, { ChatMessage } from '@hcengineering/chunter'

import { Client, NotificationSettings, NotifyResult } from './types'
import config from './config'

const externalRegions = process.env.EXTERNAL_REGIONS?.split(';') ?? []

export async function getWorkspaceInfo (token: string): Promise<WorkspaceLoginInfo> {
  const accountClient = getAccountClient(token, 30000)
  const connectionErrorCodes = ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND']
  const st = Date.now()
  const timeout = -1
  while (true) {
    try {
      const workspaceInfo = await accountClient.selectWorkspace('', 'external', externalRegions)

      if (workspaceInfo === undefined) {
        throw new Error('Workspace not found')
      }
      return workspaceInfo
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

export function getTransactorApiEndpoint (ws: WorkspaceLoginInfo): string {
  return ws.endpoint.replace('wss://', 'https://').replace('ws://', 'http://')
}

function getAllProviders (client: Client): NotificationProvider[] {
  const providers: NotificationProvider[] = client.model.findAllSync(notification.class.NotificationProvider, {})

  if (config.AllowedNotificationProviders.includes('all')) {
    return providers
  }

  return providers.filter((it) => config.AllowedNotificationProviders.includes(it._id))
}

export async function getMessageNotifyResult (
  client: Client,
  message: ActivityMessage,
  doc: Doc,
  receiver: Receiver,
  notificationSettings: NotificationSettings
): Promise<NotifyResult> {
  const types = getMatchedMessageTypes(client, message, doc)

  return await getNotifyResult(client, message, doc, receiver, notificationSettings, types)
}

function getMatchedMessageTypes (client: Client, message: ActivityMessage, doc: Doc): MessageNotificationType[] {
  const allTypes = client.model.findAllSync<MessageNotificationType>(notification.class.MessageNotificationType, {})
  const filtered: MessageNotificationType[] = []
  for (const type of allTypes) {
    if (isMessageTypeMatched(client, message, doc, type)) {
      filtered.push(type)
    }
  }

  return filtered
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
  types: NotificationType[]
): Promise<NotifyResult> {
  const authorSocialId = obj.createdBy ?? obj.modifiedBy
  const result: NotifyResult = {}

  const providers: NotificationProvider[] = getAllProviders(client)
  const { hierarchy } = client

  for (const type of types) {
    if (type.notifyAuthor !== true && receiver.socialIds.includes(authorSocialId)) continue

    if (hierarchy.hasMixin(type, serverNotification.mixin.TypeMatch)) {
      const mixin = hierarchy.as(type, serverNotification.mixin.TypeMatch)
      console.log({ mixin, type })
      if (mixin.match !== undefined) {
        const f = await getResource(mixin.match)
        let res = f(getTypeMatchClient(client), type, obj, doc, receiver)
        if (res instanceof Promise) {
          res = await res
        }
        console.log({ typeMatchRes: res, type: type._id })
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

export async function getTxNotifyResult (
  client: Client,
  tx: TxCUD<Doc>,
  doc: Doc,
  receiver: Receiver,
  notificationSettings: NotificationSettings,
  types: TxNotificationType[]
): Promise<NotifyResult> {
  return await getNotifyResult(client, tx, doc, receiver, notificationSettings, types)
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

export function getNotifiedUsers (hierarchy: Hierarchy, txes: Tx[]): AccountUuid[] {
  return txes
    .filter(
      (it) =>
        it._class === core.class.TxCreateDoc &&
        hierarchy.isDerived((it as TxCUD<Doc>).objectClass, notification.class.InboxNotification)
    )
    .map((it) => TxProcessor.createDoc2Doc(it as TxCreateDoc<InboxNotification>).user)
}

export function getTypeMatchClient (client: Client): TypeMatchClient {
  return {
    hierarchy: client.hierarchy,
    modelDb: client.model,
    txFactory: client.txFactory,
    ctx: client.ctx,
    branding: {
      lastNameFirst: config.LastNameFirst
    },
    findAll: (_ctx, _class, query, ops) => client.rest.findAll(_class, query, ops)
  }
}

export function getMessageNotificationContent (
  hierarchy: Hierarchy,
  doc: Doc,
  message: ActivityMessage,
  sender: Sender
): NotificationContent {
  const intlParams: Record<string, string | number> = {}
  const intlParamsNotLocalized: Record<string, IntlString> = {}

  intlParams.title = message.attachedToTitle ?? ''

  if (message.attachedToUrl != null) {
    intlParams.url = message.attachedToUrl
  }

  if (message.attachedToIdentifier != null) {
    intlParams.identifier = message.attachedToIdentifier
  }

  intlParams.senderName = getSenderName(sender, config.LastNameFirst)

  if (message.message != null && !isEmptyMarkup(message.message)) {
    intlParams.message = normalizeTextMessage(markupToText(message.message))
  } else if (
    hierarchy.isDerived(chunter.class.ChatMessage, message._class) &&
    ((message as ChatMessage).attachments ?? 0) > 0
  ) {
    intlParamsNotLocalized.message = activity.string.SentAttachments
  } else {
    intlParamsNotLocalized.object = hierarchy.getClass(doc._class).label
    intlParamsNotLocalized.message = activity.string.UpdatedObject
  }

  return {
    title:
      intlParams.identifier != null
        ? notification.string.CommonNotificationTitleWithIdentifier
        : notification.string.CommonNotificationTitle,
    body: notification.string.MessageNotificationBody,
    intlParams,
    intlParamsNotLocalized
  }
}

export async function getMessage (client: Client, tx: TxCreateDoc<ActivityMessage>): Promise<ActivityMessage> {
  const raw = TxProcessor.createDoc2Doc(tx)

  if (raw.attachedToTitle != null || raw.attachedToIdentifier != null || raw.attachedToUrl != null) return raw

  return (await client.rest.findOne(raw._class, { _id: raw._id })) ?? raw
}
