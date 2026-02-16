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
import core, {
  AccountUuid,
  AnyAttribute,
  type Class,
  Doc,
  getTxOperations,
  type Markup,
  Ref,
  Space,
  Tx,
  TxCUD,
  Blob,
  type TxRemoveDoc,
  Hierarchy
} from '@hcengineering/core'
import notification, { DocNotifyContext, NotificationContent, TxNotificationType } from '@hcengineering/notification'
import activity, { ActivityMessage, UserMentionInfo } from '@hcengineering/activity'
import { areEqualJson, extractReferences, jsonToMarkup, markupToJSON, markupToText } from '@hcengineering/text-core'
import { Receiver, MentionRef, Sender, getSenderName, normalizeTextMessage } from '@hcengineering/server-notification'
import contact, { type Employee, Person } from '@hcengineering/contact'

import { Client, NotificationSettings, NotifyResult, MentionResult } from './types'
import { getTxNotifyResult } from './utils'
import Cache from './cache'
import { IntlString } from '@hcengineering/platform'
import config from './config'

export async function createMentionsData (
  client: Client,
  cache: Cache,
  tx: TxCUD<Doc>,
  contexts: DocNotifyContext[],
  attachedToDoc: Doc | undefined,
  object: Doc,
  settings: NotificationSettings,
  type: TxNotificationType
): Promise<MentionResult> {
  if (tx._class === core.class.TxRemoveDoc) {
    return await removeMentionNotifications(client, tx as TxRemoveDoc<Doc>)
  }

  const { rest, hierarchy } = client
  const res: MentionResult = { txes: [], data: [] }

  const doc = attachedToDoc ?? object
  const message = hierarchy.isDerived(object._class, activity.class.ActivityMessage)
    ? (object as ActivityMessage)
    : undefined

  const references: MentionRef[] = await getMentionRefs(client, tx, doc, message)

  if (references.length === 0) return res

  const mentions =
    tx._class === core.class.TxCreateDoc
      ? []
      : await rest.findAll(activity.class.UserMentionInfo, { attachedTo: tx.objectId })

  for (const mention of mentions) {
    const refIndex = references.findIndex(
      (r) => mention.user === r.mentionId && mention.attachedTo === (r.messageId ?? r.docId)
    )
    const ref = references[refIndex]

    if (refIndex !== -1) {
      const alreadyProcessed = areEqualJson(JSON.parse(mention.content), JSON.parse(ref.markup))

      if (alreadyProcessed) {
        references.splice(refIndex, 1)
      }
    } else {
      const removeTxes = await getRemoveMentionTxes(client, mention, tx)
      res.txes.push(...removeTxes)
    }
  }

  if (references.length === 0) return res

  const space = await cache.getDocSpace(message ?? doc)
  if (space == null) return res

  for (const reference of references) {
    const receivers = await getReceivers(client, cache, reference, space)

    for (const receiver of receivers) {
      const context = contexts.find((it) => it.user === receiver.account)
      const notifyResult = await getTxNotifyResult(client, tx, doc, receiver, settings, [type])

      console.log('notifyResult:', notifyResult, receiver.account, doc, message)

      if ((notifyResult[notification.providers.InboxNotificationProvider]?.length ?? 0) === 0) continue

      const mention = mentions.find((it) => it.user === receiver.employeeRef)

      res.txes.push(getUpdateMentionTx(client, receiver.employeeRef, reference, space._id, mention))
      res.data.push(...(await getMentionNotificationData(context, receiver, doc, message, notifyResult, reference)))
    }
  }

  return res
}

async function getMentionNotificationData (
  context: DocNotifyContext | undefined,
  receiver: Receiver,
  doc: Doc,
  message: ActivityMessage | undefined,
  notifyResult: NotifyResult,
  reference: MentionRef
): Promise<MentionResult['data']> {
  const res: MentionResult['data'] = []

  res.push({
    data: {
      header: activity.string.MentionedYouIn,
      markup: message?.message ?? reference.markup,
      mentionedIn: message?._id ?? doc._id,
      mentionedInClass: message?._class ?? doc._class
    },
    context,
    receiver,
    notifyResult
  })

  return res
}

async function getReceivers (client: Client, cache: Cache, reference: MentionRef, space: Space): Promise<Receiver[]> {
  if (reference.mentionId === contact.mention.Everyone) {
    const collaborators = (await cache.getCollaborators(reference.docId, reference.docClass)).filter(
      (it) => !space.private || space.members.includes(it.collaborator)
    )
    return await cache.getReceivers(collaborators.map((it) => it.collaborator))
  } else if (reference.mentionId === contact.mention.Here) {
    const collaborators = (await cache.getCollaborators(reference.docId, reference.docClass)).filter(
      (it) => !space.private || space.members.includes(it.collaborator)
    )
    const statuses = await cache.getUserStatuses()

    return await cache.getReceivers(
      collaborators
        .filter((it) => statuses.some((s) => s.user === it.collaborator && s.online))
        .map((it) => it.collaborator)
    )
  } else {
    const employee = await client.rest.findOne(contact.mixin.Employee, { _id: reference.mentionId as Ref<Employee> })

    if (employee?.personUuid != null && (!space.private || space.members.includes(employee.personUuid))) {
      return await cache.getReceivers([employee.personUuid])
    }
  }

  return []
}

