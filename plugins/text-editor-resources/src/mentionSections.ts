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

import contact, { getName } from '@hcengineering/contact'
import { AccountRole, SortingOrder, type Client } from '@hcengineering/core'
import type { ObjectSearchCategory, SearchItem } from '@hcengineering/presentation'

/** How many employees the mention popup shows. */
export const MENTION_EMPLOYEES_LIMIT = 5

/**
 * Employees for the mention popup, read from the database.
 *
 * The search index keeps no attributes (only service fields and text), so it cannot tell an
 * employee from a guest and cannot filter by the role. The database can: `role` is a field of
 * `contact:mixin:Employee`, and filtering there happens before the limit - guests never take a
 * slot, and no client-side filtering or paging is needed.
 *
 * Inactive employees are kept on purpose: they are still mentionable.
 */
export async function findMentionEmployees (
  client: Pick<Client, 'findAll' | 'getHierarchy'>,
  query: string,
  category: ObjectSearchCategory
): Promise<SearchItem[]> {
  try {
    const docs = await client.findAll(
      contact.mixin.Employee,
      { name: { $like: `%${query}%` }, role: AccountRole.User },
      { limit: MENTION_EMPLOYEES_LIMIT, sort: { name: SortingOrder.Ascending } }
    )
    const hierarchy = client.getHierarchy()
    return docs.map((doc, num) => ({
      num,
      category,
      item: {
        id: doc._id,
        title: getName(hierarchy, doc),
        doc,
        iconComponent: { component: contact.component.AvatarRef, props: { _id: doc._id } },
        titleComponent: { component: contact.component.ContactNamePresenter, props: { name: doc.name } }
      }
    }))
  } catch (err: any) {
    // Losing the employee section is better than losing the popup: other categories still show.
    console.error('[findMentionEmployees] Failed', { error: err?.message ?? String(err), query })
    return []
  }
}

/**
 * Puts the mention list together: employees first, then Everyone/Here, then the categories the
 * fulltext search returned. Every section starts at zero, since a header is drawn above its
 * first item.
 */
export function mergeMentionSections (
  employees: SearchItem[],
  special: SearchItem[],
  others: SearchItem[]
): SearchItem[] {
  return [
    ...employees.map((it, num) => ({ ...it, num })),
    ...special.map((it, num) => ({ ...it, num: employees.length + num })),
    ...others
  ]
}
