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

import core, { type AnyAttribute, type Class, type Doc, type Ref, type TxOperations } from '@hcengineering/core'
import { hasSortRules } from '../sortRules'

// The real modules pull the UI and a live client in; `hasSortRules` only reads the model.
jest.mock('@hcengineering/presentation', () => ({
  getAttributePresenterClass: (_hierarchy: any, type: any) => ({ attrClass: type._class, category: 'attribute' })
}))
jest.mock('../utils', () => ({}))

const classRef = (id: string): Ref<Class<Doc>> => id as Ref<Class<Doc>>

function makeClient (attr: AnyAttribute, modelDocs: Array<{ _id: string }> = []): TxOperations {
  return {
    getHierarchy: () => ({
      findAttribute: () => attr,
      // A class is derived from itself; a type class is derived from `core.class.Type`.
      isDerived: (from: Ref<Class<Doc>>, of: Ref<Class<Doc>>) => from === of || of === core.class.Type,
      classHierarchyMixin: () => undefined
    }),
    getModel: () => ({
      findAllSync: () => modelDocs
    })
  } as unknown as TxOperations
}

describe('hasSortRules', () => {
  const issue = classRef('tracker:class:Issue')
  const target = classRef('test:class:Target')

  it('does not build rules for an enum: it keeps its declaration order', () => {
    const attr = { type: { _class: core.class.EnumOf, of: 'test:enum:Severity' } } as unknown as AnyAttribute
    expect(hasSortRules(makeClient(attr), issue, 'severity')).toBe(false)
  })

  it('builds rules for a reference whose values are in the model', () => {
    const attr = { type: { _class: core.class.RefTo, to: target } } as unknown as AnyAttribute
    expect(hasSortRules(makeClient(attr, [{ _id: 'test:doc:a' }]), issue, 'target')).toBe(true)
  })

  it('leaves a reference without model values to the plain sort', () => {
    const attr = { type: { _class: core.class.RefTo, to: target } } as unknown as AnyAttribute
    expect(hasSortRules(makeClient(attr), issue, 'target')).toBe(false)
  })
})
