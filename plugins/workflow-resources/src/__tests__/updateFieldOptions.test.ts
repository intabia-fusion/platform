//
// Copyright © 2026 Intabia Fusion.
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

import core, {
  type AnyAttribute,
  type Class,
  type Client,
  ClassifierKind,
  type Doc,
  type Ref
} from '@hcengineering/core'
import contact from '@hcengineering/contact'
import { type TaskType } from '@hcengineering/task'

import { getContextOptions, isAttributeCompatible } from '../components/postFunctions/editors/update-field/utils'
import { type ContextOption } from '../components/postFunctions/editors/update-field/types'

const issueClass = 'tracker:class:Issue' as Ref<Class<Doc>>

function attr (name: string, type: Record<string, any>, attributeOf: Ref<Class<Doc>> = issueClass): AnyAttribute {
  return { _id: `${attributeOf}_${name}`, name, label: name, attributeOf, type } as any
}

const title = attr('title', { _class: core.class.TypeString })
const assignee = attr('assignee', { _class: core.class.RefTo, to: contact.class.Person })
const component = attr('component', { _class: core.class.RefTo, to: 'tracker:class:Component' })
const createdBy = attr('createdBy', { _class: core.class.TypePersonId }, core.class.Doc)
const modifiedBy = attr('modifiedBy', { _class: core.class.TypePersonId }, core.class.Doc)

const hierarchy: any = {
  isDerived: (c: any, target: any) => c === target,
  getDescendants: (c: any) => [c],
  findClass: (c: any) => ({ _id: c, kind: ClassifierKind.CLASS }),
  getAllAttributes: () => new Map([title, assignee, component, createdBy, modifiedBy].map((it) => [it.name, it]))
}

const client = {
  getHierarchy: () => hierarchy,
  getModel: () => ({ findAllSync: () => [], getObject: () => undefined })
} as unknown as Client

const taskType = { targetClass: issueClass } as unknown as TaskType

function group (options: ContextOption[], id: string): ContextOption[] {
  return options.find((it) => it.id === id)?.children ?? []
}

function fieldKeys (options: ContextOption[]): Array<string | undefined> {
  return options.map((it) => (it.value !== undefined && 'fieldKey' in it.value ? it.value.fieldKey : undefined))
}

describe('createdBy as an UpdateFieldValue source', () => {
  it('is offered for a person field from the task and its parent', () => {
    const options = getContextOptions(client, taskType, assignee)

    for (const [groupId, type] of [
      ['thisTaskGroup', 'this'],
      ['parentGroup', 'parent']
    ]) {
      const items = group(options, groupId)
      expect(items.map((it) => it.value)).toContainEqual({
        type,
        attribute: createdBy._id,
        fieldKey: 'createdBy',
        mixin: core.class.Doc
      })
      expect(fieldKeys(items)).not.toContain('modifiedBy')
    }
  })

  it('is not offered for a non-person field', () => {
    const options = getContextOptions(client, taskType, title)

    expect(fieldKeys(group(options, 'thisTaskGroup'))).not.toContain('createdBy')
  })

  it('is compatible only with refs to a person', () => {
    expect(isAttributeCompatible(hierarchy, createdBy, assignee)).toEqual({ compatible: true })
    expect(isAttributeCompatible(hierarchy, createdBy, component)).toEqual({ compatible: false })
  })
})
