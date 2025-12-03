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

import core, {
  AccountUuid,
  Class,
  Collaborator,
  Doc,
  getClassCollaborators,
  MeasureContext,
  Ref,
  Space,
  Tx,
  TxCreateDoc,
  TxCUD,
  TxMixin,
  TxProcessor,
  TxUpdateDoc
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'

import {
  getCollaboratorsCached,
  getDocCached,
  getCollaboratorsFromDocFields,
  getDocCollaboratorsByTx,
  getAddCollaboratorsTxes
} from './utils'
import { getDocSpace } from '../utils'

async function pushCollaboratorsToPublicSpace (
  control: TriggerControl,
  doc: Doc,
  collaborators: AccountUuid[],
  cache: Map<Ref<Doc>, Doc>
): Promise<TxUpdateDoc<Space>[]> {
  const space = await getDocSpace(control, doc, cache)
  if (space === undefined) return []

  cache.set(space._id, space)

  if (control.hierarchy.isDerived(space._class, core.class.SystemSpace)) return []
  if (space.private) return []

  return collaborators
    .filter((it) => !space.members.includes(it))
    .map((it) => control.txFactory.createTxUpdateDoc(space._class, space.space, space._id, { $push: { members: it } }))
}

async function setCollaboratorsOnDocCreate (
  ctx: MeasureContext,
  tx: TxCreateDoc<Doc>,
  control: TriggerControl,
  docCache: Map<Ref<Doc>, Doc>
): Promise<Tx[]> {
  const res: Tx[] = []
  const hierarchy = control.hierarchy
  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)

  if (mixin === undefined) return res

  const doc = TxProcessor.createDoc2Doc(tx)
  docCache.set(doc._id, doc)

  const collaborators = await getCollaboratorsFromDocFields(ctx, control, doc, mixin)

  res.push(...getAddCollaboratorsTxes(tx.objectId, tx.objectClass, tx.objectSpace, control, collaborators))
  res.push(...(await pushCollaboratorsToPublicSpace(control, doc, collaborators, docCache)))

  return res
}

async function createSyncCollaboratorsTxes (
  ctx: MeasureContext,
  control: TriggerControl,
  objectId: Ref<Doc>,
  objectClass: Ref<Class<Doc>>,
  objectSpace: Ref<Space>,
  added: AccountUuid[],
  removed: AccountUuid[],
  cache: Map<Ref<Doc>, Collaborator[]>
): Promise<Tx[]> {
  if (added.length === 0 && removed.length === 0) return []

  const res: Tx[] = []

  let currentCollaborators = await getCollaboratorsCached(ctx, control, objectId, cache)

  const toAdd = added.filter((p) => !currentCollaborators.some((c) => c.collaborator === p))

  if (toAdd.length > 0) {
    const txes = getAddCollaboratorsTxes(objectId, objectClass, objectSpace, control, toAdd)
    res.push(...txes)
    txes.forEach((tx) => {
      const collab = TxProcessor.createDoc2Doc(tx)
      currentCollaborators.push(collab)
    })
  }

  if (removed.length > 0) {
    const toRemove: Collaborator[] = []
    const collabs: Collaborator[] = []
    for (const collab of currentCollaborators) {
      if (removed.includes(collab.collaborator)) {
        toRemove.push(collab)
      } else {
        collabs.push(collab)
      }
    }
    for (const removedCollab of toRemove) {
      res.push(control.txFactory.createTxRemoveDoc(core.class.Collaborator, removedCollab.space, removedCollab._id))
    }
    currentCollaborators = collabs
  }

  cache.set(objectId, currentCollaborators)

  return res
}

async function updateCollaboratorOnDocUpdate (
  ctx: MeasureContext,
  tx: TxUpdateDoc<Doc> | TxMixin<Doc, Doc>,
  control: TriggerControl,
  cache: Map<Ref<Doc>, Collaborator[]>,
  docCache: Map<Ref<Doc>, Doc>
): Promise<Tx[]> {
  const hierarchy = control.hierarchy
  const res: Tx[] = []

  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)
  if (mixin === undefined) return res

  const doc = await getDocCached(ctx, control, tx.objectClass, tx.objectId, docCache)
  if (doc === undefined) return []

  // we should handle change field and subscribe new collaborators
  const { added, removed } = await getDocCollaboratorsByTx(ctx, control, tx, doc, cache)
  const sync = await createSyncCollaboratorsTxes(ctx, control, doc._id, doc._class, doc.space, added, removed, cache)
  res.push(...sync)

  return res
}

