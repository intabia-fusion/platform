import core, {
  type Data,
  type Doc,
  groupByArray,
  matchQuery,
  type MeasureContext,
  type PersonId,
  type TxCreateDoc,
  type TxCUD,
  type TxFactory,
  TxProcessor,
  type TxRemoveDoc,
  type TxUpdateDoc
} from '@hcengineering/core'
import activity, {
  type ActivityMessageControl,
  type DocUpdateMessage,
  type DocUpdateMessageHistory
} from '@hcengineering/activity'

import type Cache from './cache'
import { type Client } from './types'
import {
  buildRemovedDoc,
  canCombineMessage,
  getDocIdentifier,
  getDocTitle,
  getDocUpdateAction,
  getDocUpdateMessageKey,
  getDocUpdateMessageMarkup,
  getDocUrl,
  getTxAttributesUpdates,
  isActivityDoc,
  isSpace,
  mergeCollectionHistory,
  mergeDocUpdateAttributes
} from './utils'

const CREATE_COMBINE_THRESHOLD = 10 * 1000 // Use 10 seconds to combine update messages after creation.
const UPDATE_COMBINE_THRESHOLD = 5 * 60 * 1000 //  Use 5 minutes to combine similar messages

export async function ActivityMessagesHandler (tx: TxCUD<Doc>, client: Client, cache: Cache): Promise<TxCUD<Doc>[]> {
  if (tx.space === core.space.DerivedTx) return []

  return await client.ctx.with('generateDocUpdateMessages', {}, (ctx) =>
    generateDocUpdateMessages(ctx, client, cache, tx, [])
  )
}

async function generateDocUpdateMessages (
  ctx: MeasureContext,
  client: Client,
  cache: Cache,
  tx: TxCUD<Doc>,
  res: TxCUD<DocUpdateMessage>[] = [],
  skipAttachedTo = false
): Promise<TxCUD<DocUpdateMessage>[]> {
  if (tx.space === core.space.DerivedTx) return res

  const { hierarchy } = client

  if (hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage)) return res
  if (tx.attachedToClass !== undefined && hierarchy.isDerived(tx.attachedToClass, activity.class.ActivityMessage)) {
    return res
  }

  if (
    hierarchy.classHierarchyMixin(tx.objectClass, activity.mixin.IgnoreActivity) !== undefined ||
    (tx.attachedToClass !== undefined &&
      hierarchy.classHierarchyMixin(tx.attachedToClass, activity.mixin.IgnoreActivity) !== undefined)
  ) {
    return res
  }

  // Check if we have override control over transaction => activity mappings
  const controlRules = client.model.findAllSync<ActivityMessageControl>(activity.class.ActivityMessageControl, {
    objectClass: { $in: hierarchy.getAncestors(tx.objectClass) }
  })
  if (controlRules.length > 0) {
    for (const r of controlRules) {
      for (const s of r.skip) {
        if (matchQuery([tx], s, core.class.TxCUD, hierarchy).length > 0) {
          // Match found, we need to skip
          return res
        }
      }
    }
  }

  if (tx.attachedTo !== undefined && tx.attachedToClass !== undefined && !skipAttachedTo) {
    res = await generateDocUpdateMessages(ctx, client, cache, tx, res, true)
    if ([core.class.TxCreateDoc, core.class.TxRemoveDoc].includes(tx._class)) {
      if (!isActivityDoc(tx.attachedToClass, client.hierarchy)) {
        return res
      }

      const doc = await cache.getDoc(tx.attachedTo, tx.attachedToClass)

      if (doc !== undefined) {
        return await ctx.with(
          'pushDocUpdateMessages',
          {},
          async (ctx) =>
            await pushDocUpdateMessages(ctx, client, cache, res, doc ?? undefined, tx, undefined, controlRules)
        )
      }
    }
    return res
  }

  switch (tx._class) {
    case core.class.TxCreateDoc: {
      const doc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
      return await ctx.with('pushDocUpdateMessages', {}, (ctx) =>
        pushDocUpdateMessages(ctx, client, cache, res, doc, tx, undefined, controlRules)
      )
    }
    case core.class.TxMixin:
    case core.class.TxUpdateDoc: {
      if (isActivityDoc(tx.objectClass, client.hierarchy)) {
        const doc = await cache.getDoc(tx.objectId, tx.objectClass)
        if (doc == null) return res
        return await ctx.with(
          'pushDocUpdateMessages',
          {},
          async (ctx) => await pushDocUpdateMessages(ctx, client, cache, res, doc, tx, undefined, controlRules)
        )
      }
    }
  }

  return res
}

