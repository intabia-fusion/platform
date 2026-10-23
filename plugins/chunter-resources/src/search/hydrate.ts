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
import { Class, type Doc, notEmpty, Ref, SearchResultDoc } from '@hcengineering/core'
import contact, { formatName, type Employee, type Person } from '@hcengineering/contact'
import { employeeByIdStore, getPersonsByPersonRefs } from '@hcengineering/contact-resources'
import { getClient } from '@hcengineering/presentation'
import { EmptyMarkup } from '@hcengineering/text-core'
import { getDocTitle } from '@hcengineering/view-resources'
import { get } from 'svelte/store'

import { getDmName } from '../utils'
import { authorOf, isThreadClass, personsOf, trimmed } from './rows'
import type { SearchResultRow } from './types'

function placeOf (d: SearchResultDoc): { _id: Ref<Doc>, _class: Ref<Class<Doc>> } | undefined {
  const _id = d.doc.rootObject ?? d.doc.objectId ?? d.doc.attachedTo
  const _class = d.doc.rootObjectClass ?? d.doc.objectClass ?? d.doc.attachedToClass
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

async function directNames (docs: SearchResultDoc[]): Promise<Map<Ref<Doc>, string>> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const ids = Array.from(placesOf(docs, (c) => hierarchy.isDerived(c, chunter.class.DirectMessage)).values()).flat()
  if (ids.length === 0) return new Map()

  const directs = await client.findAll<DirectMessage>(chunter.class.DirectMessage, {
    _id: { $in: ids as Array<Ref<DirectMessage>> }
  })
  const names = new Map<Ref<Doc>, string>()
  for (const direct of directs) {
    names.set(direct._id, await getDmName(client, direct))
  }
  return names
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

// The index title names the space: wrong for files, issues and person cards, which take their own title.
async function placeTitles (docs: SearchResultDoc[]): Promise<Map<Ref<Doc>, string>> {
  const client = getClient()
  const hierarchy = client.getHierarchy()

  const byClass = placesOf(
    docs,
    (c) => !hierarchy.isDerived(c, chunter.class.DirectMessage) && !hierarchy.isDerived(c, contact.class.Person)
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

export interface PlaceInfo {
  channel: string
  attachedPerson?: Person
}

export async function hydratePlaces (docs: SearchResultDoc[]): Promise<(d: SearchResultDoc) => PlaceInfo> {
  const [directs, cards, titles] = await Promise.all([directNames(docs), attachedPersons(docs), placeTitles(docs)])

  return (d) => {
    const place = placeOf(d)
    if (place === undefined) return { channel: d.shortTitle ?? '' }

    const attachedPerson = cards.get(place._id as Ref<Person>)
    const channel =
      directs.get(place._id) ??
      (attachedPerson !== undefined ? formatName(attachedPerson.name) : undefined) ??
      titles.get(place._id) ??
      d.shortTitle ??
      ''
    return { channel, attachedPerson }
  }
}

export async function hydrateResults (docs: SearchResultDoc[]): Promise<SearchResultRow[]> {
  const [persons, placeInfo] = await Promise.all([personsOf(docs), hydratePlaces(docs)])
  const hierarchy = getClient().getHierarchy()

  return docs
    .map((d) => {
      if (d.doc.attachedTo == null || d.doc.attachedToClass == null) return undefined

      const { channel, attachedPerson } = placeInfo(d)

      return {
        _id: d.id as Ref<ChatMessage>,
        _class: d.doc._class as Ref<Class<ChatMessage>>,
        channel,
        createdOn: d.doc.createdOn ?? 0,
        attachedTo: d.doc.attachedTo,
        attachedToClass: d.doc.attachedToClass,
        thread: isThreadClass(hierarchy, d.doc._class),
        highlights: trimmed(d.highlights?.content),
        markup: d.fields?.message ?? EmptyMarkup,
        person: authorOf(d, persons),
        attachedPerson,
        raw: d
      }
    })
    .filter(notEmpty)
}
