//
// Copyright © 2022 Hardcore Engineering Inc.
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

import { type Chat, type ChatMessage, chunterId, type DirectMessage, type ThreadMessage } from '@hcengineering/chunter'
import core, {
  TxOperations,
  type Class,
  type Doc,
  type Domain,
  type Ref,
  type Space,
  DOMAIN_TX,
  DOMAIN_SPACE,
  DOMAIN_MODEL,
  type AccountUuid,
  DOMAIN_COLLABORATOR,
  type Collaborator,
  type TxUpdateDoc,
  notEmpty
} from '@hcengineering/core'
import {
  tryMigrate,
  tryUpgrade,
  type MigrateOperation,
  type MigrationClient,
  type MigrationUpgradeClient,
  type MigrationDocumentQuery,
  type MigrateUpdate
} from '@hcengineering/model'
import activity, { migrateMessagesSpace, DOMAIN_ACTIVITY, DOMAIN_REACTION } from '@hcengineering/model-activity'
import { getAllAccounts } from '@hcengineering/contact'
import { DOMAIN_DOC_NOTIFY, newReadState } from '@hcengineering/model-notification'
import { type ActivityMessage, type DocUpdateMessage, type Reaction } from '@hcengineering/activity'

import { DOMAIN_CHUNTER, DOMAIN_CHUNTER_DOC } from './index'
import chunter from './plugin'
import { createHash } from 'crypto'
import { type Attachment } from '@hcengineering/attachment'
import { DOMAIN_ATTACHMENT } from '@hcengineering/model-attachment'
import notification, { type DocNotifyContext, DOMAIN_READ_STATE, type ReadState } from '@hcengineering/notification'

export const DOMAIN_COMMENT = 'comment' as Domain
export const DOMAIN_NOTIFICATION = 'notification' as Domain

export async function createGeneral (client: MigrationUpgradeClient, tx: TxOperations): Promise<void> {
  const current = await tx.findOne(chunter.class.Channel, { _id: chunter.space.General })
  if (current !== undefined) {
    if (current.autoJoin === undefined) {
      await tx.update(current, {
        autoJoin: true
      })
      await joinEmployees(current, tx)
    }
  } else {
    const createTx = await tx.findOne(core.class.TxCreateDoc, {
      objectId: chunter.space.General
    })

    if (createTx === undefined) {
      await tx.createDoc(
        chunter.class.Channel,
        core.space.Space,
        {
          name: 'general',
          description: 'General Channel',
          topic: 'General Channel',
          private: false,
          archived: false,
          members: await getAllAccounts(tx),
          autoJoin: true
        },
        chunter.space.General
      )
    }
  }
}

async function joinEmployees (current: Space, tx: TxOperations): Promise<void> {
  const allAccounts = await getAllAccounts(tx)
  const newMembers = [...current.members]

  for (const account of allAccounts) {
    if (!newMembers.includes(account)) {
      newMembers.push(account)
    }
  }

  await tx.update(current, {
    members: newMembers
  })
}

export async function createRandom (client: MigrationUpgradeClient, tx: TxOperations): Promise<void> {
  const current = await tx.findOne(chunter.class.Channel, { _id: chunter.space.Random })
  if (current !== undefined) {
    if (current.autoJoin === undefined) {
      await tx.update(current, {
        autoJoin: true
      })
      await joinEmployees(current, tx)
    }
  } else {
    const createTx = await tx.findOne(core.class.TxCreateDoc, {
      objectId: chunter.space.Random
    })

    if (createTx === undefined) {
      await tx.createDoc(
        chunter.class.Channel,
        core.space.Space,
        {
          name: 'random',
          description: 'Random Talks',
          topic: 'Random Talks',
          private: false,
          archived: false,
          members: await getAllAccounts(tx),
          autoJoin: true
        },
        chunter.space.Random
      )
    }
  }
}

