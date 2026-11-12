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

import calendar, { type Event, type ReccuringInstance } from '@hcengineering/calendar'
import { type Class, type Client, type Doc, type DocumentQuery, type Ref } from '@hcengineering/core'
import type { AnyComponent } from '@hcengineering/ui'
import view, { type ObjectEditor } from '@hcengineering/view'

/** The card an event is opened with: the document to open, and the editor the mixin contributed. */
export interface EventCard {
  object: Doc
  /** Absent when a plugin resolver named the document: the owner of the document knows its panel. */
  editor?: AnyComponent
}

/**
 * A plugin's answer to "which document should this event open as".
 *
 * Some events are only a projection of a document that lives elsewhere - a meeting series, for one,
 * belongs to a meeting that is a document of its own. The calendar cannot know that mapping, so a
 * plugin that defines such a document registers it here. Resolvers run before the mixin lookup and
 * the first answer wins; `undefined` leaves the event to the calendar.
 */
export type EventCardResolver = (client: Client, event: Doc) => Promise<Doc | undefined>

const resolvers: EventCardResolver[] = []

export function registerEventCardResolver (resolver: EventCardResolver): void {
  resolvers.push(resolver)
}

/**
 * The card a calendar event should be opened with, or `undefined` to leave the event to the
 * calendar's quick-edit popup.
 *
 * A meeting is opened as its own document: the popup edits the occurrence, while the title, rules
 * and participants live on the series. Three things stand in the way of a plain lookup, and all are
 * handled here. The calendar's query returns bare events and `Hierarchy.mixinOrClass` - what the
 * panel and `openDoc` use to pick a card - reads a mixin proxy, so the mixin is found explicitly
 * instead: on the object when the view queried the mixin itself, otherwise by a document lookup,
 * because a mixin is a document carrying the id of the document it extends. An occurrence carries no
 * mixin at all, only its master does, so the master id is looked up as well. And what gets opened is
 * the document the card belongs to, never the occurrence: the series is the identity of the meeting.
 */
export async function eventCard (
  client: Client,
  event: Doc,
  calendarEditor: AnyComponent
): Promise<EventCard | undefined> {
  for (const resolve of resolvers) {
    const object = await resolve(client, event)
    if (object !== undefined) return { object }
  }
  const hierarchy = client.getHierarchy()
  const editorOf = (mixin: Ref<Class<Doc>>): AnyComponent | undefined =>
    hierarchy.classHierarchyMixin<Doc, ObjectEditor>(mixin, view.mixin.ObjectEditor)?.editor

  const candidates = hierarchy
    .getAllPossibleMixins(event._class)
    .filter((mixin) => {
      const editor = editorOf(mixin)
      return editor !== undefined && editor !== calendarEditor
    })
  if (candidates.length === 0) return undefined

  // An occurrence is a `ReccuringInstance`: the mixin hangs off the master, and the master is the
  // document the card has to show.
  const seriesId = (event as ReccuringInstance).recurringEventId as unknown as Ref<Doc> | undefined
  const ids = seriesId === undefined ? [event._id] : [event._id, seriesId]

  let ownerId: Ref<Doc> | undefined
  let owner = candidates.find((it) => hierarchy.hasMixin(event, it))
  if (owner !== undefined) ownerId = event._id
  if (ownerId === undefined) {
    for (const mixin of candidates) {
      const found = await client.findOne(mixin as unknown as Ref<Class<Doc>>, {
        _id: { $in: ids }
      } as DocumentQuery<Doc>)
      if (found !== undefined) {
        owner = mixin
        ownerId = found._id
        break
      }
    }
  }
  if (owner === undefined || ownerId === undefined) return undefined
  const editor = editorOf(owner)
  if (ownerId === event._id) return { object: event, editor }

  // The mixin only knows which document it extends; the document itself is read from the event class.
  const master = await client.findOne(calendar.class.Event as unknown as Ref<Class<Event>>, {
    _id: ownerId
  } as DocumentQuery<Event>)
  return { object: master ?? event, editor }
}