async function updateCollaboratorsFromDerivedTx (
  ctx: MeasureContext,
  control: TriggerControl,
  tx: TxCUD<Doc>,
  cache: Map<Ref<Doc>, Collaborator[]>
): Promise<Tx[]> {
  if (tx._class !== core.class.TxUpdateDoc && tx._class !== core.class.TxMixin) return []

  const { hierarchy } = control

  const mixin = getClassCollaborators(control.modelDb, hierarchy, tx.objectClass)
  if (mixin === undefined) return []

  const doc = await getDocCached(ctx, control, tx.objectClass, tx.objectId, new Map())
  if (doc === undefined) return []

  const collabsByTx = await getDocCollaboratorsByTx(ctx, control, tx, doc, cache)

  const res: Tx[] = []

  const txes = await createSyncCollaboratorsTxes(
    ctx,
    control,
    doc._id,
    doc._class,
    doc.space,
    collabsByTx.added,
    collabsByTx.removed,
    cache
  )

  res.push(...txes)

  return res
}

async function setupCollaborators (
  ctx: MeasureContext,
  control: TriggerControl,
  tx: TxCUD<Doc>,
  cache: Map<Ref<Doc>, Collaborator[]> = new Map<Ref<Doc>, Collaborator[]>(),
  docCache: Map<Ref<Doc>, Doc> = new Map<Ref<Doc>, Doc>()
): Promise<Tx[]> {
  if (tx.space === core.space.DerivedTx) {
    // do not forgot update collaborators for derived tx
    return await ctx.with('derivedTx -> updateCollaborators', {}, (ctx) =>
      updateCollaboratorsFromDerivedTx(ctx, control, tx, cache)
    )
  }

  switch (tx._class) {
    case core.class.TxCreateDoc: {
      return await ctx.with('set-collaborators-on-doc-create', {}, (ctx) =>
        setCollaboratorsOnDocCreate(ctx, tx as TxCreateDoc<Doc>, control, docCache)
      )
    }
    case core.class.TxUpdateDoc:
    case core.class.TxMixin: {
      return await ctx.with('update-collaborator-on-doc-update', {}, (ctx) =>
        updateCollaboratorOnDocUpdate(ctx, tx as TxUpdateDoc<Doc>, control, cache, docCache)
      )
    }
  }

  return []
}

export async function ManageCollaboratorsTrigger (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const docCache = new Map<Ref<Doc>, Doc>()
  const cache = new Map<Ref<Doc>, Collaborator[]>()

  const res: Tx[] = []

  for (const tx of txes) {
    if (!TxProcessor.isExtendsCUD(tx._class)) continue
    const txes = await control.ctx.with(
      'setup-collaborators',
      { objectId: tx.objectId, objectClass: tx.objectClass },
      (ctx) => setupCollaborators(ctx, control, tx, cache, docCache)
    )
    res.push(...txes)
  }

  return res
}

// async function addCollaborators (ctx: TriggerCtx, event: Enriched<CreateMessageEvent>): Promise<Event[]> {
//   const { messageType, socialId, content, docClass, docId, date } = event
//   if (messageType === MessageType.Activity) return []
//   const account = (await ctx.client.findPersonUuid(ctx, socialId, true)) as AccountUuid | undefined
//   const collaborators = new Set<AccountUuid>()
//
//   if (account !== undefined) {
//     collaborators.add(account)
//   }
//
//   if (event.options?.ignoreMentions !== true) {
//     const markup = markdownToMarkup(content)
//     const references = extractReferences(markup)
//     const personIds = references
//       .filter((it) => ['contact:class:Person', 'contact:mixin:Employee'].includes(it.objectClass))
//       .map((it) => it.objectId)
//       .filter((it) => it != null) as string[]
//     const accounts = await ctx.client.db.getAccountsByPersonIds(personIds)
//
//     if (accounts.length > 0) {
//       const spaceMembers = await ctx.client.db.getDocSpaceMembers(docClass, docId)
//       for (const account of accounts) {
//         if (spaceMembers.includes(account)) {
//           collaborators.add(account)
//         }
//       }
//     }
//   }
//
//   if (collaborators.size === 0) {
//     return []
//   }
//
//   return [
//     {
//       type: NotificationEventType.AddCollaborators,
//       docClass,
//       docId,
//       collaborators: Array.from(collaborators),
//       socialId,
//       date: new Date(date.getTime() - 1)
//     }
//   ]
// }

