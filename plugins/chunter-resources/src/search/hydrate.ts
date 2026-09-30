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

import chunter, { ChatMessage, type DirectMessage } from '@hcengineering/chunter'
import { Class, type Doc, notEmpty, Ref, SearchResultDoc, Space } from '@hcengineering/core'
import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
import { employeeByIdStore, getPersonsByPersonIds, getPersonsByPersonRefs } from '@hcengineering/contact-resources'
import { getClient } from '@hcengineering/presentation'
import { EmptyMarkup } from '@hcengineering/text-core'
import { getDocTitle } from '@hcengineering/view-resources'
import { get } from 'svelte/store'

import { getDmName } from '../utils'
import type { SearchResultRow } from './types'

async function directNames (docs: SearchResultDoc[]): Promise<Map<Ref<Space>, string>> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const ids = Array.from(
    new Set(
      docs
        .filter(
          (d) =>
            d.doc.attachedToClass !== undefined &&
            hierarchy.isDerived(d.doc.attachedToClass, chunter.class.DirectMessage)
        )
        .map((d) => d.doc.space)
        .filter(notEmpty)
    )
  )
  if (ids.length === 0) return new Map()

  const directs = await client.findAll<DirectMessage>(chunter.class.DirectMessage, { _id: { $in: ids as any } })
  const names = new Map<Ref<Space>, string>()
  for (const direct of directs) {
    names.set(direct._id, await getDmName(client, direct))
  }
  return names
}

// Where a message lives: the doc a thread started on for a reply, the doc it hangs off otherwise.
function placeOf (d: SearchResultDoc): { _id: Ref<Doc>, _class: Ref<Class<Doc>> } | undefined {
  const _id = d.doc.objectId ?? d.doc.attachedTo
  const _class = d.doc.objectClass ?? d.doc.attachedToClass
  return _id != null && _class != null ? { _id, _class } : undefined
}

function placesOf (
  docs: SearchResultDoc[],
  match: (_class: Ref<Class<Doc>>) => boolean
): Map<Ref<Class<Doc>>, Array<Ref<Doc>>> {
  const hierarchy = getClient().getHierarchy()
  const byClass = new Map<Ref<Class<Doc>>, Set<Ref<Doc>>>()
  for (const d of docs) {
    const place = placeOf(d)
    if (place === undefined || !hierarchy.hasClass(place._class) || !match(place._class)) continue
    byClass.set(place._class, (byClass.get(place._class) ?? new Set()).add(place._id))
  }
  return new Map(Array.from(byClass.entries()).map(([c, ids]) => [c, Array.from(ids)]))
}

async function attachedPersons (docs: SearchResultDoc[]): Promise<Map<Ref<Person>, Person>> {
  const hierarchy = getClient().getHierarchy()

  const ids = Array.from(placesOf(docs, (c) => hierarchy.isDerived(c, contact.class.Person)).values()).flat() as Array<
    Ref<Person>
  >
  if (ids.length === 0) return new Map()

  const employees = get(employeeByIdStore)
  const result = new Map<Ref<Person>, Person>()
  const missing: Array<Ref<Person>> = []
  for (const id of ids) {
    const employee = employees.get(id as Ref<Employee>)
    if (employee !== undefined) result.set(id, employee)
    else missing.push(id)
  }
  if (missing.length === 0) return result

  for (const [id, person] of await getPersonsByPersonRefs(missing)) {
    result.set(id, person)
  }
  return result
}

// A message's index title names its space, which is right for a chat but reads as the drive, the
// project or "Contacts" for a file, an issue or a person card; those take their own title instead.
async function placeTitles (docs: SearchResultDoc[]): Promise<Map<Ref<Doc>, string>> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const byClass = placesOf(
    docs,
    (c) => !hierarchy.isDerived(c, chunter.class.ChunterSpace) && !hierarchy.isDerived(c, contact.class.Person)
  )

  const titles = new Map<Ref<Doc>, string>()
  await Promise.all(
    Array.from(byClass.entries()).map(async ([_class, ids]) => {
      try {
        const found = await client.findAll(_class, { _id: { $in: ids } })
        for (const doc of found) {
          const title = await getDocTitle(client, doc._id, _class, doc)
          if (title !== undefined && title !== '') titles.set(doc._id, title)
        }
      } catch (err: any) {
        // Keep the index title for these
      }
    })
  )
  return titles
}

export async function hydrateResults (docs: SearchResultDoc[]): Promise<SearchResultRow[]> {
  const personIds = Array.from(new Set(docs.map((d) => d.doc.createdBy).filter(notEmpty)))

  const persons = personIds.length > 0 ? await getPersonsByPersonIds(personIds) : new Map()
  const [directs, cards, titles] = await Promise.all([directNames(docs), attachedPersons(docs), placeTitles(docs)])

  return docs
    .map((d) => {
      const directName = d.doc.space !== undefined ? directs.get(d.doc.space) : undefined

      if (d.doc.attachedTo == null || d.doc.attachedToClass == null) return undefined

      const place = placeOf(d)
      const attachedPerson = place !== undefined ? cards.get(place._id as Ref<Person>) : undefined
      const placeTitle = place !== undefined ? titles.get(place._id) : undefined

      return {
        _id: d.id as Ref<ChatMessage>,
        _class: d.doc._class as Ref<Class<ChatMessage>>,
        channel:
          directName ??
          (attachedPerson !== undefined ? formatName(attachedPerson.name) : undefined) ??
          placeTitle ??
          d.shortTitle ??
          '',
        createdOn: d.doc.createdOn ?? 0,
        attachedTo: d.doc.attachedTo,
        attachedToClass: d.doc.attachedToClass,
        highlights: (d.highlights?.content ?? []).map((f) => f.trim()).filter((f) => f !== ''),
        markup: d.fields?.message ?? EmptyMarkup,
        person: persons.get(d.doc.createdBy),
        attachedPerson,
        raw: d
      }
    })
    .filter(notEmpty)
}
