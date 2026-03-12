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

import activity, { ActivityMessage } from '@hcengineering/activity'
import chunter, {
  Chat,
  ChatMessage,
  chunterId,
  ChunterSpace,
  DirectMessage,
  ThreadMessage
} from '@hcengineering/chunter'
import contact from '@hcengineering/contact'
import core, {
  Class,
  concatLink,
  Doc,
  DocumentQuery,
  FindOptions,
  FindResult,
  Hierarchy,
  Ref,
  Timestamp,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxProcessor,
  TxUpdateDoc,
  UserStatus,
  type MeasureContext,
  Collaborator,
  TxRemoveDoc,
  SortingOrder,
  getClassCollaborators
} from '@hcengineering/core'
import notification, { DocNotifyContext } from '@hcengineering/notification'
import { getMetadata, translate } from '@hcengineering/platform'
import {
  getAccountBySocialId,
  getAddCollaboratorsTxes,
  getPerson,
  getPersonSpaces
} from '@hcengineering/server-contact'
import serverCore, { TriggerControl } from '@hcengineering/server-core'
import { workbenchId } from '@hcengineering/workbench'
import { encodeObjectURI } from '@hcengineering/view'
import { Presenter, PresenterControl } from '@hcengineering/server-activity'

import { JoinChannelTypeMatch } from './utils'

const updateChatInfoDelay = 24 * 60 * 60 * 1000 // 24 hours
const hideChannelDelay = 7 * 24 * 60 * 60 * 1000 // 7 days

const channelTitlePresenter: Presenter = async (doc: Doc, control: PresenterControl): Promise<string> => {
  const channel = doc as ChunterSpace

  if (channel._class === chunter.class.DirectMessage) {
    const direct = channel as DirectMessage
    return direct.type === 'person'
      ? await translate(chunter.string.Direct, {}, control.branding?.defaultLanguage)
      : await translate(chunter.string.GroupChat, {}, control.branding?.defaultLanguage)
  }

  return `#${channel.name}`
}

const channelURLPresenter: Presenter = async (doc: Doc, control: PresenterControl): Promise<string> => {
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

async function OnChatMessageCreated (
  ctx: MeasureContext,
  tx: TxCreateDoc<ChatMessage>,
  control: TriggerControl
): Promise<Tx[]> {
  const hierarchy = control.hierarchy

  const message = TxProcessor.createDoc2Doc(tx)
  if (message.modifiedBy === core.account.System) return []

  const mixin = getClassCollaborators(control.modelDb, hierarchy, message.attachedToClass)
  if (mixin === undefined || mixin.provideSecurity === true) return []

  const account = await getAccountBySocialId(control, message.modifiedBy)
  if (account == null) return []

  const collaborator = (
    await control.findAll(ctx, core.class.Collaborator, {
      attachedTo: message.attachedTo,
      collaborator: account
    })
  )[0]

  if (collaborator != null) return []

  const targetDoc = (await control.findAll(ctx, message.attachedToClass, { _id: message.attachedTo }, { limit: 1 }))[0]
  if (targetDoc === undefined) return []

  const res: Tx[] = []

  res.push(...getAddCollaboratorsTxes(targetDoc._id, targetDoc._class, targetDoc.space, control, [account]))

  return res
}

async function ChunterTrigger (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
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
      res.push(
        ...(await control.ctx.with('OnChatMessageCreated', {}, (ctx) =>
          OnChatMessageCreated(ctx, tx as TxCreateDoc<ChatMessage>, control)
        ))
      )
    }
  }
  return res
}

async function getDirectsToHide (
  control: TriggerControl,
  directs: Chat[],
  contexts: DocNotifyContext[],
  date: Timestamp
): Promise<Chat[]> {
  const minVisibleDirects = 10

  if (directs.length <= minVisibleDirects) return []
  const hideCount = directs.length - minVisibleDirects

  const toHide: { direct: Chat, lastUpdate: Timestamp }[] = []

  for (const direct of directs) {
    const context = contexts.find((it) => it.objectId === direct.attachedTo)
    if (context != null) {
      const { lastUpdate = 0, lastView = 0 } = context
      if (lastView === 0) continue
      if (lastUpdate > lastView) continue
      if (date - lastUpdate > hideChannelDelay) {
        toHide.push({ lastUpdate, direct })
      }
    } else {
      const lastMessage = (
        await control.findAll(
          control.ctx,
          activity.class.ActivityMessage,
          { attachedTo: direct.attachedTo },
          { limit: 1, sort: { createdOn: SortingOrder.Descending } }
        )
      )[0]
      const lastUpdate = lastMessage.modifiedOn ?? direct.modifiedOn
      if (date - lastUpdate > hideChannelDelay) {
        toHide.push({ lastUpdate, direct })
      }
    }
  }

  toHide.sort((a, b) => (a.lastUpdate ?? 0) - (b.lastUpdate ?? 0))

  return toHide.slice(0, hideCount).map((it) => it.direct)
}

async function getActivityToHide (
  control: TriggerControl,
  chats: Chat[],
  contexts: DocNotifyContext[],
  date: Timestamp
): Promise<Chat[]> {
  if (chats.length === 0) return []
  const toHide: Chat[] = []

  for (const chat of chats) {
    const context = contexts.find((it) => it.objectId === chat.attachedTo)
    if (context != null) {
      const { lastUpdate = 0, lastView = 0 } = context
      if (lastView === 0) continue
      if (lastUpdate > lastView) continue
      if (date - lastUpdate > hideChannelDelay) {
        toHide.push(chat)
      }
    } else {
      const lastMessage = (
        await control.findAll(
          control.ctx,
          activity.class.ActivityMessage,
          { attachedTo: chat.attachedTo },
          { limit: 1, sort: { createdOn: SortingOrder.Descending } }
        )
      )[0]
      const lastUpdate = lastMessage.modifiedOn ?? chat.modifiedOn
      if (date - lastUpdate > hideChannelDelay) {
        toHide.push(chat)
      }
    }
  }

  return toHide
}

