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

import type { Doc, FindOptions, SortingQuery } from '@hcengineering/core'

/**
 * Options for a query that joins nothing: a sort over a joined field cannot be applied there, while a sort
 * over a field of the document is exactly the order the rows are read in and must stay. Without it the list
 * fell back to the storage order and the sorting the user picked had no effect.
 *
 * @public
 */
export function noLookupSortOptions<T extends Doc> (options: FindOptions<T>): FindOptions<T> {
  const { lookup, sort, ...resultOptions } = options
  if (sort === undefined) return resultOptions
  const plainSort = Object.fromEntries(Object.entries(sort).filter(([key]) => !key.startsWith('$lookup')))
  return Object.keys(plainSort).length > 0 ? { ...resultOptions, sort: plainSort as SortingQuery<T> } : resultOptions
}
