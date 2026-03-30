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
  type AnyAttribute,
  type ArrOf,
  type AttachedDoc,
  type Attribute,
  type Class,
  type Collection,
  combineAttributes,
  type Doc,
  type Hierarchy,
  type Markup,
  type MeasureContext,
  type Mixin,
  type Ref,
  type RefTo,
  SortingOrder,
  type Space,
  type TxCreateDoc,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxUpdateDoc,
  type Type,
  type WorkspaceInfoWithStatus
} from '@hcengineering/core'
import activity, {
  type ActivityMessage,
  type ActivityMessageControl,
  type DocAttributeUpdates,
  type DocUpdateAction,
  type DocUpdateMessage,
  type DocUpdateMessageHistory
} from '@hcengineering/activity'
import { getResource, translate } from '@hcengineering/platform'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'
import serverActivity, {
  type IdentifierPresenter,
  type TitlePresenter,
  type UrlPresenter
} from '@hcengineering/server-activity'

import { type Client } from './types'
import type Cache from './cache'

const externalRegions = process.env.EXTERNAL_REGIONS?.split(';') ?? []

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

function getAttrClass (hierarchy: Hierarchy, attribute: AnyAttribute): Ref<Class<Doc>> {
  if (hierarchy.isDerived(attribute.type._class, core.class.RefTo)) {
    return (attribute.type as RefTo<Doc>).to
  } else if (hierarchy.isDerived(attribute.type._class, core.class.ArrOf)) {
    const of = (attribute.type as ArrOf<AttachedDoc>).of
    return of._class === core.class.RefTo ? (of as RefTo<Doc>).to : of._class
  }

  return attribute.type._class
}

function getUrlPresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): UrlPresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.UrlPresenter)
}

function getIdentifierPresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): IdentifierPresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.IdentifierPresenter)
}

function getTitlePresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): TitlePresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.TitlePresenter)
}

export async function getDocTitle (client: Client, doc: Doc): Promise<string | undefined> {
  if (client.hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
    const message = doc as ActivityMessage
    if (message.message != null && !isEmptyMarkup(message.message)) {
      const text = markupToText(message.message).trim()
      const normalized = text.length > 50 ? text.slice(0, 50) + '...' : text
      if (text.length > 0) {
        return normalized
      }
    }

    return 'message'
  }

  const TitlePresenter = getTitlePresenter(doc._class, client.hierarchy)

  if (TitlePresenter !== undefined) {
    return await (
      await getResource(TitlePresenter.presenter)
    )(doc, {
      ctx: client.ctx,
      workspace: client.workspace,
      hierarchy: client.hierarchy,
      modelDb: client.model,
      branding: client.branding ?? null,
      findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
    })
  }

  const clazz = client.hierarchy.getClass(doc._class)
  if (clazz.titleKey != null) {
    return (doc as any)[clazz.titleKey] ?? undefined
  }
}

export async function getDocIdentifier (client: Client, doc: Doc): Promise<string | undefined> {
  const IdentifierPresenter = getIdentifierPresenter(doc._class, client.hierarchy)

  if (IdentifierPresenter === undefined) return
  return await (
    await getResource(IdentifierPresenter.presenter)
  )(doc, {
    ctx: client.ctx,
    workspace: client.workspace,
    hierarchy: client.hierarchy,
    modelDb: client.model,
    branding: client.branding ?? null,
    findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
  })
}

export async function getDocUrl (client: Client, doc: Doc): Promise<string | undefined> {
  const UrlPresenter = getUrlPresenter(doc._class, client.hierarchy)
  if (UrlPresenter === undefined) return
  return await (
    await getResource(UrlPresenter.presenter)
  )(doc, {
    ctx: client.ctx,
    workspace: client.workspace,
    hierarchy: client.hierarchy,
    modelDb: client.model,
    branding: client.branding ?? null,
    findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
  })
}

export function isActivityDoc (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): boolean {
  const mixin = hierarchy.classHierarchyMixin(_class, activity.mixin.ActivityDoc)

  return mixin !== undefined
}