export async function syncChat (control: TriggerControl, status: UserStatus, date: Timestamp): Promise<Tx[]> {
  const syncInfo = (await control.findAll(control.ctx, chunter.class.ChatSyncInfo, { user: status.user })).shift()
  const shouldSync = syncInfo === undefined || date - syncInfo.timestamp > updateChatInfoDelay

  if (!shouldSync) return []

  const chats = await control.findAll(control.ctx, chunter.class.Chat, {
    user: status.user,
    hidden: false,
    isPinned: false
  })

  const { hierarchy } = control
  const res: Tx[] = []
  const directChats = chats.filter(({ attachedToClass }) =>
    hierarchy.isDerived(attachedToClass, chunter.class.DirectMessage)
  )
  const activityChats = chats.filter(
    ({ attachedToClass }) => !hierarchy.isDerived(attachedToClass, chunter.class.ChunterSpace)
  )

  if (directChats.length > 10 || activityChats.length > 0) {
    const contexts = await control.findAll(control.ctx, notification.class.DocNotifyContext, {
      user: status.user
    })
    const directsToHide = await getDirectsToHide(control, directChats, contexts, date)
    const activityToHide = await getActivityToHide(control, activityChats, contexts, date)
    const toHide = directsToHide.concat(activityToHide)
    for (const chat of toHide) {
      const updateTx = control.txFactory.createTxUpdateDoc(chat._class, chat.space, chat._id, {
        hidden: true
      })
      res.push(
        control.txFactory.createTxCollectionCUD(chat.attachedToClass, chat.attachedTo, chat.space, 'chats', updateTx)
      )
    }
  }
  if (syncInfo === undefined) {
    const personSpace = (await control.findAll(control.ctx, contact.class.PersonSpace, { account: status.user }))[0]
    if (personSpace !== undefined) {
      res.push(
        control.txFactory.createTxCreateDoc(chunter.class.ChatSyncInfo, personSpace._id, {
          user: status.user,
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

  return res
}

async function OnUserStatus (txes: TxCUD<UserStatus>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []

  for (const tx of txes) {
    if (tx.objectClass !== core.class.UserStatus) continue

    if (tx._class === core.class.TxCreateDoc) {
      const createTx = tx as TxCreateDoc<UserStatus>
      const { online } = createTx.attributes
      if (online) {
        const status = TxProcessor.createDoc2Doc(createTx)
        res.push(...(await syncChat(control, status, tx.modifiedOn)))
      }
    } else if (tx._class === core.class.TxUpdateDoc) {
      const updateTx = tx as TxUpdateDoc<UserStatus>
      const { online } = updateTx.operations
      if (online === true) {
        const status = (await control.findAll(control.ctx, core.class.UserStatus, { _id: updateTx.objectId }))[0]
        res.push(...(await syncChat(control, status, tx.modifiedOn)))
      }
    }
  }

  await control.apply(control.ctx, res, true)
  return []
}

async function OnCollaboratorAdded (txes: TxCreateDoc<Collaborator>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  const spaces = await getPersonSpaces(control)
  for (const tx of txes) {
    const collaborator = TxProcessor.createDoc2Doc(tx)
    const space = spaces.find((s) => s.account === collaborator.collaborator)
    if (space == null) continue
    if (control.hierarchy.classHierarchyMixin(collaborator.attachedToClass, activity.mixin.ActivityDoc) == null) {
      continue
    }

    const createTx = control.txFactory.createTxCreateDoc(chunter.class.Chat, space._id, {
      attachedTo: collaborator.attachedTo,
      attachedToClass: collaborator.attachedToClass,
      account: collaborator.collaborator,
      pinned: false,
      hidden: false,
      collection: 'chats'
    })
    res.push(
      control.txFactory.createTxCollectionCUD(
        collaborator.attachedToClass,
        collaborator.attachedTo,
        space._id,
        'chats',
        createTx
      )
    )
  }

  return res
}

async function OnCollaboratorRemoved (txes: TxRemoveDoc<Collaborator>[], control: TriggerControl): Promise<Tx[]> {
  const res: Tx[] = []
  for (const tx of txes) {
    const collaborator = control.removedMap.get(tx.objectId) as Collaborator | undefined
    if (collaborator == null) continue
    if (control.hierarchy.classHierarchyMixin(collaborator.attachedToClass, activity.mixin.ActivityDoc) == null) {
      continue
    }
    const chats = await control.findAll(control.ctx, chunter.class.Chat, {
      account: collaborator.collaborator,
      attachedTo: collaborator.attachedTo
    })
    if (chats.length === 0) continue
    res.push(
      ...chats.map((chat) =>
        control.txFactory.createTxCollectionCUD(
          chat.attachedToClass,
          chat.attachedTo,
          chat.space,
          'chats',
          control.txFactory.createTxRemoveDoc(chat._class, chat.space, chat._id)
        )
      )
    )
  }

  return res
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    ChunterTrigger,
    OnUserStatus,
    OnCollaboratorAdded,
    OnCollaboratorRemoved
  },
  function: {
    CommentRemove,
    ChannelUrlPresenter: channelURLPresenter,
    ChannelTitlePresenter: channelTitlePresenter,
    JoinChannelTypeMatch
  }
})
