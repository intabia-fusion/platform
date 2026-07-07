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
  type MeasureContext,
  type Ref,
  type RefTo,
  type Space,
  type TxCUD,
  type TxMixin,
  type TxRemoveDoc,
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
import { getResource, type IntlString, translate } from '@hcengineering/platform'
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

type DocUpdateMessageIntl = Pick<DocUpdateMessage, 'messageIntl' | 'intlParams' | 'intlParamsNotLocalized'>

function getAttributeMetadata (
  attributeUpdates: DocAttributeUpdates,
  objectClass: Ref<Class<Doc>>,
  hierarchy: Hierarchy
): Attribute<Doc> | undefined {
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

    return hierarchy.getAttribute(attrObjectClass, attrKey)
  } catch (e) {
    return undefined
  }
}

function formatIdentifier (id?: string): string {
  return id !== undefined && id !== '' ? `${id}: ` : ''
}

async function resolveAttributeValue (
  client: Client,
  doc: Doc,
  attrClass: Ref<Class<Doc>>,
  attrKey: string,
  value: any
): Promise<{ intlString?: IntlString, value: any, identifier?: string } | undefined> {
  if (value === null || value === undefined) return undefined

  const hierarchy = client.hierarchy

  try {
    const attrPresenter = await client.findOne(serverActivity.class.AttributePresenter, { attribute: attrKey })
    if (attrPresenter !== undefined) {
      const presenterFn = await getResource(attrPresenter.presenter)
      return await presenterFn(doc, value, {
        ctx: client.ctx,
        workspace: client.workspace,
        hierarchy: client.hierarchy,
        modelDb: client.model,
        branding: client.branding ?? null,
        findAll: (_ctx, _class, query, ops) => client.findAll(_class, query, ops)
      })
    }
  } catch (e) {
    console.error('Failed to run AttributePresenter for', attrKey, e)
  }

  let targetClass: Ref<Class<Doc>> | undefined
  let targetId: Ref<Doc> | undefined

  if (typeof value === 'string') {
    targetId = value as Ref<Doc>
    if (hierarchy.isDerived(attrClass, core.class.Doc)) {
      targetClass = attrClass
    } else if (hierarchy.isDerived(attrClass, core.class.RefTo)) {
      targetClass = (hierarchy.findClass(attrClass) as any)?.to ?? core.class.Doc
    }
  } else if (
    value !== null &&
    typeof value === 'object' &&
    typeof value._id === 'string' &&
    typeof value._class === 'string'
  ) {
    targetId = value._id
    targetClass = value._class
  }

  if (targetClass !== undefined && targetId !== undefined) {
    try {
      const attrDoc = await client.findOne(targetClass, { _id: targetId })
      if (attrDoc !== undefined) {
        const title = await getDocTitle(client, attrDoc)
        const identifier = await getDocIdentifier(client, attrDoc)
        return { value: title, identifier }
      }
    } catch (e) {
      // ignore and fallback
    }
  }

  return { value }
}