export function isSpace (space: Doc, hierarchy: Hierarchy): space is Space {
  return hierarchy.isDerived(space._class, core.class.Space)
}

export function isMarkupType (type: Ref<Class<Type<any>>>): boolean {
  return type === core.class.TypeMarkup
}

export function isCollaborativeType (type: Ref<Class<Type<any>>>): boolean {
  return type === core.class.TypeCollaborativeDoc
}

// Use 100 KB limit for attribute updates
const valueSizeLimit = 100 * 1024 // 100 KB

function valueSizeExceedsLimit (value: any): boolean {
  if (value == null) return false
  if (Array.isArray(value)) {
    return value.some((v) => valueSizeExceedsLimit(v))
  } else if (typeof value === 'string') {
    return value.length > valueSizeLimit
  } else if (typeof value === 'object') {
    return JSON.stringify(value).length > valueSizeLimit
  }
  return false
}

function getAvailableAttributesKeys (tx: TxCUD<Doc>, hierarchy: Hierarchy): string[] {
  if (hierarchy.isDerived(tx._class, core.class.TxUpdateDoc)) {
    const updateTx = tx as TxUpdateDoc<Doc>
    const _class = updateTx.objectClass

    try {
      hierarchy.getClass(_class)
    } catch (err: any) {
      // class is deleted
      return []
    }

    const hiddenAttrs = getHiddenAttrs(hierarchy, _class)

    return Object.entries(updateTx.operations)
      .flatMap(([id, val]) => {
        if (['$push', '$pull', '$unset'].includes(id)) {
          return Object.keys(val)
        }
        return id
      })
      .filter((id) => !id.startsWith('$') && !hiddenAttrs.has(id))
  }

  if (hierarchy.isDerived(tx._class, core.class.TxMixin)) {
    const mixinTx = tx as TxMixin<Doc, Doc>
    const _class = mixinTx.mixin

    try {
      hierarchy.getClass(_class)
    } catch (err: any) {
      // mixin is deleted
      return []
    }

    const hiddenAttrs = getHiddenAttrs(hierarchy, _class)
    return Object.keys(mixinTx.attributes)
      .filter((id) => !id.startsWith('$'))
      .filter((key) => !hiddenAttrs.has(key))
  }

  return []
}

function getModifiedAttributes (tx: TxCUD<Doc>, hierarchy: Hierarchy): Record<string, any> {
  if (hierarchy.isDerived(tx._class, core.class.TxUpdateDoc)) {
    const updateTx = tx as TxUpdateDoc<Doc>

    return updateTx.operations as Record<string, any>
  }
  if (hierarchy.isDerived(tx._class, core.class.TxMixin)) {
    const mixinTx = tx as TxMixin<Doc, Doc>
    return mixinTx.attributes as Record<string, any>
  }
  return {}
}

export function getDocUpdateAction (hierarchy: Hierarchy, tx: TxCUD<Doc>): DocUpdateAction {
  if (hierarchy.isDerived(tx._class, core.class.TxCreateDoc)) {
    return 'create'
  }

  if (hierarchy.isDerived(tx._class, core.class.TxRemoveDoc)) {
    return 'remove'
  }

  return 'update'
}

interface AttributeDiff {
  added: DocAttributeUpdates['added']
  removed: DocAttributeUpdates['removed']
}

export async function getAttributeDiff (
  client: Client,
  doc: Doc,
  prevDoc: Doc | undefined,
  attrKey: string,
  mixin?: Ref<Mixin<Doc>>
): Promise<AttributeDiff> {
  const { hierarchy } = client

  let actualDoc: Doc | undefined = doc
  let actualPrevDoc: Doc | undefined = prevDoc

  if (mixin != null) {
    actualDoc = hierarchy.as(doc, mixin)
    actualPrevDoc = prevDoc === undefined ? undefined : hierarchy.as(prevDoc, mixin)
  }

  const value = (actualDoc as any)[attrKey] ?? []
  const prevValue = (actualPrevDoc as any)?.[attrKey] ?? []

  if (!Array.isArray(value) || !Array.isArray(prevValue)) {
    return {
      added: [],
      removed: []
    }
  }

  const added = value.filter((item) => !prevValue.includes(item)) as DocAttributeUpdates['added']
  const removed = prevValue.filter((item) => !value.includes(item)) as DocAttributeUpdates['removed']

  return {
    added,
    removed
  }
}