// The default channels are created here, past the trigger that gives any other doc its read state,
// and a channel without one cannot be read.
async function createDefaultReadStates (tx: TxOperations): Promise<void> {
  for (const _id of [chunter.space.General, chunter.space.Random]) {
    const channel = await tx.findOne(chunter.class.Channel, { _id })
    if (channel === undefined) continue
    const state = await tx.findOne(notification.class.ReadState, { attachedTo: _id })
    if (state !== undefined) continue
    await tx.createDoc(notification.class.ReadState, _id, {
      attachedTo: _id,
      attachedToClass: channel._class,
      collection: 'readStates',
      latestMessageTimestamp: 0
    })
  }
}

async function convertCommentsToChatMessages (client: MigrationClient): Promise<void> {
  if (!client.hierarchy.domains().includes(DOMAIN_COMMENT)) return
  await client.update(
    DOMAIN_COMMENT,
    { _class: 'chunter:class:Comment' as Ref<Class<Doc>> },
    { _class: chunter.class.ChatMessage }
  )
  await client.move(DOMAIN_COMMENT, { _class: chunter.class.ChatMessage }, DOMAIN_ACTIVITY)
}

async function removeBacklinks (client: MigrationClient): Promise<void> {
  if (client.hierarchy.domains().includes(DOMAIN_COMMENT)) {
    await client.deleteMany(DOMAIN_COMMENT, { _class: 'chunter:class:Backlink' as Ref<Class<Doc>> })
  }
  await client.deleteMany(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    objectClass: 'chunter:class:Backlink'
  })
}

async function removeOldClasses (client: MigrationClient): Promise<void> {
  const classes = [
    'chunter:class:ChunterMessage',
    'chunter:class:Message',
    'chunter:class:Comment',
    'chunter:class:Backlink'
  ] as Ref<Class<Doc>>[]

  for (const _class of classes) {
    await client.deleteMany(DOMAIN_CHUNTER, { _class })
    await client.deleteMany(DOMAIN_ACTIVITY, { attachedToClass: _class })
    await client.deleteMany(DOMAIN_ACTIVITY, { objectClass: _class })
    await client.deleteMany(DOMAIN_NOTIFICATION, { attachedToClass: _class })
    await client.deleteMany(DOMAIN_TX, { objectClass: _class })
    await client.deleteMany(DOMAIN_TX, { 'tx.objectClass': _class })
  }
}

async function removeWrongActivity (client: MigrationClient): Promise<void> {
  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.Channel,
    action: 'update',
    'attributeUpdates.attrKey': { $ne: 'members' }
  })

  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.Channel,
    action: 'create',
    objectClass: { $ne: chunter.class.Channel }
  })

  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.Channel,
    action: 'remove'
  })

  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.DirectMessage,
    action: 'update',
    'attributeUpdates.attrKey': { $ne: 'members' }
  })

  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.DirectMessage,
    action: 'create'
  })

  await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
    _class: activity.class.DocUpdateMessage,
    attachedToClass: chunter.class.DirectMessage,
    action: 'remove'
  })
}

async function removeChatSync (client: MigrationClient): Promise<void> {
  await client.deleteMany<DocUpdateMessage>(DOMAIN_CHUNTER, {
    _class: chunter.class.ChatSyncInfo
  })
}