// async function onAddedCollaborators(ctx: TriggerCtx, event: AddCollaboratorsEvent): Promise<Event[]> {
//   const { docClass, docId, collaborators } = event
//
//   if (collaborators.length === 0) return []
//   const result: Event[] = []
//
//   for (const collaborator of collaborators) {
//     result.push({
//       type: LabelEventType.CreateLabel,
//       docClass,
//       docId,
//       account: collaborator,
//       labelId: SubscriptionLabelID,
//       date: event.date,
//       socialId: event.socialId
//     })
//   }
//
//   const account = (await ctx.client.findPersonUuid(ctx, event.socialId, true)) as AccountUuid | undefined
//
//   const updateDate: ActivityCollaboratorsUpdate = {
//     type: ActivityUpdateType.Collaborators,
//     added: collaborators,
//     removed: []
//   }
//   result.push({
//     type: MessageEventType.CreateMessage,
//     messageType: MessageType.Activity,
//     docId,
//     docClass,
//     content: await getAddCollaboratorsMessageContent(ctx, account, collaborators),
//     socialId: event.socialId,
//     date: event.date,
//     extra: {
//       action: 'update',
//       update: updateDate
//     }
//   })
//   return result
// }
//
// async function onRemovedCollaborators(ctx: TriggerCtx, event: RemoveCollaboratorsEvent): Promise<Event[]> {
//   const { docId, docClass, collaborators } = event
//   if (collaborators.length === 0) return []
//   const result: Event[] = []
//   const contexts = await ctx.client.db.findNotificationContexts({ docClass, docId, account: event.collaborators })
//   for (const collaborator of collaborators) {
//     const context = contexts.find((it) => it.account === collaborator)
//     result.push({
//       type: LabelEventType.RemoveLabel,
//       docClass,
//       docId,
//       account: collaborator,
//       labelId: SubscriptionLabelID,
//       date: event.date,
//       socialId: event.socialId
//     })
//
//     if (context !== undefined && context.lastUpdate.getTime() > context.lastView.getTime()) {
//       result.push({
//         type: NotificationEventType.UpdateNotificationContext,
//         contextId: context.id,
//         account: collaborator,
//         updates: {
//           lastView: context.lastUpdate
//         },
//         date: new Date(),
//         socialId: event.socialId
//       })
//     }
//   }
//
//   const updateDate: ActivityCollaboratorsUpdate = {
//     type: ActivityUpdateType.Collaborators,
//     added: [],
//     removed: collaborators
//   }
//   const account = (await ctx.client.findPersonUuid(ctx, event.socialId, true)) as AccountUuid | undefined
//   result.push({
//     type: MessageEventType.CreateMessage,
//     messageType: MessageType.Activity,
//     docId,
//     docClass,
//     content: await getRemoveCollaboratorsMessageContent(ctx, account, collaborators),
//     socialId: event.socialId,
//     date: event.date,
//     extra: {
//       action: 'update',
//       update: updateDate
//     }
//   })
//
//   return result
// }

// export async function getAddCollaboratorsMessageContent(
//   ctx: TriggerCtx,
//   sender: AccountUuid | undefined,
//   collaborators: AccountUuid[]
// ): Promise<Markdown> {
//   if (sender != null && collaborators.length === 1 && collaborators.includes(sender)) {
//     return 'Joined card'
//   }
//
//   const collaboratorsNames = (await Promise.all(collaborators.map((it) => ctx.client.db.getNameByAccount(it)))).filter(
//     (it): it is string => it != null && it !== ''
//   )
//
//   return `Added ${collaboratorsNames.join(', ')}`
// }
//
// export async function getRemoveCollaboratorsMessageContent(
//   ctx: TriggerCtx,
//   sender: AccountUuid | undefined,
//   collaborators: AccountUuid[]
// ): Promise<Markdown> {
//   if (sender != null && collaborators.length === 1 && collaborators.includes(sender)) {
//     return 'Left card'
//   }
//
//   const collaboratorsNames = (await Promise.all(collaborators.map((it) => ctx.client.db.getNameByAccount(it)))).filter(
//     (it): it is string => it != null && it !== ''
//   )
//
//   return `Removed ${collaboratorsNames.join(', ')}`
// }