export async function getTxAttributesUpdates (
  ctx: MeasureContext,
  client: Client,
  cache: Cache,
  tx: TxCUD<Doc>,
  object: Doc,
  controlRules?: ActivityMessageControl[]
): Promise<DocAttributeUpdates[]> {
  if (![core.class.TxMixin, core.class.TxUpdateDoc].includes(tx._class)) {
    return []
  }

  let updateObject: Doc | undefined = object

  if (updateObject._id !== tx.objectId) {
    updateObject = await cache.getDoc(tx.objectId, tx.objectClass)
  }

  if (updateObject === undefined) {
    return []
  }

  const hierarchy = client.hierarchy

  const allowedFields = new Set<string>(controlRules?.flatMap((it) => it.allowedFields ?? []) ?? [])
  const skipFields = new Set<string>(controlRules?.flatMap((it) => it.skipFields ?? []) ?? [])

  const keys = getAvailableAttributesKeys(tx, hierarchy).filter(
    (it) => !skipFields.has(it) && (allowedFields.size === 0 || allowedFields.has(it))
  )

  if (keys.length === 0) {
    return []
  }

  const result: DocAttributeUpdates[] = []
  const modifiedAttributes = getModifiedAttributes(tx, hierarchy)
  const isMixin = hierarchy.isDerived(tx._class, core.class.TxMixin)
  const mixin = isMixin ? (tx as TxMixin<Doc, Doc>).mixin : undefined

  for (const key of keys) {
    let attrValue = modifiedAttributes[key]
    let prevValue

    const added = combineAttributes([modifiedAttributes], key, '$push', '$each')
    const removed = combineAttributes([modifiedAttributes], key, '$pull', '$in')

    let attrClass: Ref<Class<Doc>> | undefined = mixin

    const attribute = hierarchy.findAttribute(updateObject._class, key)

    attrClass = attribute != null ? getAttrClass(hierarchy, attribute) : undefined

    if (attrClass == null && attribute?.type?._class !== undefined) {
      attrClass = attribute.type._class
    }

    if (attrClass === undefined) {
      continue
    }

    if (attrClass === core.class.TypeCollaborativeDoc) {
      // collaborative documents activity is handled by collaborator
      continue
    }

    // if (hierarchy.isDerived(attrClass, core.class.TypeMarkup)) {
    //   if (docDiff === undefined) {
    //     docDiff = await getDocDiff(client, updateObject._class, updateObject._id, tx._id, mixin, objectCache)
    //   }
    // }

    // if (Array.isArray(attrValue) && docDiff?.doc !== undefined) {
    //   const diff = await getAttributeDiff(client, docDiff.doc, docDiff.prevDoc, key, mixin)
    //   added.push(...diff.added)
    //   removed.push(...diff.removed)
    //   attrValue = []
    // }

    if (valueSizeExceedsLimit(attrValue)) {
      attrValue = activity.string.ValueTooLarge
      prevValue = activity.string.ValueTooLarge
    }

    let setAttr = []

    if (Array.isArray(attrValue)) {
      setAttr = attrValue
    } else if (key in modifiedAttributes) {
      setAttr = [attrValue]
    }

    result.push({
      attrKey: key,
      attrClass,
      set: setAttr,
      added,
      removed,
      prevValue,
      isMixin
    })
  }

  return result
}

function getHiddenAttrs (hierarchy: Hierarchy, _class: Ref<Class<Doc>>): Set<string> {
  return new Set(
    Array.from(hierarchy.getAllAttributes(_class).entries())
      .filter(([, attr]) => attr.hidden === true)
      .map(([k]) => k)
  )
}

