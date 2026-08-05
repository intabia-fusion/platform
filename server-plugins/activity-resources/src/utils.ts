import activity, { type ActivityMessage } from '@hcengineering/activity'
import core, { type Class, type Doc, type Hierarchy, type Ref, type Type } from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import {
  type IdentifierPresenter,
  type PresenterControl,
  type TitlePresenter,
  type UrlPresenter
} from '@hcengineering/server-activity'
import serverActivity from '@hcengineering/server-activity'
import { isEmptyMarkup, markupToText } from '@hcengineering/text-core'

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
