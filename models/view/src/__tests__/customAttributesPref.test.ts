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

import core, { type Class, ClassifierKind, type Doc, Hierarchy, type Ref, TxFactory } from '@hcengineering/core'
import { remapMixinCustomAttributes } from '../customAttributesPref'

const Issue = 'tracker:class:Issue' as Ref<Class<Doc>>
const IssueTaskType = 'tracker:class:IssueTaskType' as Ref<Class<Doc>>
const Project = 'tracker:class:Project' as Ref<Class<Doc>>
const OldMixin = 'tracker:mixin:IssueTypeData'
const attr = 'custom6966021cbd3b282aaaf359f4'

// Classes only: mid-upgrade the moved attribute may not be in the hierarchy yet.
function buildHierarchy (): Hierarchy {
  const factory = new TxFactory(core.account.System)
  const hierarchy = new Hierarchy()
  const classTx = (_id: Ref<Class<Doc>>, ext?: Ref<Class<Doc>>): void => {
    const data = { kind: ClassifierKind.CLASS, extends: ext, label: _id }
    hierarchy.tx(factory.createTxCreateDoc(core.class.Class, core.space.Model, data as any, _id))
  }
  classTx(core.class.Doc)
  classTx(Issue, core.class.Doc)
  classTx(IssueTaskType, Issue)
  classTx(Project, core.class.Doc)
  return hierarchy
}

describe('remapMixinCustomAttributes', () => {
  const hierarchy = buildHierarchy()
  const remap = (attachTo: Ref<Class<Doc>>, customAttributes?: string[], descendantAttributes?: any[]): any =>
    remapMixinCustomAttributes(hierarchy, attachTo, { customAttributes, descendantAttributes }, OldMixin, IssueTaskType)

  test('moves keys of the old mixin to descendantAttributes of the new class', () => {
    const other = { _class: IssueTaskType, key: 'customOther' }
    expect(remap(Issue, ['customOwn', `${OldMixin}.${attr}`, 'x:mixin:Y.customY'], [other])).toEqual({
      customAttributes: ['customOwn', 'x:mixin:Y.customY'],
      descendantAttributes: [other, { _class: IssueTaskType, key: attr }]
    })
  })

  test('clears customAttributes with an empty array, not undefined', () => {
    expect(remap(Issue, [`${OldMixin}.${attr}`])).toEqual({
      customAttributes: [],
      descendantAttributes: [{ _class: IssueTaskType, key: attr }]
    })
  })

  test('does not duplicate an already enabled descendant attribute', () => {
    const enabled = [{ _class: IssueTaskType, key: attr }]
    expect(remap(Issue, [`${OldMixin}.${attr}`], enabled)).toEqual({
      customAttributes: [],
      descendantAttributes: enabled
    })
  })

  test('a viewlet of the new class itself gets a plain key', () => {
    expect(remap(IssueTaskType, [`${OldMixin}.${attr}`, attr])).toEqual({
      customAttributes: [attr],
      descendantAttributes: []
    })
  })

  test('leaves preferences without old keys, of unrelated or unknown classes untouched', () => {
    expect(remap(Issue, ['customOwn'])).toBeUndefined()
    expect(remap(Issue, undefined)).toBeUndefined()
    expect(remap(Issue, [`${OldMixin}X.${attr}`])).toBeUndefined()
    expect(remap(Project, [`${OldMixin}.${attr}`])).toBeUndefined()
    expect(remap('custom:class:Removed' as Ref<Class<Doc>>, [`${OldMixin}.${attr}`])).toBeUndefined()
  })

  test('is idempotent', () => {
    const once = remap(Issue, ['customOwn', `${OldMixin}.${attr}`])
    expect(remap(Issue, once.customAttributes, once.descendantAttributes)).toBeUndefined()
  })
})