export async function getAttrName (
  attributeUpdates: DocAttributeUpdates,
  objectClass: Ref<Class<Doc>>,
  hierarchy: Hierarchy,
  language: string
): Promise<string | undefined> {
  const { attrKey, attrClass, isMixin } = attributeUpdates
  let attrObjectClass = objectClass

  try {
    if (isMixin) {
      const keyedAttribute = Array.from(hierarchy.getAllAttributes(attrClass).entries())
        .filter(([, value]) => value.hidden !== true)
        .map(([key, attr]) => ({ key, attr }))
        .find(({ key }) => key === attrKey)
      if (keyedAttribute === undefined) {
        return undefined
      }
      attrObjectClass = keyedAttribute.attr.attributeOf
    }

    const attribute = hierarchy.getAttribute(attrObjectClass, attrKey)

    const label = attribute.shortLabel ?? attribute.label

    if (label === undefined) {
      return undefined
    }

    return await translate(label, {}, language)
  } catch (e) {
    console.error(e)
    return undefined
  }
}

export function getCollectionAttribute (
  hierarchy: Hierarchy,
  objectClass: Ref<Class<Doc>>,
  collection?: string
): Attribute<Collection<AttachedDoc>> | undefined {
  if (collection === undefined) {
    return undefined
  }

  const descendants = hierarchy.getDescendants(objectClass)

  for (const descendant of descendants) {
    const collectionAttribute = hierarchy.findAttribute(descendant, collection)
    if (collectionAttribute !== undefined) {
      return collectionAttribute
    }
  }

  return undefined
}

export async function getDocUpdateMessageMarkup (message: DocUpdateMessage, client: Client): Promise<Markup> {
  const { hierarchy } = client
  const { attachedTo, attachedToClass, objectClass, objectId, action, updateCollection, attributeUpdates } = message
  const isOwn = attachedTo === objectId

  const collectionAttribute = getCollectionAttribute(hierarchy, attachedToClass, updateCollection)
  const clazz = hierarchy.getClass(objectClass)
  const objectName = (collectionAttribute?.type as Collection<AttachedDoc>)?.itemLabel ?? clazz.label
  const collectionName = collectionAttribute?.label

  const name =
    isOwn || collectionName === undefined
      ? await translate(objectName, {}, client.branding?.defaultLanguage)
      : await translate(collectionName, {}, client.branding?.defaultLanguage)

  if (action === 'create') {
    return await translate(activity.string.NewObject, { object: name }, client.branding?.defaultLanguage)
  }

  if (action === 'remove') {
    return await translate(activity.string.RemovedObject, { object: name }, client.branding?.defaultLanguage)
  }

  if (action === 'update' && attributeUpdates !== undefined) {
    const text = await getAttributesUpdatesText(
      attributeUpdates,
      objectClass,
      hierarchy,
      client.branding?.defaultLanguage ?? 'en'
    )

    if (text !== undefined) {
      return text
    }
  }

  return await translate(activity.string.UpdatedObject, { object: name }, client.branding?.defaultLanguage)
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

export async function buildRemovedDoc (
  client: Client,
  _id: Ref<Doc>,
  _class: Ref<Class<Doc>>
): Promise<Doc | undefined> {
  const txes = await client.findAll<TxCUD<Doc>>(
    core.class.TxCUD,
    {
      objectId: _id
    },
    { sort: { modifiedOn: SortingOrder.Ascending } }
  )

  const createTx = txes.find((tx) => tx._class === core.class.TxCreateDoc)
  if (createTx === undefined) return

  let doc = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<Doc>)

  for (const tx of txes) {
    if (tx._class === core.class.TxUpdateDoc) {
      doc = TxProcessor.updateDoc2Doc(doc, tx as TxUpdateDoc<Doc>)
    } else if (tx._class === core.class.TxMixin) {
      const mixinTx = tx as TxMixin<Doc, Doc>
      doc = TxProcessor.updateMixin4Doc(doc, mixinTx)
    }
  }
  return doc
}

function getAttributeUpdatesKey (message: DocUpdateMessage): string {
  if (message.attributeUpdates === undefined) return ''

  const { attrKey, attrClass, isMixin } = message.attributeUpdates
  return [attrKey, attrClass, isMixin].join('-')
}

