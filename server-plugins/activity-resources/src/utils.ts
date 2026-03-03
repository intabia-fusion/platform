import activity, {
  type ActivityMessage,
  type ActivityMessageControl,
  type DocAttributeUpdates,
  type DocUpdateAction
} from '@hcengineering/activity'
import cardPlugin, { type Card, type Tag } from '@hcengineering/card'
import { type ActivityUpdate, ActivityUpdateType } from '@hcengineering/communication-types'
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
  type Mixin,
  type Ref,
  type RefTo,
  type Space,
  type TxCreateDoc,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxUpdateDoc,
  type Type
} from '@hcengineering/core'
import { getResource, translate } from '@hcengineering/platform'
import {
  type DocObjectCache,
  getAllObjectTransactions,
  type IdentifierPresenter,
  type PresenterControl,
  type TitlePresenter,
  type UrlPresenter
} from '@hcengineering/server-activity'
import { type TriggerControl } from '@hcengineering/server-core'
import serverActivity from '@hcengineering/server-activity'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'

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

export function getDocUpdateAction (control: TriggerControl, tx: TxCUD<Doc>): DocUpdateAction {
  const hierarchy = control.hierarchy

  if (hierarchy.isDerived(tx._class, core.class.TxCreateDoc)) {
    return 'create'
  }

  if (hierarchy.isDerived(tx._class, core.class.TxRemoveDoc)) {
    return 'remove'
  }

  return 'update'
}

export async function getDocDiff (
  control: TriggerControl,
  _class: Ref<Class<Doc>>,
  objectId: Ref<Doc>,
  lastTxId: Ref<TxCUD<Doc>>,
  mixin?: Ref<Mixin<Doc>>,
  cache?: DocObjectCache
): Promise<{ doc?: Doc, prevDoc?: Doc }> {
  const hierarchy = control.hierarchy

  const objectTxes =
    cache?.transactions.get(objectId) ??
    (await getAllObjectTransactions(control, _class, [objectId], mixin)).get(objectId) ??
    []

  const createTx = objectTxes.find((tx) => tx._class === core.class.TxCreateDoc)

  if (createTx === undefined) {
    return {}
  }

  let doc: Doc | undefined
  let prevDoc: Doc | undefined

  doc = TxProcessor.createDoc2Doc(createTx as TxCreateDoc<Doc>)

  for (const actualTx of objectTxes) {
    if (actualTx._class === core.class.TxUpdateDoc) {
      prevDoc = hierarchy.clone(doc)
      doc = TxProcessor.updateDoc2Doc(doc, actualTx as TxUpdateDoc<Doc>)
    }

    if (actualTx._class === core.class.TxMixin) {
      prevDoc = hierarchy.clone(doc)
      doc = TxProcessor.updateMixin4Doc(doc, actualTx as TxMixin<Doc, Doc>)
    }

    if (actualTx._id === lastTxId) {
      break
    }
  }

  return { doc, prevDoc }
}

interface AttributeDiff {
  added: DocAttributeUpdates['added']
  removed: DocAttributeUpdates['removed']
}

