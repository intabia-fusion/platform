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

import contact, { getCurrentEmployee } from '@hcengineering/contact'
import core, { getCurrentAccount, type Hierarchy, type RefTo, type Doc } from '@hcengineering/core'
import type { Filter } from '@hcengineering/view'

// A saved condition refers to its reader, never to the account that edited the board.
export const CURRENT_USER_FILTER_VALUE = '$currentUser'

export function isUserFilter (hierarchy: Hierarchy, filter: Pick<Filter, 'key'>): boolean {
  const type = filter.key.attribute.type
  return (
    type._class === core.class.TypePersonId ||
    (type._class === core.class.RefTo && hierarchy.isDerived((type as RefTo<Doc>).to, contact.class.Person))
  )
}

export function resolveCurrentUserFilter (hierarchy: Hierarchy, filter: Filter): Filter {
  if (!filter.value.includes(CURRENT_USER_FILTER_VALUE) || !isUserFilter(hierarchy, filter)) return filter
  const values =
    filter.key.attribute.type._class === core.class.TypePersonId
      ? getCurrentAccount().socialIds
      : [getCurrentEmployee()]
  return {
    ...filter,
    value: [...new Set(filter.value.flatMap((value) => (value === CURRENT_USER_FILTER_VALUE ? values : [value])))]
  }
}
