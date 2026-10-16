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

import core, { type Class, type Doc, type Ref, type TxOperations } from '@hcengineering/core'

interface NamedDoc extends Doc {
  name?: string
  label?: string
  title?: string
}

/**
 * Sorts category values by document name for Ref-attributes, handles primitive types without queries,
 * and keeps empty values (null/undefined) at the end.
 *
 * @public
 */
export async function sortNamedCategories (
  client: TxOperations,
  attrClass: Ref<Class<Doc>>,
  categories: any[]
): Promise<any[]> {
  const categoryName = (category: any): string => {
    if (typeof category === 'string') return category
    if (typeof category === 'object' && category !== null) {
      const name = (category as { name?: unknown }).name
      if (typeof name === 'string') return name
    }
    return ''
  }

  const isEmpty = (c: any): boolean => c == null || (typeof c === 'object' && categoryName(c) === '')

  const emptyCategories = categories.filter(isEmpty)
  const rest = categories.filter((c) => !isEmpty(c))
  if (rest.length === 0) return categories

  const hierarchy = client.getHierarchy()
  const isTypeClass = hierarchy.isDerived(attrClass, core.class.Type)

  const nameById = new Map<Ref<Doc>, string>()
  if (!isTypeClass) {
    const refKeys = [...new Set(rest.filter((c) => typeof c === 'string'))].filter((k) => k.length > 0) as Array<
      Ref<Doc>
    >
    if (refKeys.length > 0) {
      const modelDocs = client.getModel().findAllSync(attrClass, { _id: { $in: refKeys } })
      for (const d of modelDocs) {
        nameById.set(d._id, (d as NamedDoc).name ?? (d as NamedDoc).label ?? (d as NamedDoc).title ?? '')
      }
      const missing = refKeys.filter((k) => !nameById.has(k))
      if (missing.length > 0) {
        const docs = await client.findAll(attrClass, { _id: { $in: missing } })
        for (const d of docs) {
          nameById.set(d._id, (d as NamedDoc).name ?? (d as NamedDoc).label ?? (d as NamedDoc).title ?? '')
        }
      }
    }
  }

  const nameOf = (c: any): string => {
    const key = categoryName(c)
    return nameById.get(key as Ref<Doc>) ?? key
  }

  const sorted = [...rest].sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }))

  return [...sorted, ...emptyCategories]
}
