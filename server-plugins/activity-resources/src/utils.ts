import activity, { type ActivityMessage } from '@hcengineering/activity'
import cardPlugin, { type Card, type Tag } from '@hcengineering/card'
import { type ActivityUpdate, ActivityUpdateType } from '@hcengineering/communication-types'
import core, {
  type AnyAttribute,
  type ArrOf,
  type AttachedDoc,
  type Class,
  combineAttributes,
  type Doc,
  type Hierarchy,
  type Ref,
  type RefTo,
  type TxCUD,
  type TxMixin,
  type TxUpdateDoc,
  type Type
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import {
  type IdentifierPresenter,
  type PresenterControl,
  type TitlePresenter,
  type UrlPresenter
} from '@hcengineering/server-activity'
import { type TriggerControl } from '@hcengineering/server-core'
import serverActivity from '@hcengineering/server-activity'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'

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

function getHiddenAttrs (hierarchy: Hierarchy, _class: Ref<Class<Doc>>): Set<string> {
  return new Set(
    [...hierarchy.getAllAttributes(_class).entries()].filter(([, attr]) => attr.hidden === true).map(([k]) => k)
  )
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
