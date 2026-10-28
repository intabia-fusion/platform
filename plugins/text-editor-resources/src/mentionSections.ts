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

import contact, { type Employee } from '@hcengineering/contact'
import { AccountRole, type Client, type Doc, type Ref } from '@hcengineering/core'
import type { IntlString } from '@hcengineering/platform'
import type { SearchItem } from '@hcengineering/presentation'

/** Guest flag per person, kept for the lifetime of one mention popup. */
export type GuestCache = Map<Ref<Doc>, boolean>

/**
 * Which of the found persons are guests.
 *
 * The role lives on the `contact:mixin:Employee` mixin and is not a field of the search index
 * (that one keeps only service fields and text), so the search cannot filter by it. The ids are
 * the ones the search already returned - one more query, no widening.
 */
export async function loadGuestIds (
  client: Pick<Client, 'findAll'>,
  ids: Array<Ref<Doc>>,
  cache: GuestCache
): Promise<Set<Ref<Doc>>> {
  const guests = new Set<Ref<Doc>>()
  const unknown: Array<Ref<Doc>> = []

  for (const id of ids) {
    const cached = cache.get(id)
    if (cached === undefined) {
      unknown.push(id)
    } else if (cached) {
      guests.add(id)
    }
  }

  if (unknown.length === 0) return guests

  try {
    const found = await client.findAll(
      contact.mixin.Employee,
      { _id: { $in: unknown as Array<Ref<Employee>> } },
      { limit: unknown.length }
    )
    for (const doc of found) {
      const isGuest = ((doc as any)[contact.mixin.Employee]?.role as AccountRole | undefined) === AccountRole.Guest
      cache.set(doc._id as Ref<Doc>, isGuest)
      if (isGuest) guests.add(doc._id as Ref<Doc>)
    }
  } catch (err: any) {
    // Losing the section is better than losing the popup: everyone stays in the list as found.
  }

  return guests
}

/**
 * Splits the employee section of the mention list into employees and guests.
 *
 * A guest is a workspace member too, so the search returns both in one `Employee` category. The
 * guest section has its own title and appears only when at least one guest was found; an empty
 * section is never rendered, since a header exists only above its first item.
 */
export function splitMentionItems (
  items: SearchItem[],
  guestIds: Set<Ref<Doc>>,
  guestsTitle: IntlString
): SearchItem[] {
  if (guestIds.size === 0) return items

  const employeeIndex = items.findIndex((it) => it.category.classToSearch === contact.mixin.Employee)
  if (employeeIndex === -1) return items

  const employees: SearchItem[] = []
  const guests: SearchItem[] = []
  for (const it of items) {
    if (it.category.classToSearch !== contact.mixin.Employee) continue
    if (guestIds.has(it.item.doc._id)) {
      guests.push(it)
    } else {
      employees.push(it)
    }
  }
  if (guests.length === 0) return items

  const employeeCategory = items[employeeIndex].category
  const guestCategory = { ...employeeCategory, title: guestsTitle }

  const employeeSection = [
    ...employees.map((it, num) => ({ ...it, num, category: employeeCategory })),
    ...guests.map((it, num) => ({ ...it, num, category: guestCategory }))
  ]

  const before = items.filter((it, idx) => idx < employeeIndex && it.category.classToSearch !== contact.mixin.Employee)
  const after = items.filter((it, idx) => idx > employeeIndex && it.category.classToSearch !== contact.mixin.Employee)
  return [...before, ...employeeSection, ...after]
}
