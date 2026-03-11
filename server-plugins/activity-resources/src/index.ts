//
// Copyright © 2023 Hardcore Engineering Inc.
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

import activity, {
  type ActivityMessageControl,
  type DocAttributeUpdates,
  type DocUpdateMessage
} from '@hcengineering/activity'
import core, {
  type PersonId,
  type AttachedDoc,
  type Class,
  type Collection,
  type Data,
  type Doc,
  type Hierarchy,
  matchQuery,
  type MeasureContext,
  type Ref,
  type Tx,
  type TxCreateDoc,
  type TxCUD,
  TxProcessor,
  type Markup
} from '@hcengineering/core'
import notification from '@hcengineering/notification'
import { getMetadata, translate } from '@hcengineering/platform'
import { type DocObjectCache, getDocObjectCache } from '@hcengineering/server-activity'
import type { TriggerControl } from '@hcengineering/server-core'
import card, { type Card } from '@hcengineering/card'
import serverCard from '@hcengineering/server-card'

import { ReferenceTrigger } from './references'
import {
  getAttrName,
  getCollectionAttribute,
  getDocUpdateAction,
  getTxAttributesUpdates,
  isSpace,
  isActivityDoc,
  getDocTitle,
  getDocIdentifier,
  getDocUrl
} from './utils'
import { generateActivity } from './newActivity'

async function getDocUpdateMessageTx (
  control: TriggerControl,
  originTx: TxCUD<Doc>,
  object: Doc,
  rawMessage: Data<DocUpdateMessage>,
  modifiedBy?: PersonId
): Promise<TxCUD<DocUpdateMessage>> {
  const { hierarchy } = control
  const space = isSpace(object, hierarchy) ? object._id : object.space
  const innerTx = control.txFactory.createTxCreateDoc(
    activity.class.DocUpdateMessage,
    space,
    rawMessage,
    undefined,
    originTx.modifiedOn,
    modifiedBy ?? originTx.modifiedBy
  )

  const dum = TxProcessor.createDoc2Doc(innerTx)
  innerTx.attributes.message = await getDocUpdateMessageMarkup(dum, control)

  return control.txFactory.createTxCollectionCUD(
    rawMessage.attachedToClass,
    rawMessage.attachedTo,
    space,
    rawMessage.collection,
    innerTx,
    originTx.modifiedOn,
    modifiedBy ?? originTx.modifiedBy
  )
}

