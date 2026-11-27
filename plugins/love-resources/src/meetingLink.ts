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
// See the License for the specific language governing permissions and
// limitations under the License.
//

import calendar, { type Event, type ReccuringInstance } from '@hcengineering/calendar'
import type { Client, Doc } from '@hcengineering/core'
import love, { type MeetingEventLink } from '@hcengineering/love'

/**
 * Cached answers per series. A positive answer is kept for good (a meeting does not stop being one),
 * a negative one only for a few seconds: the mixin is added to an existing event when someone ticks
 * "Create meeting", and the tile in front of them has to grow its button without a reload.
 */
const known = new Map<string, { link?: MeetingEventLink, at: number }>()
const MISS_TTL_MS = 10_000

/** The series an event belongs to: an occurrence names its master, a master is its own series. */
export function seriesKeyOf (event: Event | Doc): string {
  const recurring = (event as ReccuringInstance).recurringEventId as unknown as string | undefined
  return recurring ?? ((event as Event).eventId as string) ?? event._id
}

/**
 * The mixin nested inside a document. Storage keeps a mixin on the row of the document it extends,
 * so a document fetched by the event class carries it under the mixin id - and a plain event carries
 * nothing, which is how a document tells whether it is a meeting at all.
 */
function nestedMixin (doc: Doc | undefined): MeetingEventLink | undefined {
  if (doc === undefined) return undefined
  const nested = (doc as unknown as Record<string, unknown>)[love.mixin.MeetingEventLink as unknown as string]
  if (nested === undefined || typeof nested !== 'object') return undefined
  return { ...(nested as unknown as Record<string, unknown>), _id: doc._id } as unknown as MeetingEventLink
}

/** A document fetched by the mixin class: either the mixin itself, or the event that carries it. */
function asMixin (doc: Doc | undefined): MeetingEventLink | undefined {
  if (doc === undefined) return undefined
  return nestedMixin(doc) ?? (doc as unknown as MeetingEventLink)
}

/**
 * The meeting link of an event, or `undefined` when the event is not a meeting.
 *
 * The calendar's queries return bare events - no mixin, and `Hierarchy.mixinOrClass` needs a proxy it
 * does not have here - so the link is read off the object only when it is there and from its mixin
 * document otherwise: the mixin carries both the id of the document it extends and its `eventId`, and
 * which of the two the caller holds depends on the view. An occurrence carries no mixin at all, only
 * its master does, hence the series key.
 */
export async function findMeetingLink (client: Client, event: Event | Doc): Promise<MeetingEventLink | undefined> {
  const hierarchy = client.getHierarchy()
  if (hierarchy.hasMixin(event, love.mixin.MeetingEventLink)) {
    return hierarchy.as<Event, MeetingEventLink>(event as Event, love.mixin.MeetingEventLink)
  }
  const key = seriesKeyOf(event)
  const cached = known.get(key)
  if (cached?.link !== undefined) return cached.link
  if (cached !== undefined && Date.now() - cached.at < MISS_TTL_MS) return undefined

  // The first two ask the mixin class, so their answer is the mixin; the last one asks the event and
  // only a mixin nested inside it counts - the event itself is not a meeting.
  const byId = asMixin(await client.findOne(love.mixin.MeetingEventLink, { _id: key as any }))
  const byEventId =
    byId ?? asMixin(await client.findOne(love.mixin.MeetingEventLink, { eventId: key as any }))
  // Last resort: the mixin lives on the event row itself, so its own document answers.
  const link = byEventId ?? nestedMixin(await client.findOne(calendar.class.Event as any, { eventId: key }))
  known.set(key, { link, at: Date.now() })
  return link
}

/** Forgets a memoized answer - a meeting that was created or deleted since the tile was drawn. */
export function forgetMeetingLink (event: Event | Doc): void {
  known.delete(seriesKeyOf(event))
}
