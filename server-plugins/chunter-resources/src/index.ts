//
// Copyright © 2022, 2023 Hardcore Engineering Inc.
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
import chunter, { Channel, ChatMessage, chunterId, ChunterSpace, ThreadMessage } from '@hcengineering/chunter'
import contact, { Employee, Person } from '@hcengineering/contact'
import core, {
  AccountUuid,
  Class,
  concatLink,
  Doc,
  DocumentQuery,
  FindOptions,
  FindResult,
  Hierarchy,
  notEmpty,
  Ref,
  Timestamp,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxProcessor,
  TxUpdateDoc,
  UserStatus,
  getClassCollaborators,
  type MeasureContext
} from '@hcengineering/core'
import notification, { DocNotifyContext, NotificationType } from '@hcengineering/notification'
import { getMetadata, translate } from '@hcengineering/platform'
import { getAccountBySocialId, getAddCollaboratorsTxes, getPerson } from '@hcengineering/server-contact'
import serverCore, { TriggerControl } from '@hcengineering/server-core'
import { markupToJSON } from '@hcengineering/text'
import { extractReferences } from '@hcengineering/text-core'
import { workbenchId } from '@hcengineering/workbench'
import { Receiver, TypeMatchClient, TypeMatchFunc } from '@hcengineering/server-notification'
import { encodeObjectURI } from '@hcengineering/view'
import { getCollaboratorsFromDocFields } from '@hcengineering/server-contact-resources'

const updateChatInfoDelay = 12 * 60 * 60 * 1000 // 12 hours
const hideChannelDelay = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function channelTitlePresenter (doc: Doc): Promise<string> {
  const channel = doc as ChunterSpace

  if (channel._class === chunter.class.DirectMessage) {
    return await translate(chunter.string.Direct, {})
  }

  return `#${channel.name}`
}

export async function channelURLPresenter (doc: Doc, control: TriggerControl): Promise<string> {
  const channel = doc as ChunterSpace
  const front = control.branding?.front ?? getMetadata(serverCore.metadata.FrontUrl) ?? ''
  const path = `${workbenchId}/${control.workspace.url}/${chunterId}/${encodeObjectURI(channel._id, channel._class)}`
  return concatLink(front, path)
}

