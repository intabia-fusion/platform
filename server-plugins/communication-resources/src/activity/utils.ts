import {
  ActivityCollectionUpdate,
  ActivityMessageExtra,
  ActivityUpdate,
  ActivityUpdateType
} from '@hcengineering/communication-types'
import core, {
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
  type TxCreateDoc,
  type TxCUD,
  type TxMixin,
  TxProcessor,
  type TxUpdateDoc
} from '@hcengineering/core'
import { type TriggerControl } from '@hcengineering/server-core'
import card, { Tag } from '@hcengineering/card'
import communication, { ActivityControl } from '@hcengineering/communication'

import { DocsCache } from './types'

// Use 90 KB limit for attribute updates
// const valueSizeLimit = 100 * 1024

// function valueSizeExceedsLimit (value: any): boolean {
//   if (value == null) return false
//   if (Array.isArray(value)) {
//     return value.some((v) => valueSizeExceedsLimit(v))
//   } else if (typeof value === 'string') {
//     return value.length > valueSizeLimit
//   } else if (typeof value === 'object') {
//     return JSON.stringify(value).length > valueSizeLimit
//   }
//   return false
// }

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

export function getActivityAction (hierarchy: Hierarchy, tx: TxCUD<Doc>): 'create' | 'remove' | 'update' {
  if (hierarchy.isDerived(tx._class, core.class.TxCreateDoc)) return 'create'
  if (hierarchy.isDerived(tx._class, core.class.TxRemoveDoc)) return 'remove'

  return 'update'
}

