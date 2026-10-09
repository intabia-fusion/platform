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

import type { AggregateValue, CategoryType } from '@hcengineering/core'

/**
 * Concatenates two category arrays, removing duplicates and preserving empty categories.
 * @public
 */
export function concatCategories (arr1: CategoryType[], arr2: CategoryType[]): CategoryType[] {
  const uniqueValues = new Set<string | number | undefined>()
  const uniqueObjects = new Map<string | number, AggregateValue>()
  let empty: CategoryType | undefined
  let hasEmpty = false

  const add = (item: CategoryType): void => {
    if (item == null) {
      if (!hasEmpty) {
        empty = item
        hasEmpty = true
      }
      return
    }
    if (typeof item === 'object') {
      const id = item.name
      if (id == null) {
        if (!hasEmpty) {
          empty = item
          hasEmpty = true
        }
        return
      }
      if (!uniqueObjects.has(id as any)) {
        uniqueObjects.set(id as any, item)
      }
    } else {
      uniqueValues.add(item)
    }
  }

  for (const item of arr1) add(item)
  for (const item of arr2) add(item)

  return hasEmpty ? [...uniqueValues, ...uniqueObjects.values(), empty] : [...uniqueValues, ...uniqueObjects.values()]
}