export async function getDocUpdateMessageIntl (
  client: Client,
  tx: TxCUD<Doc>,
  doc: Doc,
  message: DocUpdateMessage
): Promise<DocUpdateMessageIntl> {
  const { hierarchy } = client
  const { attachedTo, attachedToClass, objectClass, objectId, action, updateCollection, attributeUpdates } = message
  const isOwn = attachedTo === objectId

  const object = isOwn
    ? undefined
    : tx._class === core.class.TxRemoveDoc
      ? (tx as TxRemoveDoc<Doc>).removedDoc
      : await client.findOne(objectClass, { _id: objectId })

  const collectionAttribute = getCollectionAttribute(hierarchy, attachedToClass, updateCollection)
  const clazz = hierarchy.getClass(objectClass)
  const itemLabelKey = (collectionAttribute?.type as Collection<AttachedDoc>)?.itemLabel ?? clazz.label
  let objectName = itemLabelKey
  let itemTitle = ''
  if (object !== undefined) {
    const title = await getDocTitle(client, object)
    if (title !== undefined && title.length > 0) {
      itemTitle = title
      const localizedLabel = await translate(objectName, {}, client.branding?.defaultLanguage)
      objectName = `${localizedLabel} ${title}`.trim() as IntlString
    }
  }
  const collectionName = collectionAttribute?.label

  const isCollectionUpdate = !isOwn && collectionName !== undefined

  if (isCollectionUpdate) {
    if (action === 'create') {
      if (collectionAttribute?.activity?.set !== undefined) {
        const identifier = object !== undefined ? await getDocIdentifier(client, object) : undefined
        return {
          messageIntl: collectionAttribute.activity.set,
          intlParams: { value: itemTitle, identifier: formatIdentifier(identifier) },
          intlParamsNotLocalized: { item: itemLabelKey }
        }
      }
      return {
        messageIntl: activity.string.AddedToCollection,
        intlParamsNotLocalized: { object: objectName, collection: collectionName }
      }
    }
    if (action === 'remove') {
      if (collectionAttribute?.activity?.unset !== undefined) {
        const identifier = object !== undefined ? await getDocIdentifier(client, object) : undefined
        return {
          messageIntl: collectionAttribute.activity.unset,
          intlParams: { value: itemTitle, identifier: formatIdentifier(identifier) },
          intlParamsNotLocalized: { item: itemLabelKey }
        }
      }
      return {
        messageIntl: activity.string.RemovedFromCollection,
        intlParamsNotLocalized: { object: objectName, collection: collectionName }
      }
    }
  }

  const name = isOwn || collectionName === undefined ? objectName : collectionName

  if (action === 'create') {
    return {
      messageIntl: activity.string.NewObject,
      intlParamsNotLocalized: { object: name }
    }
  }

  if (action === 'remove') {
    return {
      messageIntl: activity.string.RemovedObject,
      intlParamsNotLocalized: { object: name }
    }
  }

  if (action === 'update' && attributeUpdates !== undefined) {
    const attribute = getAttributeMetadata(attributeUpdates, objectClass, hierarchy)
    const attrLabel = attribute != null ? (attribute.shortLabel ?? attribute.label) : undefined
    if (attrLabel !== undefined) {
      const activitySet = attribute?.activity?.set
      const activityUnset = attribute?.activity?.unset

      if (attributeUpdates.added.length > 0) {
        const resolvedValue = await resolveAttributeValue(
          client,
          doc,
          attributeUpdates.attrClass,
          attributeUpdates.attrKey,
          attributeUpdates.added[0]
        )
        const isObject = resolvedValue !== undefined && typeof resolvedValue.value === 'object'
        return {
          messageIntl: activitySet ?? activity.string.AddedToCollection,
          intlParamsNotLocalized:
            resolvedValue?.intlString != null
              ? { collection: attrLabel, object: resolvedValue?.intlString }
              : { collection: attrLabel },
          intlParams: {
            object: isObject ? '' : resolvedValue?.value,
            value: isObject ? '' : resolvedValue?.value,
            identifier: isObject ? '' : formatIdentifier(resolvedValue?.identifier)
          }
        }
      }
      if (attributeUpdates.removed.length > 0) {
        const resolvedValue = await resolveAttributeValue(
          client,
          doc,
          attributeUpdates.attrClass,
          attributeUpdates.attrKey,
          attributeUpdates.removed[0]
        )
        const isObject = resolvedValue !== undefined && typeof resolvedValue.value === 'object'
        return {
          messageIntl: activityUnset ?? activity.string.RemovedFromCollection,
          intlParamsNotLocalized:
            resolvedValue?.intlString != null
              ? { collection: attrLabel, object: resolvedValue?.intlString }
              : { collection: attrLabel },
          intlParams: {
            object: isObject ? '' : resolvedValue?.value,
            value: isObject ? '' : resolvedValue?.value,
            identifier: isObject ? '' : formatIdentifier(resolvedValue?.identifier)
          }
        }
      }

      if (attributeUpdates.set.length > 0) {
        const values = attributeUpdates.set
        const isUnset =
          values.length > 0 &&
          !values.some((value) => value !== null && value !== '' && value !== 'tracker:ids:NoParent')

        if (isUnset) {
          return {
            messageIntl: activityUnset ?? activity.string.UnsetObject,
            intlParamsNotLocalized: { object: attrLabel }
          }
        } else {
          const resolvedValue = await resolveAttributeValue(
            client,
            doc,
            attributeUpdates.attrClass,
            attributeUpdates.attrKey,
            values[0]
          )

          return {
            messageIntl: activitySet ?? activity.string.AttributeSetTo,
            intlParamsNotLocalized:
              resolvedValue?.intlString != null
                ? { name: attrLabel, value: resolvedValue.intlString }
                : { name: attrLabel },
            intlParams: {
              value: resolvedValue?.value,
              identifier: formatIdentifier(resolvedValue?.identifier)
            }
          }
        }
      }
    }
  }

  return {
    messageIntl: activity.string.UpdatedObject,
    intlParamsNotLocalized: { object: name }
  }
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
  message: DocUpdateMessage,
  hierarchy: Hierarchy
): DocUpdateMessageHistory[] | undefined {
  const operations: DocUpdateMessageHistory[] = []

  const collect = (it: DocUpdateMessage | DocUpdateMessageHistory): void => {
    const update = (it as any).update ?? (it as any).attributeUpdates
    if (update != null && (update.added.length > 0 || update.removed.length > 0)) {
      update.added.forEach((id: Ref<Doc>) => {
        operations.push({
          action: 'create',
          createdOn: it.createdOn ?? (it as any).modifiedOn ?? 0,
          objectId: id,
          objectClass: it.objectClass,
          objectTitle: it.objectTitle,
          objectAttributes: it.objectAttributes,
          update: undefined
        })
      })
      update.removed.forEach((id: Ref<Doc>) => {
        operations.push({
          action: 'remove',
          createdOn: it.createdOn ?? (it as any).modifiedOn ?? 0,
          objectId: id,
          objectClass: it.objectClass,
          objectTitle: it.objectTitle,
          objectAttributes: it.objectAttributes,
          update: undefined
        })
      })
    } else {
      operations.push({
        action: it.action,
        createdOn: it.createdOn ?? (it as any).modifiedOn ?? (it as any).createdOn ?? 0,
        objectId: it.objectId,
        objectClass: it.objectClass,
        objectTitle: it.objectTitle,
        objectAttributes: it.objectAttributes,
        update: (it as any).update ?? (it as any).attributeUpdates
      })
    }
  }

  recent.forEach((r) => {
    if (r.history !== undefined && r.history.length > 0) {
      r.history.forEach(collect)
    } else {
      collect(r)
    }
  })

  collect(message)

  const state = new Map<Ref<Doc>, DocUpdateMessageHistory>()

  const getIdentityId = (op: DocUpdateMessageHistory): Ref<Doc> => {
    if (hierarchy.isDerived(op.objectClass, core.class.Collaborator)) {
      return op.objectAttributes?.collaborator ?? op.objectId
    }

    return op.objectId
  }

  operations.forEach((op) => {
    const id = getIdentityId(op)
    const existing = state.get(id)
    if (existing != null && existing.action !== op.action) {
      state.delete(id)
    } else {
      state.set(id, op)
    }
  })

  const merged = Array.from(state.values())

  if (merged.length === 0) return undefined

  return merged
}