export async function CommentRemove (
  doc: Doc,
  hiearachy: Hierarchy,
  findAll: <T extends Doc>(
    clazz: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Promise<FindResult<T>>
): Promise<Doc[]> {
  if (!hiearachy.isDerived(doc._class, chunter.class.ChatMessage)) {
    return []
  }

  const chatMessage = doc as ChatMessage

  return await findAll(activity.class.ActivityReference, {
    srcDocId: chatMessage.attachedTo,
    srcDocClass: chatMessage.attachedToClass,
    attachedDocId: chatMessage._id
  })
}

async function OnThreadMessageCreated (
  ctx: MeasureContext,
  originTx: TxCUD<Doc>,
  control: TriggerControl
): Promise<Tx[]> {
  const tx = originTx as TxCreateDoc<ThreadMessage>

  const threadMessage = TxProcessor.createDoc2Doc(tx)
  const message = await ctx.with(
    'load-message',
    {},
    async () => (await control.findAll(ctx, activity.class.ActivityMessage, { _id: threadMessage.attachedTo }))[0]
  )

  if (message === undefined) {
    return []
  }

  const lastReplyTx = control.txFactory.createTxUpdateDoc<ActivityMessage>(
    threadMessage.attachedToClass,
    threadMessage.space,
    threadMessage.attachedTo,
    {
      lastReply: originTx.modifiedOn
    }
  )

  const person = await ctx.with('load-message', {}, () => getPerson(control, originTx.modifiedBy))
  if (person === undefined) {
    return [lastReplyTx]
  }

  if ((message.repliedPersons ?? []).includes(person._id)) {
    return [lastReplyTx]
  }

  const repliedPersonTx = control.txFactory.createTxUpdateDoc<ActivityMessage>(
    threadMessage.attachedToClass,
    threadMessage.space,
    threadMessage.attachedTo,
    {
      $push: { repliedPersons: person._id }
    }
  )

  return [lastReplyTx, repliedPersonTx]
}

async function OnChatMessageCreated (ctx: MeasureContext, tx: TxCUD<Doc>, control: TriggerControl): Promise<Tx[]> {
  const hierarchy = control.hierarchy
  const actualTx = tx as TxCreateDoc<ChatMessage>

  const message = TxProcessor.createDoc2Doc(actualTx)
  if (message.modifiedBy === core.account.System) return []
  const mixin = getClassCollaborators(control.modelDb, hierarchy, message.attachedToClass)

  if (mixin === undefined) {
    return []
  }

  const targetDoc = (await control.findAll(ctx, message.attachedToClass, { _id: message.attachedTo }, { limit: 1 }))[0]
  if (targetDoc === undefined) {
    return []
  }
  const isChannel = hierarchy.isDerived(targetDoc._class, chunter.class.Channel)
  const res: Tx[] = []
  const account = await getAccountBySocialId(control, message.modifiedBy)
  const node = markupToJSON(message.message)
  const references = extractReferences(node)
  const mentionedPersons = references
    .filter(({ objectClass }) => control.hierarchy.isDerived(objectClass, contact.class.Person))
    .map(({ objectId }) => objectId as Ref<Person>)
  const employees =
    mentionedPersons.length > 0
      ? await control.findAll(ctx, contact.mixin.Employee, { _id: { $in: mentionedPersons as Ref<Employee>[] } })
      : []
  const collaboratorsFromMessage = [...employees.map((it) => it.personUuid), account].filter(notEmpty)
  let currentCollaborators = (
    await control.findAll(ctx, core.class.Collaborator, {
      attachedTo: targetDoc._id
    })
  ).map((it) => it.collaborator)

  if (currentCollaborators.length === 0) {
    const mixin = getClassCollaborators(control.modelDb, control.hierarchy, targetDoc._class)
    if (mixin !== undefined) {
      const collaborators = await getCollaboratorsFromDocFields(ctx, control, targetDoc, mixin)
      currentCollaborators = collaborators
      res.push(...getAddCollaboratorsTxes(tx.objectId, tx.objectClass, tx.objectSpace, control, collaborators))
    }
  }

  const classCollab = (
    await control.findAll(control.ctx, core.class.ClassCollaborators, { attachedTo: targetDoc._class })
  )[0]
  if (classCollab?.provideSecurity !== true) {
    for (const collab of collaboratorsFromMessage) {
      if (currentCollaborators.includes(collab)) {
        continue
      }

      const tx = control.txFactory.createTxCreateDoc(core.class.Collaborator, targetDoc.space, {
        attachedTo: targetDoc._id,
        attachedToClass: targetDoc._class,
        collaborator: collab,
        collection: 'collaborators'
      })

      res.push(tx)
    }
  }

  if (account != null && isChannel && !(targetDoc as Channel).members.includes(account)) {
    res.push(...joinChannel(control, targetDoc as Channel, account))
  }

  return res
}

function joinChannel (control: TriggerControl, channel: Channel, user: AccountUuid): Tx[] {
  if (channel.members.includes(user)) {
    return []
  }

  return [
    control.txFactory.createTxUpdateDoc(channel._class, channel.space, channel._id, {
      $push: { members: user }
    })
  ]
}

async function OnThreadMessageDeleted (tx: Tx, control: TriggerControl): Promise<Tx[]> {
  // TODO: FIXME
  return []
  // const removeTx = tx as TxRemoveDoc<ThreadMessage>

  // const message = control.removedMap.get(removeTx.objectId) as ThreadMessage

  // if (message === undefined) {
  //   return []
  // }

  // const messages = await control.findAll(control.ctx, chunter.class.ThreadMessage, {
  //   attachedTo: message.attachedTo
  // })

  // const repliedPersons = await getPersons(control, messages.map((m) => m.createdBy).filter((pid) => pid !== undefined))

  // const updateTx = control.txFactory.createTxUpdateDoc<ActivityMessage>(
  //   message.attachedToClass,
  //   message.space,
  //   message.attachedTo,
  //   {
  //     repliedPersons: repliedPersons.map((p) => p._id),
  //     lastReply:
  //       messages.length > 0
  //         ? Math.max(...messages.map(({ createdOn, modifiedOn }) => createdOn ?? modifiedOn))
  //         : undefined
  //   }
  // )

  // return [updateTx]
}

/**
 * @public
 */
export async function ChunterTrigger (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    if (
      tx._class === core.class.TxCreateDoc &&
      control.hierarchy.isDerived(tx.objectClass, chunter.class.ThreadMessage)
    ) {
      res.push(
        ...(await control.ctx.with('OnThreadMessageCreated', {}, (ctx) => OnThreadMessageCreated(ctx, tx, control)))
      )
    }
    if (
      tx._class === core.class.TxRemoveDoc &&
      control.hierarchy.isDerived(tx.objectClass, chunter.class.ThreadMessage)
    ) {
      res.push(...(await control.ctx.with('OnThreadMessageDeleted', {}, (ctx) => OnThreadMessageDeleted(tx, control))))
    }
    if (
      tx._class === core.class.TxCreateDoc &&
      control.hierarchy.isDerived(tx.objectClass, chunter.class.ChatMessage)
    ) {
      res.push(...(await control.ctx.with('OnChatMessageCreated', {}, (ctx) => OnChatMessageCreated(ctx, tx, control))))
    }
  }
  return res
}

async function OnChatMessageRemoved (txes: TxCUD<ChatMessage>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    if (tx._class !== core.class.TxRemoveDoc) {
      continue
    }

    const notifications = await control.findAll(control.ctx, notification.class.InboxNotification, {
      attachedTo: tx.objectId
    })

    notifications.forEach((notification) => {
      res.push(control.txFactory.createTxRemoveDoc(notification._class, notification.space, notification._id))
    })
  }
  return res
}

