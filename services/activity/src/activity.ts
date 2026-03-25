import core, {
  type Data,
  type Doc,
  matchQuery,
  type MeasureContext,
  type PersonId,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor
} from '@hcengineering/core'
import activity, { type ActivityMessageControl, type DocUpdateMessage } from '@hcengineering/activity'

import type Cache from './cache'
import { type Client } from './types'
import {
  buildRemovedDoc,
  getDocIdentifier,
  getDocTitle,
  getDocUpdateAction,
  getDocUpdateMessageMarkup,
  getDocUrl,
  getTxAttributesUpdates,
  isActivityDoc,
  isSpace
} from './utils'

export async function ActivityMessagesHandler (tx: TxCUD<Doc>, client: Client, cache: Cache): Promise<TxCUD<Doc>[]> {
  if (tx.space === core.space.DerivedTx) return []
  const { ctx } = client

  const result: TxCUD<Doc>[] = []

  const txes = await ctx.with('generateDocUpdateMessages', {}, (ctx) =>
    generateDocUpdateMessages(ctx, tx, client, [], cache)
  )

  result.push(...txes)

  return result
}

async function generateDocUpdateMessages (
  ctx: MeasureContext,
  tx: TxCUD<Doc>,
  client: Client,
  res: TxCUD<DocUpdateMessage>[] = [],
  cache: Cache,
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
    res = await generateDocUpdateMessages(ctx, tx, client, res, cache, true)
    if ([core.class.TxCreateDoc, core.class.TxRemoveDoc].includes(tx._class)) {
      if (!isActivityDoc(tx.attachedToClass, client.hierarchy)) {
        return res
      }

      let doc = await cache.getDoc(tx.attachedTo, tx.attachedToClass)

      if (doc === undefined) {
        const createTx = (await client.findAll(core.class.TxCreateDoc, { objectId: tx.attachedTo }, { limit: 1 }))[0]

        doc = createTx !== undefined ? TxProcessor.createDoc2Doc(createTx as TxCreateDoc<Doc>) : undefined
      }

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
        return await ctx.with(
          'pushDocUpdateMessages',
          {},
          async (ctx) =>
            await pushDocUpdateMessages(ctx, client, cache, res, doc ?? undefined, tx, undefined, controlRules)
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
  object: Doc | undefined,
  tx: TxCUD<Doc>,
  modifiedBy?: PersonId,
  controlRules?: ActivityMessageControl[]
): Promise<TxCUD<DocUpdateMessage>[]> {
  if (object === undefined) return res
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
    attachedToUrl: await getDocUrl(client, object)
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

  for (const attributeUpdates of attributesUpdates) {
    res.push(
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
    res.push(await getDocUpdateMessageTx(client, tx, object, raw, modifiedBy))
  }

  return res
}

async function getDocUpdateMessageTx (
  client: Client,
  originTx: TxCUD<Doc>,
  object: Doc,
  rawMessage: Data<DocUpdateMessage>,
  modifiedBy?: PersonId
): Promise<TxCUD<DocUpdateMessage>> {
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
  )
}
