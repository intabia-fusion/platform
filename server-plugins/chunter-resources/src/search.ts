/**
 Copyright © 2026 Intabia Fusion.

 Licensed under the Eclipse Public License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License. You may
 obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

 See the License for the specific language governing permissions and
 limitations under the License.
 */

import { type Doc, getObjectValue, type Hierarchy, MeasureContext, type Space } from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import serverCore, {
  type FieldTemplate,
  type FieldTemplateParam,
  SearchPresenterProvider,
  WithFind
} from '@hcengineering/server-core'
import chunter, { type Chat, type DirectMessage } from '@hcengineering/chunter'
import contactPlugin, { formatName, type Person } from '@hcengineering/contact'

export const ChatSearchTitleProvider: SearchPresenterProvider = async (
  _doc: Doc,
  parent: Doc | undefined,
  space: Space | undefined,
  hierarchy: Hierarchy,
  mode: string,
  ctx: MeasureContext,
  storage: WithFind
): Promise<string> => {
  if (parent === undefined) return ''

  if (hierarchy.isDerived(parent._class, chunter.class.DirectMessage)) {
    const chat = _doc as Chat
    const direct = parent as DirectMessage
    const members = direct.members ?? []

    const persons = await storage.findAll<Person>(
      ctx,
      contactPlugin.class.Person,
      { personUuid: { $in: members } },
      { skipSpace: true, skipClass: true }
    )
    const otherPersons = members.length === 1 ? persons : persons.filter((p) => p.personUuid !== chat.account)

    return otherPersons
      .map((p) => formatName(p.name).trim())
      .filter((name) => name !== '')
      .join(' ')
  }

  // Try to use parent's SearchPresenter if it exists
  const presenter = hierarchy.classHierarchyMixin(parent._class, serverCore.mixin.SearchPresenter)
  if (presenter !== undefined) {
    const template = mode === 'short' ? (presenter.shortTitle ?? presenter.title) : presenter.title

    return await evaluateTemplate(parent, undefined, space, hierarchy, template, ctx, storage)
  }

  if (mode === 'title') {
    const clazz = hierarchy.findClass(parent._class)
    if (clazz?.titleKey != null) {
      return (parent as any)[clazz.titleKey] ?? ''
    }
  }

  return ''
}

async function evaluateTemplate (
  doc: Doc,
  parent: Doc | undefined,
  space: Space | undefined,
  hierarchy: Hierarchy,
  template: FieldTemplate | any,
  ctx: MeasureContext,
  storage: WithFind
): Promise<string> {
  if (template === undefined) return ''

  const actualTemplate = Array.isArray(template) ? template : template.template
  if (actualTemplate === undefined) return ''

  let result = ''
  for (const item of actualTemplate) {
    if (typeof item === 'string') {
      result += item
    } else {
      result += `${await extractParam(doc, parent, space, hierarchy, item, ctx, storage)}`
    }
  }
  return result
}

async function extractParam (
  doc: Doc,
  parent: Doc | undefined,
  space: Space | undefined,
  hierarchy: Hierarchy,
  f: FieldTemplateParam,
  ctx: MeasureContext,
  storage: WithFind
): Promise<any> {
  if (f.length === 1) {
    return getObjectValue(f[0], doc)
  }
  switch (f[0]) {
    case 'func': {
      const rf = await getResource(f[1])
      if (typeof rf === 'function') {
        return await rf(doc, parent, space, hierarchy, f[2], ctx, storage)
      }
      return ''
    }
    case 'space':
      return space !== undefined ? getObjectValue(f[1], space) : ''
    case 'parent':
      return parent !== undefined ? getObjectValue(f[1], parent) : ''
    default:
      return ''
  }
}