export async function pushDocUpdateMessages (
  ctx: MeasureContext,
  control: TriggerControl,
  res: TxCUD<DocUpdateMessage>[],
  object: Doc | undefined,
  tx: TxCUD<Doc>,
  modifiedBy?: PersonId,
  objectCache?: DocObjectCache,
  controlRules?: ActivityMessageControl[]
): Promise<TxCUD<DocUpdateMessage>[]> {
  if (object === undefined) {
    return res
  }

  if (!isActivityDoc(object._class, control.hierarchy)) {
    return res
  }

  const raw: Data<DocUpdateMessage> = {
    txId: tx._id,
    attachedTo: object._id,
    attachedToClass: object._class,
    objectId: tx.objectId,
    objectClass: tx.objectClass,
    action: getDocUpdateAction(control, tx),
    collection: 'docUpdateMessages',
    updateCollection: tx.collection,
    attachedToTitle: await getDocTitle(control, object),
    attachedToIdentifier: await getDocIdentifier(control, object),
    attachedToUrl: await getDocUrl(control, object)
  }

  if (tx.collection != null && tx._class === core.class.TxCreateDoc) {
    const collectionDoc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
    raw.objectTitle = await getDocTitle(control, collectionDoc)
    raw.objectAttributes = raw.objectTitle != null ? undefined : (tx as TxCreateDoc<Doc>).attributes
  } else if (tx.collection != null && tx._class === core.class.TxRemoveDoc) {
    const collectionDoc = control.removedMap.get(tx.objectId)

    if (collectionDoc != null) {
      raw.objectTitle = await getDocTitle(control, collectionDoc)
      raw.objectAttributes = raw.objectTitle != null ? undefined : collectionDoc
    }
  }

  const attributesUpdates = await getTxAttributesUpdates(ctx, control, tx, object, objectCache, controlRules)

  for (const attributeUpdates of attributesUpdates) {
    res.push(
      await getDocUpdateMessageTx(
        control,
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
    res.push(await getDocUpdateMessageTx(control, tx, object, raw, modifiedBy))
  }

  return res
}

export async function generateDocUpdateMessages (
  ctx: MeasureContext,
  tx: TxCUD<Doc>,
  control: TriggerControl,
  res: TxCUD<DocUpdateMessage>[] = [],
  cache?: DocObjectCache,
  skipAttached: boolean = false
): Promise<TxCUD<DocUpdateMessage>[]> {
  if (tx.space === core.space.DerivedTx) {
    return res
  }

  const { hierarchy } = control
  if (
    hierarchy.isDerived(tx.objectClass, activity.class.ActivityMessage) ||
    (tx.attachedToClass !== undefined && hierarchy.isDerived(tx.attachedToClass, activity.class.ActivityMessage))
  ) {
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
  const controlRules = control.modelDb.findAllSync<ActivityMessageControl>(activity.class.ActivityMessageControl, {
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

  if (tx.attachedTo !== undefined && tx.attachedToClass !== undefined && !skipAttached) {
    res = await generateDocUpdateMessages(ctx, tx, control, res, cache, true)
    if ([core.class.TxCreateDoc, core.class.TxRemoveDoc].includes(tx._class)) {
      if (!isActivityDoc(tx.attachedToClass, control.hierarchy)) {
        return res
      }

      let doc = cache?.docs?.get(tx.attachedTo)
      if (doc === undefined) {
        doc = (await control.findAll(ctx, tx.attachedToClass, { _id: tx.attachedTo }, { limit: 1 }))[0]
      }
      if (doc === undefined) {
        const createTx = (
          await control.findAll(ctx, core.class.TxCreateDoc, { objectId: tx.attachedTo }, { limit: 1 })
        )[0]

        doc = createTx !== undefined ? TxProcessor.createDoc2Doc(createTx as TxCreateDoc<Doc>) : undefined
      }

      if (doc !== undefined) {
        cache?.docs?.set(tx.attachedTo, doc)
        return await ctx.with(
          'pushDocUpdateMessages',
          {},
          async (ctx) =>
            await pushDocUpdateMessages(ctx, control, res, doc ?? undefined, tx, undefined, cache, controlRules)
        )
      }
    }
    return res
  }

  switch (tx._class) {
    case core.class.TxCreateDoc: {
      const doc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
      return await ctx.with('pushDocUpdateMessages', {}, (ctx) =>
        pushDocUpdateMessages(ctx, control, res, doc, tx, undefined, cache, controlRules)
      )
    }
    case core.class.TxMixin:
    case core.class.TxUpdateDoc: {
      if (isActivityDoc(tx.objectClass, control.hierarchy)) {
        let doc = cache?.docs?.get(tx.objectId)
        if (doc === undefined) {
          doc = (await control.findAll(ctx, tx.objectClass, { _id: tx.objectId }, { limit: 1 }))[0]
          cache?.docs?.set(tx.objectId, doc)
        }
        return await ctx.with(
          'pushDocUpdateMessages',
          {},
          async (ctx) =>
            await pushDocUpdateMessages(ctx, control, res, doc ?? undefined, tx, undefined, cache, controlRules)
        )
      }
    }
  }

  return res
}

async function ActivityMessagesHandler (_txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const isCommunicationEnabled = getMetadata(serverCard.metadata.CommunicationEnabled) ?? false

  const ltxes = _txes.filter(
    (it) =>
      !(
        control.hierarchy.isDerived(it.objectClass, activity.class.ActivityMessage) ||
        control.hierarchy.isDerived(it.objectClass, notification.class.DocNotifyContext) ||
        control.hierarchy.isDerived(it.objectClass, notification.class.ActivityInboxNotification) ||
        control.hierarchy.isDerived(it.objectClass, notification.class.BrowserNotification)
      )
  )

  const cache = getDocObjectCache(control)

  const result: Tx[] = []
  for (const tx of ltxes) {
    if (control.hierarchy.isDerived(tx.objectClass, card.class.Card) && isCommunicationEnabled) continue
    if (
      tx.attachedToClass != null &&
      control.hierarchy.isDerived(tx.attachedToClass, card.class.Card) &&
      isCommunicationEnabled
    ) {
      continue
    }
    const txes =
      tx.space === core.space.DerivedTx
        ? []
        : await control.ctx.with('generateDocUpdateMessages', {}, (ctx) =>
          generateDocUpdateMessages(ctx, tx, control, [], cache)
        )

    result.push(...txes)
  }

  return result
}

async function OnDocRemoved (txes: TxCUD<Doc>[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const tx of txes) {
    if (tx._class !== core.class.TxRemoveDoc) continue

    const activityDocMixin = control.hierarchy.classHierarchyMixin(tx.objectClass, activity.mixin.ActivityDoc)
    if (activityDocMixin === undefined) continue

    const messages = await control.findAll(
      control.ctx,
      activity.class.ActivityMessage,
      { attachedTo: tx.objectId },
      { projection: { _id: 1, _class: 1, space: 1 } }
    )

    result.push(
      ...messages.map((message) => control.txFactory.createTxRemoveDoc(message._class, message.space, message._id))
    )
  }
  return result
}

async function getAttributesUpdatesText (
  attributeUpdates: DocAttributeUpdates,
  objectClass: Ref<Class<Doc>>,
  hierarchy: Hierarchy,
  language: string
): Promise<string | undefined> {
  const attrName = await getAttrName(attributeUpdates, objectClass, hierarchy, language)

  if (attrName === undefined) {
    return undefined
  }

  if (attributeUpdates.added.length > 0) {
    return await translate(activity.string.NewObject, { object: attrName }, language)
  }
  if (attributeUpdates.removed.length > 0) {
    return await translate(activity.string.RemovedObject, { object: attrName }, language)
  }

  if (attributeUpdates.set.length > 0) {
    const values = attributeUpdates.set
    const isUnset = values.length > 0 && !values.some((value) => value !== null && value !== '')

    if (isUnset) {
      return await translate(activity.string.UnsetObject, { object: attrName }, language)
    } else {
      return await translate(activity.string.ChangedObject, { object: attrName }, language)
    }
  }

  return undefined
}

export async function getDocUpdateMessageMarkup (message: DocUpdateMessage, control: TriggerControl): Promise<Markup> {
  const { hierarchy } = control
  const { attachedTo, attachedToClass, objectClass, objectId, action, updateCollection, attributeUpdates } = message
  const isOwn = attachedTo === objectId

  const collectionAttribute = getCollectionAttribute(hierarchy, attachedToClass, updateCollection)
  const clazz = hierarchy.getClass(objectClass)
  const objectName = (collectionAttribute?.type as Collection<AttachedDoc>)?.itemLabel ?? clazz.label
  const collectionName = collectionAttribute?.label

  const name =
    isOwn || collectionName === undefined
      ? await translate(objectName, {}, control.branding?.defaultLanguage)
      : await translate(collectionName, {}, control.branding?.defaultLanguage)

  if (action === 'create') {
    return await translate(activity.string.NewObject, { object: name }, control.branding?.defaultLanguage)
  }

  if (action === 'remove') {
    return await translate(activity.string.RemovedObject, { object: name }, control.branding?.defaultLanguage)
  }

  if (action === 'update' && attributeUpdates !== undefined) {
    const text = await getAttributesUpdatesText(
      attributeUpdates,
      objectClass,
      hierarchy,
      control.branding?.defaultLanguage ?? 'en'
    )

    if (text !== undefined) {
      return text
    }
  }

  return await translate(activity.string.UpdatedObject, { object: name }, control.branding?.defaultLanguage)
}

async function HandleCardActivity (txes: TxCUD<Card>[], control: TriggerControl): Promise<Tx[]> {
  const cache = new Map<Ref<Card>, Card>()
  for (const tx of txes) {
    await generateActivity(tx, control, cache)
  }

  return []
}

export * from './references'
export { getDocTitle, getDocUrl, getDocIdentifier } from './utils'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    ReferenceTrigger,
    ActivityMessagesHandler,
    OnDocRemoved,
    HandleCardActivity
  }
})