async function migrateDuplicatedDirects (client: MigrationClient): Promise<void> {
  const iterator = await client.traverse<DirectMessage>(DOMAIN_SPACE, { _class: chunter.class.DirectMessage })

  const directsMap = new Map<string, Ref<DirectMessage>[]>()
  const updates: { filter: MigrationDocumentQuery<DirectMessage>, update: MigrateUpdate<DirectMessage> }[] = []
  const migrateFromTo = new Map<Ref<DirectMessage>, Ref<DirectMessage>>()

  function getMembersHash (uuids: AccountUuid[]): string | undefined {
    if (uuids.length === 0) return undefined

    return createHash('sha256').update(uuids.slice().sort().join('|')).digest().toString('base64url')
  }

  while (true) {
    const directs = (await iterator.next(500)) ?? []
    if (directs.length === 0) break

    for (const direct of directs) {
      const accounts = Array.from(new Set(direct.members))
      if (accounts.length > 2) {
        updates.push({
          filter: { _id: direct._id },
          update: { type: 'group' }
        })
        continue
      }

      updates.push({
        filter: { _id: direct._id },
        update: { type: 'person' }
      })

      if (direct.referenceId != null) continue

      const referenceId = getMembersHash(accounts)
      if (referenceId === undefined) continue

      directsMap.set(referenceId, [...(directsMap.get(referenceId) ?? []), direct._id])
    }
  }

  for (const [referenceId, directs] of directsMap) {
    if (directs.length === 0) continue
    if (directs.length === 1) {
      const direct = directs[0]
      updates.push({
        filter: { _id: direct },
        update: { referenceId }
      })
    } else {
      const toDirect = directs[0]
      updates.push({
        filter: { _id: toDirect },
        update: { referenceId }
      })
      for (const from of directs.slice(1)) {
        migrateFromTo.set(from, toDirect)
      }
    }
  }

  if (updates.length > 0) {
    await client.bulk(DOMAIN_SPACE, updates)
  }

  for (const [from, to] of migrateFromTo) {
    await client.update<ActivityMessage>(DOMAIN_ACTIVITY, { attachedTo: from }, { attachedTo: to, space: to })
    await client.update<Reaction>(DOMAIN_REACTION, { space: from }, { space: to })
    await client.update<Attachment>(DOMAIN_ATTACHMENT, { space: from }, { space: to })

    const toContexts = await client.find<DocNotifyContext>(DOMAIN_DOC_NOTIFY, { objectId: to })
    for (const context of toContexts) {
      await client.update(
        DOMAIN_NOTIFICATION,
        { objectId: from, user: context.user },
        { objectId: to, docNotifyContext: context._id }
      )
    }

    await client.deleteMany(DOMAIN_SPACE, { _id: from })
    await client.deleteMany(DOMAIN_CHUNTER_DOC, { attacheTo: from })
    await client.deleteMany<DocNotifyContext>(DOMAIN_DOC_NOTIFY, { objectId: from })
  }
}

async function removeUnavailableChats (client: MigrationClient): Promise<void> {
  const iterator = await client.traverse<Chat>(DOMAIN_CHUNTER_DOC, {
    _class: chunter.class.Chat,
    attachedToClass: { $in: [chunter.class.DirectMessage, chunter.class.Channel] }
  })

  try {
    while (true) {
      const chats = (await iterator.next(500)) ?? []
      if (chats.length === 0) break

      const spaceIds = Array.from(new Set(chats.map((c) => c.attachedTo as Ref<Space>)))
      const spaces = await client.find<Space>(DOMAIN_SPACE, { _id: { $in: spaceIds } })
      const spaceMap = new Map<Ref<Space>, Space>()
      for (const space of spaces) {
        spaceMap.set(space._id, space)
      }

      const chatsToDelete: Ref<Chat>[] = []
      const collaboratorsToDelete: Pick<Collaborator, 'attachedTo' | 'collaborator'>[] = []

      for (const chat of chats) {
        const space = spaceMap.get(chat.attachedTo as Ref<Space>)
        if (space != null && !space.members.includes(chat.account)) {
          chatsToDelete.push(chat._id)
          collaboratorsToDelete.push({ attachedTo: space._id, collaborator: chat.account })
        }
      }

      if (chatsToDelete.length > 0) {
        await client.deleteMany(DOMAIN_CHUNTER_DOC, { _id: { $in: chatsToDelete } })
      }
      if (collaboratorsToDelete.length > 0) {
        await client.deleteMany<Collaborator>(DOMAIN_COLLABORATOR, { $or: collaboratorsToDelete })
      }
    }
  } finally {
    await iterator.close()
  }
}