export async function getAttributeDiff (
  control: TriggerControl,
  doc: Doc,
  prevDoc: Doc | undefined,
  attrKey: string,
  mixin?: Ref<Mixin<Doc>>
): Promise<AttributeDiff> {
  const { hierarchy } = control

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
  control: TriggerControl,
  tx: TxCUD<Doc>,
  object: Doc,
  objectCache?: DocObjectCache,
  controlRules?: ActivityMessageControl[]
): Promise<DocAttributeUpdates[]> {
  if (![core.class.TxMixin, core.class.TxUpdateDoc].includes(tx._class)) {
    return []
  }

  let updateObject = object

  if (updateObject._id !== tx.objectId) {
    updateObject =
      objectCache?.docs?.get(tx.objectId) ?? (await control.findAll(ctx, tx.objectClass, { _id: tx.objectId }))[0]
  }

  if (updateObject === undefined) {
    return []
  }

  const hierarchy = control.hierarchy

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

  let docDiff: { doc?: Doc, prevDoc?: Doc } | undefined

  for (const key of keys) {
    let attrValue = modifiedAttributes[key]
    let prevValue

    const added = combineAttributes([modifiedAttributes], key, '$push', '$each')
    const removed = combineAttributes([modifiedAttributes], key, '$pull', '$in')

    let attrClass: Ref<Class<Doc>> | undefined = mixin

    const attribute = hierarchy.findAttribute(updateObject._class, key)

    attrClass = attribute != null ? getAttrClass(hierarchy, attribute) : attribute

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

    if (hierarchy.isDerived(attrClass, core.class.TypeMarkup)) {
      if (docDiff === undefined) {
        docDiff = await getDocDiff(control, updateObject._class, updateObject._id, tx._id, mixin, objectCache)
      }
    }

    if (Array.isArray(attrValue) && docDiff?.doc !== undefined) {
      const diff = await getAttributeDiff(control, docDiff.doc, docDiff.prevDoc, key, mixin)
      added.push(...diff.added)
      removed.push(...diff.removed)
      attrValue = []
    }

    if (docDiff?.prevDoc !== undefined) {
      const { prevDoc } = docDiff
      const rawPrevValue = isMixin ? (hierarchy.as(prevDoc, attrClass) as any)[key] : (prevDoc as any)[key]

      if (Array.isArray(rawPrevValue)) {
        prevValue = rawPrevValue
      } else if (rawPrevValue !== undefined && rawPrevValue !== null && typeof rawPrevValue === 'object') {
        prevValue = rawPrevValue._id
      } else {
        prevValue = rawPrevValue
      }
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
    [...hierarchy.getAllAttributes(_class).entries()].filter(([, attr]) => attr.hidden === true).map(([k]) => k)
  )
}

export async function getAttrName (
  attributeUpdates: DocAttributeUpdates,
  objectClass: Ref<Class<Doc>>,
  hierarchy: Hierarchy
): Promise<string | undefined> {
  const { attrKey, attrClass, isMixin } = attributeUpdates
  let attrObjectClass = objectClass

  try {
    if (isMixin) {
      const keyedAttribute = [...hierarchy.getAllAttributes(attrClass).entries()]
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

    return await translate(label, {})
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

function getAttrClass (hierarchy: Hierarchy, attribute: AnyAttribute): Ref<Class<Doc>> | undefined {
  if (hierarchy.isDerived(attribute.type._class, core.class.RefTo)) {
    return (attribute.type as RefTo<Doc>).to
  } else if (hierarchy.isDerived(attribute.type._class, core.class.ArrOf)) {
    const of = (attribute.type as ArrOf<AttachedDoc>).of
    return of._class === core.class.RefTo ? (of as RefTo<Doc>).to : of._class
  }

  return attribute.type._class
}

export async function getNewActivityUpdates (
  control: TriggerControl,
  originTx: TxCUD<Card>,
  card: Card
): Promise<ActivityUpdate[]> {
  if (![core.class.TxMixin, core.class.TxUpdateDoc].includes(originTx._class)) {
    return []
  }

  const tx = originTx as TxUpdateDoc<Card> | TxMixin<Card, Card>
  const { hierarchy } = control

  const keys = getAvailableAttributesKeys(tx, hierarchy)
  const result: ActivityUpdate[] = []
  const mixin = hierarchy.isDerived(tx._class, core.class.TxMixin) ? (tx as TxMixin<Card, Card>).mixin : undefined

  if (mixin != null && Object.keys((tx as TxMixin<Card, Card>).attributes).length === 0) {
    const clazz = hierarchy.getClass(mixin)
    if (hierarchy.isDerived(clazz._class, cardPlugin.class.Tag)) {
      result.push({
        type: ActivityUpdateType.Tag,
        tag: mixin,
        action: 'add'
      })
    }
  }

  if (keys.length === 0) return result
  const modifiedAttributes = getModifiedAttributes(tx, hierarchy)

  for (const key of keys) {
    const attrValue = modifiedAttributes[key]

    const added = combineAttributes([modifiedAttributes], key, '$push', '$each')
    const removed = combineAttributes([modifiedAttributes], key, '$pull', '$in')
    const isUnset = combineAttributes([modifiedAttributes], key, '$unset')[0] === true

    if (isUnset && hierarchy.isMixin(key as any)) {
      const tag = key as Ref<Tag>
      const clazz = hierarchy.getClass(tag)

      if (hierarchy.isDerived(clazz._class, cardPlugin.class.Tag)) {
        result.push({
          type: ActivityUpdateType.Tag,
          tag,
          action: 'remove'
        })
      }
    }

    const attribute = hierarchy.findAttribute(mixin ?? card._class, key)
    const attrClass: Ref<Class<Doc>> | undefined = attribute != null ? getAttrClass(hierarchy, attribute) : undefined

    if (attrClass === undefined) continue
    if (
      hierarchy.isDerived(attrClass, core.class.TypeMarkup) ||
      hierarchy.isDerived(attrClass, core.class.TypeCollaborativeDoc)
    ) {
      continue
    }

    result.push({
      type: ActivityUpdateType.Attribute,
      attrKey: key,
      attrClass,
      set: attrValue,
      added,
      removed,
      mixin
    })
  }

  return result
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

function getUrlPresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): UrlPresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.UrlPresenter)
}

function getIdentifierPresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): IdentifierPresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.IdentifierPresenter)
}

function getTitlePresenter (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): TitlePresenter | undefined {
  return hierarchy.classHierarchyMixin(_class, serverActivity.mixin.TitlePresenter)
}

export async function getDocTitle (control: PresenterControl, doc: Doc): Promise<string | undefined> {
  if (control.hierarchy.isDerived(doc._class, activity.class.ActivityMessage)) {
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

  const TitlePresenter = getTitlePresenter(doc._class, control.hierarchy)

  if (TitlePresenter !== undefined) {
    return await (
      await getResource(TitlePresenter.presenter)
    )(doc, control)
  }

  const clazz = control.hierarchy.getClass(doc._class)
  if (clazz.titleKey != null) {
    return (doc as any)[clazz.titleKey] ?? undefined
  }
}

export async function getDocIdentifier (control: PresenterControl, doc: Doc): Promise<string | undefined> {
  const IdentifierPresenter = getIdentifierPresenter(doc._class, control.hierarchy)

  if (IdentifierPresenter === undefined) return
  return await (
    await getResource(IdentifierPresenter.presenter)
  )(doc, control)
}

export async function getDocUrl (control: PresenterControl, doc: Doc): Promise<string | undefined> {
  const UrlPresenter = getUrlPresenter(doc._class, control.hierarchy)
  if (UrlPresenter === undefined) return
  return await (
    await getResource(UrlPresenter.presenter)
  )(doc, control)
}
