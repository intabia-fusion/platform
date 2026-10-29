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
  generateId,
  type AnyAttribute,
  type Class,
  type Doc,
  type Ref,
  type SortingOrder,
  type SortingRules,
  type Space,
  type TxOperations
} from '@hcengineering/core'
import { getResource } from '@hcengineering/platform'
import { getAttributePresenterClass } from '@hcengineering/presentation'
import view, { type ViewletDescriptor } from '@hcengineering/view'
import { sortCategories } from './utils'

type ValuesSource = 'model' | 'allValues' | undefined

// An enum keeps its declaration order: the server and the client already sort it by that order, and its
// values have no presentation order of their own.
function valuesSource (client: TxOperations, attr: AnyAttribute, attrClass: Ref<Class<Doc>>): ValuesSource {
  if (attr.type._class === core.class.EnumOf) return undefined
  if (attr.type._class === core.class.RefTo) {
    return client.getModel().findAllSync(attrClass, {}).length > 0 ? 'model' : undefined
  }
  if (client.getHierarchy().classHierarchyMixin(attrClass, view.mixin.AllValuesFunc) !== undefined) return 'allValues'
  return undefined
}

async function getValues (
  client: TxOperations,
  attr: AnyAttribute,
  attrClass: Ref<Class<Doc>>,
  source: ValuesSource,
  space: Ref<Space> | undefined
): Promise<any[]> {
  const model = client.getModel()
  if (source === 'model') {
    return model.findAllSync(attrClass, {}).map((it) => it._id)
  }
  if (source === 'allValues') {
    const mixin = client.getHierarchy().classHierarchyMixin(attrClass, view.mixin.AllValuesFunc)
    if (mixin === undefined) return []
    const func = await getResource(mixin.func)
    const values = await func(undefined, () => {}, generateId<Doc>(), attr, space)
    return values !== undefined ? [...values] : []
  }
  return []
}

/**
 * @public
 */
export function hasSortRules (client: TxOperations, _class: Ref<Class<Doc>>, key: string): boolean {
  const hierarchy = client.getHierarchy()
  const attr = hierarchy.findAttribute(_class, key)
  if (attr === undefined) return false
  const attrClass = getAttributePresenterClass(hierarchy, attr.type).attrClass
  return valuesSource(client, attr, attrClass) !== undefined
}

/**
 * @public
 */
export async function buildSortRules (
  client: TxOperations,
  _class: Ref<Class<Doc>>,
  key: string,
  order: SortingOrder,
  space: Ref<Space> | undefined,
  viewletDescriptorId?: Ref<ViewletDescriptor>
): Promise<SortingRules<any> | undefined> {
  const hierarchy = client.getHierarchy()
  const attr = hierarchy.findAttribute(_class, key)
  if (attr === undefined) return undefined
  const attrClass = getAttributePresenterClass(hierarchy, attr.type).attrClass
  const source = valuesSource(client, attr, attrClass)
  if (source === undefined) return undefined

  const values = await getValues(client, attr, attrClass, source, space)
  if (values.length === 0) return undefined

  const ordered = await sortCategories(client, attrClass, space, values, viewletDescriptorId)

  const seen = new Set<string>()
  const cases: SortingRules<any>['cases'] = []
  for (const value of ordered) {
    if (value === undefined || value === null) continue
    const id = String(value)
    if (seen.has(id)) continue
    seen.add(id)
    cases.push({ query: value, index: cases.length })
  }
  if (cases.length === 0) return undefined
  return { order, default: cases.length, cases }
}