export async function unhideAutoHiddenDirects (client: MigrationClient): Promise<void> {
  const hiddenDirects = new Map(
    (
      await client.find<Chat>(
        DOMAIN_CHUNTER_DOC,
        { _class: chunter.class.Chat, attachedToClass: chunter.class.DirectMessage, hidden: true },
        { projection: { _id: 1, attachedTo: 1 } }
      )
    ).map((it) => [it._id, it.attachedTo])
  )
  if (hiddenDirects.size === 0) return

  // One pass: tx.objectId has no index, a per-batch $in would scan the table every time.
  const lastHiddenTx = new Map<Ref<Chat>, TxUpdateDoc<Chat>>()
  const txIterator = await client.traverse<TxUpdateDoc<Chat>>(DOMAIN_TX, {
    _class: core.class.TxUpdateDoc,
    objectClass: chunter.class.Chat,
    'operations.hidden': { $exists: true }
  })
  try {
    while (true) {
      const txes = (await txIterator.next(1000)) ?? []
      if (txes.length === 0) break
      for (const tx of txes) {
        if (!hiddenDirects.has(tx.objectId)) continue
        const last = lastHiddenTx.get(tx.objectId)
        if (last !== undefined && last.modifiedOn > tx.modifiedOn) continue
        lastHiddenTx.set(tx.objectId, tx)
      }
    }
  } finally {
    await txIterator.close()
  }

  const toUnhide: Ref<Chat>[] = []
  for (const [chatId, direct] of hiddenDirects) {
    const tx = lastHiddenTx.get(chatId)
    if (tx?.operations.hidden === true) {
      // A message after the user's hide means the chat was auto-unhidden: a DerivedTx, not stored in DOMAIN_TX.
      const newer = await client.find<ChatMessage>(
        DOMAIN_ACTIVITY,
        { _class: chunter.class.ChatMessage, attachedTo: direct, createdOn: { $gt: tx.modifiedOn } },
        { limit: 1, projection: { _id: 1 } }
      )
      if (newer.length === 0) continue
    }
    toUnhide.push(chatId)
  }
  for (let i = 0; i < toUnhide.length; i += 500) {
    await client.update<Chat>(DOMAIN_CHUNTER_DOC, { _id: { $in: toUnhide.slice(i, i + 500) } }, { hidden: false })
  }
  client.logger.log('unhidden auto-hidden directs', { count: toUnhide.length, hidden: hiddenDirects.size })
}

const BATCH = 500

interface ChatRefs extends Doc {
  attachedTo: Ref<Doc>
  attachedToClass: Ref<Class<Doc>>
}

interface DocRef {
  domain: Domain
  id: Ref<Doc>
}

const refKey = (ref: DocRef): string => `${ref.domain}:${ref.id}`

// A failed step starts over on every upgrade: one bad document is logged and skipped instead.
async function attempt<T> (
  client: MigrationClient,
  what: string,
  data: object,
  fn: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err: any) {
    client.logger.error(what, { ...data, err })
    return undefined
  }
}

// A write resolves to nothing, so its outcome is whether it threw.
async function written (
  client: MigrationClient,
  what: string,
  data: object,
  fn: () => Promise<unknown>
): Promise<boolean> {
  try {
    await fn()
    return true
  } catch (err: any) {
    client.logger.error(what, { ...data, err })
    return false
  }
}

// A batch write fails as a whole on one bad row: then the rows go one by one, each on its own.
async function createEach<T extends Doc> (client: MigrationClient, domain: Domain, docs: T[]): Promise<number> {
  if (docs.length === 0) return 0
  if (
    await written(client, 'batch create failed, retrying one by one', { domain }, () => client.create(domain, docs))
  ) {
    return docs.length
  }
  let done = 0
  for (const doc of docs) {
    if (await written(client, 'create failed', { domain, _id: doc._id }, () => client.create(domain, doc))) done++
  }
  return done
}

async function updateEach<T extends Doc> (
  client: MigrationClient,
  domain: Domain,
  updates: { filter: MigrationDocumentQuery<T>, update: MigrateUpdate<T> }[]
): Promise<number> {
  if (updates.length === 0) return 0
  if (
    await written(client, 'bulk update failed, retrying one by one', { domain }, () => client.bulk(domain, updates))
  ) {
    return updates.length
  }
  let done = 0
  for (const { filter, update } of updates) {
    if (await written(client, 'update failed', { domain, filter }, () => client.update(domain, filter, update))) done++
  }
  return done
}

