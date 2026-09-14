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
import { Class, notEmpty, Ref, SearchResultDoc, Space } from '@hcengineering/core'
import { getPersonsByPersonIds } from '@hcengineering/contact-resources'
import { getClient } from '@hcengineering/presentation'
import { EmptyMarkup } from '@hcengineering/text-core'

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

export async function hydrateResults (docs: SearchResultDoc[]): Promise<SearchResultRow[]> {
  const personIds = Array.from(
    new Set(docs.map((d) => d.doc.createdBy).filter(notEmpty)
    ))

  const persons = personIds.length > 0 ? await getPersonsByPersonIds(personIds) : new Map()
  const directs = await directNames(docs)

  return docs.map((d) => {
    const directName = d.doc.space !== undefined ? directs.get(d.doc.space) : undefined

    if (d.doc.attachedTo == null || d.doc.attachedToClass == null) return undefined

    return {
      _id: d.id as Ref<ChatMessage>,
      _class: d.doc._class as Ref<Class<ChatMessage>>,
      channel: directName ?? d.shortTitle ?? '',
      createdOn: d.doc.createdOn ?? 0,
      attachedTo: d.doc.attachedTo,
      attachedToClass: d.doc.attachedToClass,
      highlights: (d.highlights?.content ?? []).map((f) => f.trim()).filter((f) => f !== ''),
      markup: d.fields?.message ?? EmptyMarkup,
      person: persons.get(d.doc.createdBy),
      raw: d
    }
  }).filter(notEmpty)
}