function getDirectsToHide (directs: DocNotifyContext[], date: Timestamp): DocNotifyContext[] {
  const minVisibleDirects = 10

  if (directs.length <= minVisibleDirects) return []
  const hideCount = directs.length - minVisibleDirects

  const toHide: DocNotifyContext[] = []

  for (const context of directs) {
    const { lastUpdate = 0, lastView = 0 } = context
    if (lastView === 0) continue
    if (lastUpdate > lastView) continue
    if (date - lastUpdate > hideChannelDelay) {
      toHide.push(context)
    }
  }

  toHide.sort((a, b) => (a.lastUpdate ?? 0) - (b.lastUpdate ?? 0))

  return toHide.slice(0, hideCount)
}

function getActivityToHide (contexts: DocNotifyContext[], date: Timestamp): DocNotifyContext[] {
  if (contexts.length === 0) return []
  const toHide: DocNotifyContext[] = []

  for (const context of contexts) {
    const { lastUpdate = 0, lastView = 0 } = context
    if (lastView === 0) continue
    if (lastUpdate > lastView) continue
    if (date - lastUpdate > hideChannelDelay) {
      toHide.push(context)
    }
  }

  return toHide
}

export async function syncChat (control: TriggerControl, status: UserStatus, date: Timestamp): Promise<void> {
  const person = (await control.findAll(control.ctx, contact.class.Person, { personUuid: status.user }))[0]
  if (person == null) return

  const syncInfo = (await control.findAll(control.ctx, chunter.class.ChatSyncInfo, { user: person._id })).shift()
  const shouldSync = syncInfo === undefined || date - syncInfo.timestamp > updateChatInfoDelay
  if (!shouldSync) return

  const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
    user: status.user,
    hidden: false,
    isPinned: false
  })

  if (contexts.length === 0) return

  const { hierarchy } = control
  const res: Tx[] = []

  const directContexts = contexts.filter(({ objectClass }) =>
    hierarchy.isDerived(objectClass, chunter.class.DirectMessage)
  )
  const activityContexts = contexts.filter(
    ({ objectClass }) =>
      !hierarchy.isDerived(objectClass, chunter.class.ChunterSpace) &&
      !hierarchy.isDerived(objectClass, activity.class.ActivityMessage)
  )

  const directsToHide = getDirectsToHide(directContexts, date)
  const activityToHide = getActivityToHide(activityContexts, date)
  const contextsToHide = directsToHide.concat(activityToHide)

  for (const context of contextsToHide) {
    res.push(
      control.txFactory.createTxUpdateDoc(context._class, context.space, context._id, {
        hidden: true
      })
    )
  }

  if (syncInfo === undefined) {
    const personSpace = (await control.findAll(control.ctx, contact.class.PersonSpace, { person: person._id })).shift()
    if (personSpace !== undefined) {
      res.push(
        control.txFactory.createTxCreateDoc(chunter.class.ChatSyncInfo, personSpace._id, {
          user: person._id,
          timestamp: date
        })
      )
    }
  } else {
    res.push(
      control.txFactory.createTxUpdateDoc(syncInfo._class, syncInfo.space, syncInfo._id, {
        timestamp: date
      })
    )
  }

  await control.apply(control.ctx, res, true)
}

async function OnUserStatus (txes: TxCUD<UserStatus>[], control: TriggerControl): Promise<Tx[]> {
  for (const tx of txes) {
    if (tx.objectClass !== core.class.UserStatus) {
      continue
    }
    if (tx._class === core.class.TxCreateDoc) {
      const createTx = tx as TxCreateDoc<UserStatus>
      const { online } = createTx.attributes
      if (online) {
        const status = TxProcessor.createDoc2Doc(createTx)
        await syncChat(control, status, tx.modifiedOn)
      }
    } else if (tx._class === core.class.TxUpdateDoc) {
      const updateTx = tx as TxUpdateDoc<UserStatus>
      const { online } = updateTx.operations
      if (online === true) {
        const status = (await control.findAll(control.ctx, core.class.UserStatus, { _id: updateTx.objectId }))[0]
        await syncChat(control, status, tx.modifiedOn)
      }
    }
  }

  return []
}

const JoinChannelTypeMatch: TypeMatchFunc = (
  _client: TypeMatchClient,
  _type: NotificationType,
  _object: Doc,
  doc: Doc,
  receiver: Receiver
) => {
  const message = _object as DocUpdateMessage
  const author = message.createdBy ?? message.modifiedBy

  if (receiver.socialIds.includes(author)) {
    return false
  }

  if (message.action === 'update') {
    const added = message.attributeUpdates?.added ?? []
    const set = message.attributeUpdates?.set ?? []

    return added.includes(receiver.account) || set.includes(receiver.account)
  }

  if (message.action === 'create') {
    return (doc as Channel).members.includes(receiver.account)
  }

  return false
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    ChunterTrigger,
    OnChatMessageRemoved,
    OnUserStatus
  },
  function: {
    CommentRemove,
    ChannelUrlPresenter: channelURLPresenter,
    ChannelTitlePresenter: channelTitlePresenter,
    JoinChannelTypeMatch
  }
})