// A document is its domain and id: an id repeats across domains, a class may change.
async function findReadStates (client: MigrationClient, refs: DocRef[]): Promise<Map<string, Ref<ReadState>>> {
  const { hierarchy } = client
  const states = await client.find<ReadState>(
    DOMAIN_READ_STATE,
    { attachedTo: { $in: Array.from(new Set(refs.map((it) => it.id))) } },
    { projection: { _id: 1, attachedTo: 1, attachedToClass: 1 } }
  )
  const res = new Map<string, Ref<ReadState>>()
  for (const it of states) {
    const domain = hierarchy.findDomain(it.attachedToClass)
    if (domain != null) res.set(refKey({ domain, id: it.attachedTo }), it._id)
  }
  return res
}

// A model class is read from the model, not from a table.
async function findDocs (client: MigrationClient, domain: Domain, ids: Ref<Doc>[]): Promise<Doc[]> {
  if (domain === DOMAIN_MODEL) return await client.model.findAll(core.class.Doc, { _id: { $in: ids } })
  return await client.find<Doc>(domain, { _id: { $in: ids } })
}

// False when a state did not land: the caller reads the states back, a row the index refused has one already.
async function makeMissingReadStates (
  client: MigrationClient,
  refs: DocRef[],
  states: Map<string, Ref<ReadState>>,
  failed: { count: number }
): Promise<boolean> {
  const byDomain = new Map<Domain, Set<Ref<Doc>>>()
  for (const ref of refs) {
    if (states.has(refKey(ref))) continue
    byDomain.set(ref.domain, (byDomain.get(ref.domain) ?? new Set()).add(ref.id))
  }
  let complete = true
  for (const [domain, ids] of byDomain) {
    const docs = await findDocs(client, domain, Array.from(ids))
    const newStates: ReadState[] = []
    for (const doc of docs) {
      const state = await attempt(client, 'read state skipped', { domain, _id: doc._id }, () =>
        newReadState(client, doc)
      )
      if (state != null) newStates.push(state)
      else failed.count++
    }
    // The map takes only what landed: a chat must not point at a row that was not written.
    const created = await createEach(client, DOMAIN_READ_STATE, newStates)
    if (created === newStates.length) {
      for (const it of newStates) states.set(refKey({ domain, id: it.attachedTo }), it._id)
    } else {
      complete = false
    }
  }
  return complete
}

export async function fillChatReadStates (client: MigrationClient): Promise<void> {
  const { hierarchy } = client
  const iterator = await client.traverse<ChatRefs>(
    DOMAIN_CHUNTER_DOC,
    { readState: { $exists: false } },
    { projection: { _id: 1, attachedTo: 1, attachedToClass: 1 } }
  )
  const counters = { done: 0, orphans: 0, failed: 0 }
  // States not made, apart from updates not landed
  const failed = { count: 0 }
  try {
    while (true) {
      const chats = (await iterator.next(BATCH)) ?? []
      if (chats.length === 0) break

      await attempt(client, 'chat read state refs: batch skipped', { from: chats[0]._id }, async () => {
        const refOf = (chat: ChatRefs): DocRef | undefined => {
          const domain = hierarchy.findDomain(chat.attachedToClass)
          return domain != null ? { domain, id: chat.attachedTo } : undefined
        }
        const refs = chats.map(refOf).filter(notEmpty)
        let states = await findReadStates(client, refs)
        if (!(await makeMissingReadStates(client, refs, states, failed))) {
          states = await findReadStates(client, refs)
        }

        const updates = []
        for (const chat of chats) {
          const ref = refOf(chat)
          const readState = ref != null ? states.get(refKey(ref)) : undefined
          if (readState == null) {
            counters.orphans++
            continue
          }
          updates.push({ filter: { _id: chat._id }, update: { readState } })
        }
        const updated = await updateEach(client, DOMAIN_CHUNTER_DOC, updates)
        counters.done += updated
        counters.failed += updates.length - updated
      })
      client.logger.log('chat read state refs', { ...counters, failed: counters.failed + failed.count })
    }
  } finally {
    await iterator.close()
  }
}