async function getMentionRefs (
  client: Client,
  tx: TxCUD<Doc>,
  doc: Doc,
  message?: ActivityMessage
): Promise<MentionRef[]> {
  const { hierarchy, storage, workspace, ctx } = client

  const refs: MentionRef[] = []

  const attributes: Map<string, AnyAttribute> = hierarchy.getAllAttributes(tx.objectClass)
  const txOperations = getTxOperations(tx)

  for (const attr of attributes.values()) {
    if (attr.type._class === core.class.TypeMarkup) {
      const content: string = txOperations[attr.name]?.toString() ?? ''
      const attrMentionRefs = getMentionRefsData(client, doc._id, doc._class, message?._id, message?._class, content)

      refs.push(...attrMentionRefs)
    } else if (attr.type._class === core.class.TypeCollaborativeDoc) {
      const blobId = txOperations[attr.name] as Ref<Blob>
      if (blobId != null && blobId !== '') {
        try {
          const buffer = await storage.read(
            ctx,
            {
              uuid: workspace.workspace,
              url: workspace.workspaceUrl
            },
            blobId
          )
          const markup = Buffer.concat(buffer as any).toString()
          const attrMentionRefs = getMentionRefsData(client, doc._id, doc._class, message?._id, message?._class, markup)
          refs.push(...attrMentionRefs)
        } catch {
          // do nothing, the collaborative doc does not sem to exist yet
        }
      }
    }
  }

  return refs
}

function getMentionRefsData (
  client: Client,
  docId: Ref<Doc>,
  docClass: Ref<Class<Doc>>,
  messageId: Ref<ActivityMessage> | undefined,
  messageClass: Ref<Class<ActivityMessage>> | undefined,
  content: Markup
): MentionRef[] {
  const { hierarchy } = client
  const references: MentionRef[] = []

  const node = markupToJSON(content)
  const rawMentionRefs = extractReferences(node)

  for (const raw of rawMentionRefs) {
    if (!hierarchy.isDerived(raw.objectClass, contact.class.Person)) continue
    if (raw.objectId !== messageId && raw.objectId !== docId) {
      references.push({
        mentionId: raw.objectId as Ref<Person>,
        mentionClass: raw.objectClass as Ref<Class<Person>>,
        docId,
        docClass,
        messageId,
        messageClass,
        markup: raw.parentNode !== null ? jsonToMarkup(raw.parentNode) : ''
      })
    }
  }

  return references
}

async function getRemoveMentionTxes (client: Client, mention: UserMentionInfo, tx: TxCUD<Doc>): Promise<Tx[]> {
  const { txFactory, hierarchy, rest } = client
  const res: Tx[] = []

  res.push(txFactory.createTxRemoveDoc(mention._class, mention.space, mention._id))

  if (!hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) return res

  const _id = tx.objectId as Ref<ActivityMessage>

  const person = await rest.findOne(contact.class.Person, { _id: mention.user })

  if (person?.personUuid == null) return res
  const account = person.personUuid as AccountUuid

  const notifications = await rest.findAll(notification.class.MentionInboxNotification, {
    mentionedIn: _id,
    user: account
  })

  res.push(...notifications.map((it) => txFactory.createTxRemoveDoc(it._class, it.space, it._id)))

  return res
}

function getUpdateMentionTx (
  client: Client,
  person: Ref<Person>,
  reference: MentionRef,
  space: Ref<Space>,
  mention: UserMentionInfo | undefined
): Tx {
  const { txFactory } = client
  if (mention == null) {
    return txFactory.createTxCreateDoc(activity.class.UserMentionInfo, space, {
      attachedTo: reference.messageId ?? reference.docId,
      attachedToClass: reference.messageClass ?? reference.docClass,
      user: person,
      content: reference.markup,
      collection: 'mentions'
    })
  }

  return txFactory.createTxUpdateDoc(mention._class, mention.space, mention._id, {
    content: reference.markup
  })
}

async function removeMentionNotifications (client: Client, tx: TxRemoveDoc<Doc>): Promise<MentionResult> {
  const { hierarchy, rest, txFactory } = client
  const attributes = hierarchy.getAllAttributes(tx.objectClass)

  let hasMarkdown = false

  for (const attr of attributes.values()) {
    if ([core.class.TypeMarkup, core.class.TypeCollaborativeDoc].includes(attr.type._class)) {
      hasMarkdown = true
      break
    }
  }

  if (hasMarkdown) {
    const txes: Tx[] = []

    const notifications = await rest.findAll(notification.class.MentionInboxNotification, {
      mentionedIn: tx.objectId
    })

    for (const notification of notifications) {
      const removeTx = txFactory.createTxRemoveDoc(notification._class, notification.space, notification._id)
      txes.push(removeTx)
    }

    return { txes, data: [] }
  }

  return { txes: [], data: [] }
}

export function getMentionNotificationContent (
  hierarchy: Hierarchy,
  doc: Doc,
  object: Doc,
  markup: Markup | undefined,
  sender: Sender
): NotificationContent {
  const message = hierarchy.isDerived(object._class, activity.class.ActivityMessage)
    ? (object as ActivityMessage)
    : undefined

  const intlParams: Record<string, string | number> = {}
  const intlParamsNotLocalized: Record<string, IntlString> = {}

  intlParams.message = normalizeTextMessage(markupToText(message?.message ?? markup ?? ''))
  intlParams.senderName = getSenderName(sender, config.LastNameFirst)

  if (message != null) {
    if (message.attachedToTitle != null) {
      intlParams.title = message.attachedToTitle
    }
    if (message.attachedToUrl != null) {
      intlParams.url = message.attachedToUrl
    }
    if (message.attachedToIdentifier != null) {
      intlParams.identifier = message.attachedToIdentifier
    }
  }

  if (intlParams.title == null) {
    const clazz = hierarchy.getClass(doc._class)

    if (clazz.titleKey != null) {
      intlParams.title = (doc as any)[clazz.titleKey]
    } else {
      const anyDoc = doc as any
      intlParams.title = anyDoc.title ?? anyDoc.name ?? anyDoc.label ?? 'Notification'
    }
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