export async function getActivityAttributesUpdates (
  ctx: MeasureContext,
  control: TriggerControl,
  tx: TxCUD<Doc>,
  _doc: Doc,
  docCache: DocsCache,
  controlRules?: ActivityControl[]
): Promise<ActivityUpdate[]> {
  if (![core.class.TxMixin, core.class.TxUpdateDoc].includes(tx._class)) return []

  const doc = _doc._id !== tx.objectId ? await getDocCached(ctx, control, tx.objectClass, tx.objectId, docCache) : _doc
  if (doc === undefined) return []

  const { hierarchy } = control
  const result: ActivityUpdate[] = []

  const allowedFields = new Set<string>(controlRules?.flatMap((it) => it.allowedFields ?? []) ?? [])
  const skipFields = new Set<string>(controlRules?.flatMap((it) => it.skipFields ?? []) ?? [])

  const keys = getAvailableAttributesKeys(tx, hierarchy).filter(
    (it) => !skipFields.has(it) && (allowedFields.size === 0 || allowedFields.has(it))
  )

  const mixin = hierarchy.isDerived(tx._class, core.class.TxMixin) ? (tx as TxMixin<Doc, Doc>).mixin : undefined

  if (
    mixin != null &&
    hierarchy.isDerived(tx.objectClass, card.class.Card) &&
    Object.keys((tx as TxMixin<Doc, Doc>).attributes).length === 0
  ) {
    const clazz = hierarchy.getClass(mixin)
    if (hierarchy.isDerived(clazz._class, card.class.Tag)) {
      result.push({
        type: ActivityUpdateType.Tag,
        tag: mixin,
        action: 'add'
      })
    }
  }

  if (keys.length === 0) return []

  const modifiedAttributes = getModifiedAttributes(tx, hierarchy)

  for (const key of keys) {
    const attrValue = modifiedAttributes[key]

    const added = combineAttributes([modifiedAttributes], key, '$push', '$each')
    const removed = combineAttributes([modifiedAttributes], key, '$pull', '$in')
    const isUnset = combineAttributes([modifiedAttributes], key, '$unset')[0] === true

    if (isUnset && hierarchy.isMixin(key as any)) {
      const tag = key as Ref<Tag>
      const clazz = hierarchy.getClass(tag)

      if (hierarchy.isDerived(clazz._class, card.class.Tag)) {
        result.push({
          type: ActivityUpdateType.Tag,
          tag,
          action: 'remove'
        })
      }
    }

    const attrClass: Ref<Class<Doc>> | undefined = getAttrClass(hierarchy, mixin ?? doc._class, key)

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

export async function getActivityCollectionUpdate (
  control: TriggerControl,
  tx: TxCUD<Doc>,
  attachedToDoc: Doc,
  controlRules?: ActivityControl[]
): Promise<ActivityCollectionUpdate | undefined> {
  if (tx.collection == null) return undefined

  const { hierarchy } = control
  let result: ActivityCollectionUpdate | undefined

  const allowedFields = new Set<string>(controlRules?.flatMap((it) => it.allowedFields ?? []) ?? [])
  const skipFields = new Set<string>(controlRules?.flatMap((it) => it.skipFields ?? []) ?? [])

  const attribute = getCollectionAttribute(control.hierarchy, attachedToDoc._class, tx.collection)

  if (attribute == null || attribute.hidden === true) {
    return undefined
  }

  const keys = [tx.collection].filter(
    (it) => !skipFields.has(it) && (allowedFields.size === 0 || allowedFields.has(it))
  )

  if (keys.length === 0) return undefined

  if (tx._class === core.class.TxCreateDoc) {
    const collectionDoc = TxProcessor.createDoc2Doc(tx as TxCreateDoc<Doc>)
    const clazz = hierarchy.getClass(collectionDoc._class)

    result = {
      type: ActivityUpdateType.Collection,
      collection: tx.collection,
      objectId: collectionDoc._id,
      objectClass: collectionDoc._class,
      title: clazz.titleKey != null ? (collectionDoc as any)[clazz.titleKey] : undefined,
      attributes: clazz.titleKey != null ? undefined : (tx as TxCreateDoc<Doc>).attributes
    }
  } else if (tx._class === core.class.TxRemoveDoc) {
    const collectionDoc = control.removedMap.get(tx.objectId)
    const clazz = hierarchy.getClass(tx.objectClass)
    result = {
      type: ActivityUpdateType.Collection,
      collection: tx.collection,
      objectId: tx.objectId,
      objectClass: tx.objectClass,
      title: clazz.titleKey != null && collectionDoc != null ? (collectionDoc as any)[clazz.titleKey] : undefined,
      attributes: clazz.titleKey != null ? undefined : collectionDoc
    }
  }

  return result
}

function getHiddenAttrs (hierarchy: Hierarchy, _class: Ref<Class<Doc>>): Set<string> {
  return new Set(
    [...hierarchy.getAllAttributes(_class).entries()].filter(([, attr]) => attr.hidden === true).map(([k]) => k)
  )
}

function getCollectionAttribute (
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

// export async function getAttrName (
//   attributeUpdates: DocAttributeUpdates,
//   objectClass: Ref<Class<Doc>>,
//   hierarchy: Hierarchy
// ): Promise<string | undefined> {
//   const { attrKey, attrClass, isMixin } = attributeUpdates
//   let attrObjectClass = objectClass
//
//   try {
//     if (isMixin) {
//       const keyedAttribute = [...hierarchy.getAllAttributes(attrClass).entries()]
//         .filter(([, value]) => value.hidden !== true)
//         .map(([key, attr]) => ({ key, attr }))
//         .find(({ key }) => key === attrKey)
//       if (keyedAttribute === undefined) {
//         return undefined
//       }
//       attrObjectClass = keyedAttribute.attr.attributeOf
//     }
//
//     const attribute = hierarchy.getAttribute(attrObjectClass, attrKey)
//
//     const label = attribute.shortLabel ?? attribute.label
//
//     if (label === undefined) {
//       return undefined
//     }
//
//     return await translate(label, {})
//   } catch (e) {
//     console.error(e)
//     return undefined
//   }
// }

//  function getCollectionAttribute (
//   hierarchy: Hierarchy,
//   objectClass: Ref<Class<Doc>>,
//   collection?: string
// ): Attribute<Collection<AttachedDoc>> | undefined {
//   if (collection === undefined) {
//     return undefined
//   }
//
//   const descendants = hierarchy.getDescendants(objectClass)
//
//   for (const descendant of descendants) {
//     const collectionAttribute = hierarchy.findAttribute(descendant, collection)
//     if (collectionAttribute !== undefined) {
//       return collectionAttribute
//     }
//   }
//
//   return undefined
// }

function getAttrClass (
  hierarchy: Hierarchy,
  objectClass: Ref<Class<Doc>>,
  attrKey: string
): Ref<Class<Doc>> | undefined {
  const clazz = hierarchy.findAttribute(objectClass, attrKey)

  if (clazz === undefined) return undefined

  if (hierarchy.isDerived(clazz.type._class, core.class.RefTo)) {
    return (clazz.type as RefTo<Doc>).to
  } else if (hierarchy.isDerived(clazz.type._class, core.class.ArrOf)) {
    const of = (clazz.type as ArrOf<AttachedDoc>).of
    return of._class === core.class.RefTo ? (of as RefTo<Doc>).to : of._class
  }

  return clazz.type._class
}

export function isActivityIgnored (_class: Ref<Class<Doc>>, hierarchy: Hierarchy): boolean {
  return hierarchy.classHierarchyMixin(_class, communication.mixin.IgnoreActivity) !== undefined
}

export async function getDocCached (
  ctx: MeasureContext,
  control: TriggerControl,
  _class: Ref<Class<Doc>>,
  _id: Ref<Doc>,
  cache: DocsCache
): Promise<Doc | undefined> {
  let doc = cache.get(_id)
  if (doc == null) {
    doc = (await control.findAll(ctx, _class, { _id }, { limit: 1 }))[0]
  }
  if (doc == null) {
    const createTx = (await control.findAll(ctx, core.class.TxCreateDoc, { objectId: _id }, { limit: 1 }))[0]

    doc = createTx !== undefined ? TxProcessor.createDoc2Doc(createTx as TxCreateDoc<Doc>) : undefined
  }

  if (doc != null) {
    cache.set(doc._id, doc)
  }

  return doc
}

// async function getAttributesUpdatesText (
//   attributeUpdates: DocAttributeUpdates,
//   objectClass: Ref<Class<Doc>>,
//   hierarchy: Hierarchy
// ): Promise<string | undefined> {
//   const attrName = await getAttrName(attributeUpdates, objectClass, hierarchy)
//
//   if (attrName === undefined) {
//     return undefined
//   }
//
//   if (attributeUpdates.added.length > 0) {
//     return await translate(activity.string.NewObject, { object: attrName })
//   }
//   if (attributeUpdates.removed.length > 0) {
//     return await translate(activity.string.RemovedObject, { object: attrName })
//   }
//
//   if (attributeUpdates.set.length > 0) {
//     const values = attributeUpdates.set
//     const isUnset = values.length > 0 && !values.some((value) => value !== null && value !== '')
//
//     if (isUnset) {
//       return await translate(activity.string.UnsetObject, { object: attrName })
//     } else {
//       return await translate(activity.string.ChangedObject, { object: attrName })
//     }
//   }
//
//   return undefined
// }

export async function getActivityMarkdownContent (
  control: TriggerControl,
  extra: ActivityMessageExtra,
  doc: Doc
): Promise<string> {
  // const { action, update } = extra
  // const { hierarchy } = control
  // const clazz = hierarchy.getClass(doc._class)
  // const objectType = await translate(clazz.label, {})

  // if (action === 'create') {
  //   return await translate(communication.string.NewObjectType, { type: objectType, title: doc.title })
  // }
  //
  // if (action === 'remove') {
  //   return await translate(activity.string.RemovedObjectType, { type: objectType, title: doc.title })
  // }
  //
  // if (action === 'update' && update !== undefined) {
  //   const text = await getUpdateText(update, doc, hierarchy)
  //
  //   return text ?? (await translate(activity.string.ChangedObject, { object: doc.title }))
  // }

  return ''
}

// async function getUpdateText (update: ActivityUpdate, doc: Doc, hierarchy: Hierarchy): Promise<string | undefined> {
// if (update.type === ActivityUpdateType.Attribute) {
//   const attrName = await getAttrName(update, doc._class, hierarchy)
//
//   if (attrName === undefined) {
//     return undefined
//   }
//
//   const { added, removed, set, attrClass } = update
//
//   if (added != null && added.length > 0) {
//     return await translate(activity.string.NewObject, { object: attrName })
//   }
//   if (removed != null && removed.length > 0) {
//     return await translate(activity.string.RemovedObject, { object: attrName })
//   }
//
//   if (set !== undefined) {
//     const isUnset = set === null
//
//     if (isUnset) {
//       return await translate(activity.string.UnsetObject, { object: attrName })
//     } else {
//       const values = await getAttributeValues(set, attrClass)
//       if (values !== undefined) {
//         return await translate(activity.string.AttributeSetTo, {
//           name: capitalizeFirstLetter(attrName),
//           value: values.join(', ')
//         })
//       }
//       return await translate(activity.string.ChangedObject, { object: attrName })
//     }
//   }
// }
//
// if (update.type === ActivityUpdateType.Tag) {
//   const clazz = hierarchy.getClass(update.tag)
//   if (update.action === 'add') {
//     const tagName = await translate(clazz.label, {})
//     return await translate(activity.string.AddedTag, { title: tagName })
//   }
//   if (update.action === 'remove') {
//     const tagName = await translate(clazz.label, {})
//     return await translate(activity.string.RemovedTag, { title: tagName })
//   }
// }
//   return undefined
// }

// async function getAttrName (
//   attributeUpdates: ActivityAttributeUpdate,
//   objectClass: Ref<Class<Doc>>,
//   hierarchy: Hierarchy
// ): Promise<string | undefined> {
//   const { attrKey } = attributeUpdates
//
//   try {
//     const attribute = hierarchy.findAttribute(objectClass, attrKey)
//     if (attribute === undefined) return
//
//     const label = attribute.shortLabel ?? attribute.label
//
//     if (label === undefined) {
//       return undefined
//     }
//
//     return await translate(label, {})
//   } catch (e) {
//     console.error(e)
//     return undefined
//   }
// }
//
// const valueTypes: ReadonlyArray<Ref<Class<Doc>>> = [
//   core.class.TypeString,
//   core.class.EnumOf,
//   core.class.TypeNumber,
//   core.class.TypeDate,
//   core.class.TypeFileSize,
//   core.class.TypeMarkup,
//   core.class.TypeHyperlink
// ]
//
// async function getAttributeValues (value: any | any[], attrClass: Ref<Class<Doc>>): Promise<any[] | undefined> {
//   const values = Array.isArray(value) ? value : [value]
//   if (values.some((value) => typeof value !== 'string')) {
//     return values
//   }
//
//   if (valueTypes.includes(attrClass)) {
//     return values
//   }
//
//   return undefined
// }
//
// function capitalizeFirstLetter (str: string): string {
//   return str.charAt(0).toUpperCase() + str.slice(1)
// }