export const chunterOperation: MigrateOperation = {
  async migrate (client: MigrationClient, mode): Promise<void> {
    await tryMigrate(mode, client, chunterId, [
      {
        state: 'create-chat-messages',
        mode: 'upgrade',
        func: convertCommentsToChatMessages
      },
      {
        state: 'remove-backlinks',
        mode: 'upgrade',
        func: removeBacklinks
      },
      {
        state: 'migrate-chat-messages-space',
        mode: 'upgrade',
        func: async (client) => {
          await migrateMessagesSpace(
            client,
            chunter.class.ChatMessage,
            ({ attachedTo }) => attachedTo,
            ({ attachedToClass }) => attachedToClass
          )
        }
      },
      {
        state: 'migrate-thread-messages-space',
        mode: 'upgrade',
        func: async (client) => {
          await migrateMessagesSpace(
            client,
            chunter.class.ThreadMessage,
            (msg) => (msg as ThreadMessage).objectId,
            (msg) => (msg as ThreadMessage).objectClass
          )
        }
      },
      {
        state: 'remove-old-classes-v1',
        mode: 'upgrade',
        func: async (client) => {
          await removeOldClasses(client)
        }
      },
      {
        state: 'remove-wrong-activity-v1',
        mode: 'upgrade',
        func: async (client) => {
          await removeWrongActivity(client)
        }
      },
      {
        state: 'remove-chat-info-v1',
        mode: 'upgrade',
        func: async (client) => {
          await client.deleteMany(DOMAIN_CHUNTER, { _class: 'chunter:class:ChatInfo' as Ref<Class<Doc>> })
          await client.deleteMany(DOMAIN_TX, { objectClass: 'chunter:class:ChatInfo' })
          await client.update(
            DOMAIN_DOC_NOTIFY,
            { 'chunter:mixin:ChannelInfo': { $exists: true } },
            { $unset: { 'chunter:mixin:ChannelInfo': true } }
          )
          await client.deleteMany(DOMAIN_TX, { mixin: 'chunter:mixin:ChannelInfo' })
        }
      },
      {
        state: 'remove-direct-doc-update-messages',
        mode: 'upgrade',
        func: async (client) => {
          await client.deleteMany<DocUpdateMessage>(DOMAIN_ACTIVITY, {
            _class: activity.class.DocUpdateMessage,
            attachedToClass: chunter.class.DirectMessage
          })
        }
      },
      {
        state: 'remove-chat-sync-v2',
        mode: 'upgrade',
        func: removeChatSync
      },
      {
        state: 'migrate-duplicated-directs-v1',
        mode: 'upgrade',
        func: migrateDuplicatedDirects
      },
      {
        state: 'remove-unavailable-chats-v1',
        mode: 'upgrade',
        func: removeUnavailableChats
      },
      {
        state: 'unhide-auto-hidden-directs-v1',
        mode: 'upgrade',
        func: unhideAutoHiddenDirects
      },
      {
        state: 'chat-read-state-refs-v2',
        mode: 'upgrade',
        func: fillChatReadStates
      }
    ])
  },
  async upgrade (state: Map<string, Set<string>>, client: () => Promise<MigrationUpgradeClient>, mode): Promise<void> {
    await tryUpgrade(mode, state, client, chunterId, [
      {
        state: 'create-defaults-v2',
        func: async (client) => {
          const tx = new TxOperations(client, core.account.System)
          await createGeneral(client, tx)
          await createRandom(client, tx)
        }
      },
      {
        state: 'default-channels-read-states-v1',
        func: async (client) => {
          await createDefaultReadStates(new TxOperations(client, core.account.System))
        }
      }
    ])
  }
}