async function pushDocUpdateMessages (
  ctx: MeasureContext,
  client: Client,
  cache: Cache,
  res: TxCUD<DocUpdateMessage>[],
  object: Doc,
  tx: TxCUD<Doc>,
  modifiedBy?: PersonId,
  controlRules?: ActivityMessageControl[]
): Promise<TxCUD<DocUpdateMessage>[]> {
  if (!isActivityDoc(object._class, client.hierarchy)) return res

  const raw: Data<DocUpdateMessage> = {
    txId: tx._id,
    attachedTo: object._id,
    attachedToClass: object._class,
    objectId: tx.objectId,
    objectClass: tx.objectClass,
    action: getDocUpdateAction(client.hierarchy, tx),
    collection: 'docUpdateMessages',
    updateCollection: tx.collection,
    attachedToTitle: await getDocTitle(client, object),
    attachedToIdentifier: await getDocIdentifier(client, object),
    attachedToUrl: await getDocUrl(client, object),
    history: []
  }

  if (tx.collection != null && tx._class === core.class.TxCreateDoc) {
    const collectionDoc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
    raw.objectTitle = await getDocTitle(client, collectionDoc)
    raw.objectAttributes = raw.objectTitle != null ? undefined : (tx as TxCreateDoc<Doc>).attributes
  } else if (tx.collection != null && tx._class === core.class.TxRemoveDoc) {
    const collectionDoc = await buildRemovedDoc(client, tx.objectId, tx.objectClass)

    if (collectionDoc != null) {
      raw.objectTitle = await getDocTitle(client, collectionDoc)
      raw.objectAttributes = raw.objectTitle != null ? undefined : collectionDoc
    }
  }

  const attributesUpdates = await getTxAttributesUpdates(ctx, client, cache, tx, object, controlRules)
  const createTxes: TxCreateDoc<DocUpdateMessage>[] = []
  for (const attributeUpdates of attributesUpdates) {
    createTxes.push(
      await getDocUpdateMessageTx(
        client,
        tx,
        object,
        {
          ...raw,
          attributeUpdates
        },
        modifiedBy
      )
    )
  }

  if (attributesUpdates.length === 0 && raw.action !== 'update') {
    const ttx = await getDocUpdateMessageTx(client, tx, object, raw, modifiedBy)
    createTxes.push(ttx)
  }

  const combined = combineMessages(createTxes, cache.getRecentMessages(object._id), client.txFactory)

  for (const ttx of combined.create) {
    res.push(ttx)
    cache.addRecentMessage(TxProcessor.createDoc2Doc(ttx))
  }

  for (const ttx of combined.remove) {
    res.push(ttx)
    cache.tx(ttx)
  }

  for (const ttx of combined.update) {
    res.push(ttx)
    cache.tx(ttx)
  }

  return res
}