export function getDocUpdateMessageKey (message: DocUpdateMessage): string {
  if (message.action === 'update') {
    return [message.createdBy, getAttributeUpdatesKey(message)].join('_')
  }

  return [message.createdBy, message.updateCollection, message.objectId === message.attachedTo].join('_')
}

export function canCombineMessage (message: ActivityMessage): boolean {
  const hasReactions = message.reactions !== undefined && message.reactions > 0
  const isPinned = message.isPinned === true
  const hasReplies = message.replies !== undefined && message.replies > 0

  return !hasReactions && !isPinned && !hasReplies
}

export function mergeDocUpdateAttributes (
  recent: DocUpdateMessage[],
  message: DocUpdateMessage
): DocAttributeUpdates | undefined {
  const firstMessage = recent[0]
  const messages = [...recent, message]

  let mergedAttributeUpdates = firstMessage.attributeUpdates

  messages.forEach((it) => {
    if (it._id !== firstMessage._id && it.attributeUpdates !== undefined) {
      mergedAttributeUpdates = mergeAttributeUpdates(it.attributeUpdates, mergedAttributeUpdates)
    }
  })

  if (mergedAttributeUpdates === undefined) return undefined

  const hasChanges =
    mergedAttributeUpdates.set.length > 0 ||
    mergedAttributeUpdates.added.length > 0 ||
    mergedAttributeUpdates.removed.length > 0

  if (!hasChanges) return undefined

  return mergedAttributeUpdates
}

export function mergeAttributeUpdates (
  attributeUpdates: DocAttributeUpdates,
  prevAttributeUpdates?: DocAttributeUpdates
): DocAttributeUpdates {
  if (prevAttributeUpdates === undefined) return attributeUpdates
  if (attributeUpdates.attrKey !== prevAttributeUpdates.attrKey) return attributeUpdates

  const added = attributeUpdates.added
    .filter((item) => !prevAttributeUpdates.removed.includes(item))
    .concat(prevAttributeUpdates.added.filter((item) => !attributeUpdates.removed.includes(item)))
  const removed = attributeUpdates.removed
    .filter((item) => !prevAttributeUpdates.added.includes(item))
    .concat(prevAttributeUpdates.removed.filter((item) => !attributeUpdates.added.includes(item)))

  const { prevValue } = prevAttributeUpdates
  const { set, attrClass, attrKey, isMixin } = attributeUpdates

  return {
    attrKey,
    attrClass,
    prevValue,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    set: prevValue ? set.filter((value) => value !== prevValue) : set,
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    added: prevValue ? added.filter((value) => value !== prevValue) : added,
    removed,
    isMixin
  }
}

export function mergeCollectionHistory (
  recent: DocUpdateMessage[],
  message: DocUpdateMessage
): DocUpdateMessageHistory[] | undefined {
  const operations: DocUpdateMessageHistory[] = []

  recent.forEach((r) => {
    if (r.history !== undefined && r.history.length > 0) {
      operations.push(...r.history)
    }
    operations.push({
      action: r.action,
      createdOn: r.createdOn ?? r.modifiedOn ?? 0,
      objectId: r.objectId,
      objectClass: r.objectClass,
      objectTitle: r.objectTitle,
      objectAttributes: r.objectAttributes,
      update: r.attributeUpdates
    })
  })

  operations.push({
    action: message.action,
    createdOn: message.createdOn ?? message.modifiedOn ?? 0,
    objectId: message.objectId,
    objectClass: message.objectClass,
    objectTitle: message.objectTitle,
    objectAttributes: message.objectAttributes,
    update: message.attributeUpdates
  })

  const state = new Map<Ref<Doc>, DocUpdateMessageHistory>()

  operations.forEach((op) => {
    const existing = state.get(op.objectId)
    if (existing != null && existing.action !== op.action) {
      state.delete(op.objectId)
    } else {
      state.set(op.objectId, op)
    }
  })

  const merged = Array.from(state.values())

  if (merged.length === 0) return undefined

  return merged
}