function combineMessages (
  txes: TxCreateDoc<DocUpdateMessage>[],
  recent: DocUpdateMessage[],
  factory: TxFactory
): {
    create: TxCreateDoc<DocUpdateMessage>[]
    remove: TxRemoveDoc<DocUpdateMessage>[]
    update: TxUpdateDoc<DocUpdateMessage>[]
  } {
  const created = txes.map((it) => {
    const message = TxProcessor.createDoc2Doc(it)
    return {
      tx: it,
      message,
      key: getDocUpdateMessageKey(message)
    }
  })

  const createTx: TxCreateDoc<DocUpdateMessage>[] = []
  const removeTx: TxRemoveDoc<DocUpdateMessage>[] = []
  const updateTx: TxUpdateDoc<DocUpdateMessage>[] = []

  const recentGroupedByType = groupByArray(recent, getDocUpdateMessageKey)

  for (const { key, message, tx } of created) {
    const createMessage = recent.find(
      (it) => it.createdBy === message.createdBy && it.action === 'create' && it.attachedTo === it.objectId
    )

    const createDiff =
      (message.createdOn ?? message.modifiedOn) - (createMessage?.createdOn ?? createMessage?.modifiedOn ?? 0)

    if (createMessage != null && createDiff <= CREATE_COMBINE_THRESHOLD) {
      const innerUpdateTx = factory.createTxUpdateDoc(createMessage._class, createMessage.space, createMessage._id, {
        $push: {
          history: {
            action: message.action,
            createdOn: message.createdOn ?? message.modifiedOn ?? 0,
            update: message.attributeUpdates,
            objectId: message.objectId,
            objectClass: message.objectClass,
            objectTitle: message.objectTitle,
            objectAttributes: message.objectAttributes
          }
        }
      })
      updateTx.push(
        factory.createTxCollectionCUD(
          tx.attachedToClass ?? message.objectClass,
          tx.attachedTo ?? message.objectId,
          createMessage.space,
          'docUpdateMessages',
          innerUpdateTx
        ) as TxUpdateDoc<DocUpdateMessage>
      )
      continue
    }

    const combinedWith = (recentGroupedByType.get(key) ?? []).filter(canCombineMessage).filter((it) => {
      const timeDiff = (message.createdOn ?? message.modifiedOn) - (it.createdOn ?? it.modifiedOn)

      return timeDiff >= 0 && timeDiff < UPDATE_COMBINE_THRESHOLD
    })

    if (combinedWith.length === 0) {
      createTx.push(tx)
      continue
    }

    const pushRemoves = (items: DocUpdateMessage[]): void => {
      const removes = items.map((it) => {
        const innerTx = factory.createTxRemoveDoc(it._class, it.space, it._id)
        return factory.createTxCollectionCUD(
          it.attachedToClass,
          it.attachedTo,
          it.space,
          'docUpdateMessages',
          innerTx
        ) as TxRemoveDoc<DocUpdateMessage>
      })
      removeTx.push(...removes)
    }

    const pushUpdate = (targetMsg: DocUpdateMessage): void => {
      const innerUpdateTx = factory.createTxUpdateDoc(
        targetMsg._class,
        targetMsg.space,
        targetMsg._id,
        tx.attributes,
        undefined,
        tx.modifiedOn,
        tx.modifiedBy
      )

      updateTx.push(
        factory.createTxCollectionCUD(
          targetMsg.attachedToClass,
          targetMsg.attachedTo,
          targetMsg.space,
          tx.collection ?? 'docUpdateMessages',
          innerUpdateTx
        ) as TxUpdateDoc<DocUpdateMessage>
      )
    }

    const mapToHistory = (it: DocUpdateMessage): DocUpdateMessageHistory => ({
      action: it.action,
      createdOn: it.createdOn ?? it.modifiedOn ?? 0,
      update: it.attributeUpdates,
      objectId: it.objectId,
      objectClass: it.objectClass,
      objectTitle: it.objectTitle,
      objectAttributes: it.objectAttributes
    })

    if (message.action === 'update') {
      const attributeUpdates = mergeDocUpdateAttributes(combinedWith, message)
      if (attributeUpdates == null) {
        pushRemoves(combinedWith)
        continue
      }

      tx.attributes.attributeUpdates = attributeUpdates
      tx.attributes.history = combinedWith.map(mapToHistory)
    } else {
      const merged = mergeCollectionHistory(combinedWith, message)

      if (merged === undefined || merged.length === 0) {
        pushRemoves(combinedWith)
        continue
      }

      const last = merged.pop()

      if (last != null) {
        tx.attributes.action = last.action
        tx.attributes.objectId = last.objectId
        tx.attributes.objectClass = last.objectClass
        tx.attributes.objectTitle = last.objectTitle
        tx.attributes.objectAttributes = last.objectAttributes
        tx.attributes.attributeUpdates = last.update
      }
      tx.attributes.history = merged
    }

    pushRemoves(combinedWith.slice(1))
    pushUpdate(combinedWith[0])
  }

  return {
    create: createTx,
    remove: removeTx,
    update: updateTx
  }
}

async function getDocUpdateMessageTx (
  client: Client,
  originTx: TxCUD<Doc>,
  object: Doc,
  rawMessage: Data<DocUpdateMessage>,
  modifiedBy?: PersonId
): Promise<TxCreateDoc<DocUpdateMessage>> {
  const { hierarchy } = client
  const space = isSpace(object, hierarchy) ? object._id : object.space
  const innerTx = client.txFactory.createTxCreateDoc(
    activity.class.DocUpdateMessage,
    space,
    rawMessage,
    undefined,
    originTx.modifiedOn,
    modifiedBy ?? originTx.modifiedBy
  )

  const dum = TxProcessor.createDoc2Doc(innerTx)
  innerTx.attributes.message = await getDocUpdateMessageMarkup(dum, client)

  return client.txFactory.createTxCollectionCUD(
    rawMessage.attachedToClass,
    rawMessage.attachedTo,
    space,
    rawMessage.collection,
    innerTx,
    originTx.modifiedOn,
    modifiedBy ?? originTx.modifiedBy
  ) as TxCreateDoc<DocUpdateMessage>
}
