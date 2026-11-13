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

import type { Class, Client, Doc, Ref } from '@hcengineering/core'
import love from '@hcengineering/love'
import { findMeetingLink, forgetMeetingLink, seriesKeyOf } from '../meetingLink'

const meetingMixin = love.mixin.MeetingEventLink as unknown as Ref<Class<Doc>>

function event (extra: Record<string, unknown> = {}): Doc {
  return { _id: 'ev-1', _class: 'calendar:class:Event', space: 'space-1', eventId: 'E1', ...extra } as unknown as Doc
}

interface Fake {
  client: Client
  queries: number
}

function fakeClient (rows: Array<Record<string, unknown>>): Fake {
  let queries = 0
  const hierarchy = {
    hasMixin: (doc: Doc, mixin: string) => (doc as unknown as Record<string, unknown>)[mixin] !== undefined,
    as: (doc: Doc, mixin: string) => ({ ...doc, $__mixin: mixin })
  }
  const matches = (row: Record<string, unknown>, query: Record<string, unknown>): boolean =>
    Object.entries(query).every(([k, v]) => row[k] === v)
  const client = {
    getHierarchy: () => hierarchy,
    findOne: async (cls: string, query: Record<string, unknown>) => {
      if (cls !== meetingMixin) return undefined
      queries++
      return rows.find((r) => matches(r, query))
    }
  } as unknown as Client
  return {
    client,
    get queries () {
      return queries
    }
  } as Fake
}

describe('findMeetingLink', () => {
  // The cache lives in the module, so a negative answer from one test would hide the next one's.
  beforeEach(() => {
    forgetMeetingLink(event())
    forgetMeetingLink(event({ _id: 'ev-instance', recurringEventId: 'E1' }))
  })

  it('reads the link off the event when the view already queried the mixin', async () => {
    const fake = fakeClient([{ _id: 'ev-1', meetingAccess: { start: 'link' } }])
    const link = await findMeetingLink(fake.client, event({ [meetingMixin as string]: { meetingAccess: {} } }))

    expect(link).toBeDefined()
    // Nothing is asked of the server: the object carries the mixin.
    expect(fake.queries).toBe(0)
  })

  it('finds the mixin by the id of the event when the query returned a bare event', async () => {
    // This is the calendar's own case, and the reason the join button used to disappear. The mixin
    // document carries the id of the event it extends and its `eventId` alike.
    const fake = fakeClient([{ _id: 'ev-1', eventId: 'E1', permanentMeeting: 'pm-1' }])
    const link = await findMeetingLink(fake.client, event())

    expect(link?.permanentMeeting).toBe('pm-1')
  })

  it('reads the mixin of a document fetched by the mixin class, where it comes nested', async () => {
    // `client.findOne(mixinClass, ...)` hands back the document with the mixin under its id; reading
    // `permanentMeeting` off the document itself is what made a meeting look like a bare series.
    const fake = fakeClient([
      { _id: 'ev-1', eventId: 'E1', [meetingMixin as string]: { permanentMeeting: 'pm-1', linkId: 'abc' } }
    ])
    const link = await findMeetingLink(fake.client, event())

    expect(link?.permanentMeeting).toBe('pm-1')
    expect(link?.linkId).toBe('abc')
  })

  it('finds the mixin of the series behind an occurrence', async () => {
    const fake = fakeClient([{ _id: 'E1', eventId: 'E1', permanentMeeting: 'pm-1' }])
    const occurrence = event({ _id: 'ev-instance', _class: 'calendar:class:ReccuringInstance', recurringEventId: 'E1' })

    expect((await findMeetingLink(fake.client, occurrence))?.permanentMeeting).toBe('pm-1')
  })

  it('answers undefined for an event that is not a meeting', async () => {
    const fake = fakeClient([])
    expect(await findMeetingLink(fake.client, event())).toBeUndefined()
  })

  it('asks once per series, and again only after the negative answer expires', async () => {
    const fake = fakeClient([{ _id: 'ev-1', eventId: 'E1', permanentMeeting: 'pm-1' }])

    const first = await findMeetingLink(fake.client, event())
    const asked = fake.queries
    const second = await findMeetingLink(fake.client, event())

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    // One series, one resolution: tiles re-render far more often than a meeting changes.
    expect(asked).toBeGreaterThan(0)
    expect(fake.queries).toBe(asked)

    forgetMeetingLink(event())
    await findMeetingLink(fake.client, event())
    expect(fake.queries).toBeGreaterThan(asked)
  })

  it('names the series of an occurrence by its master', () => {
    expect(seriesKeyOf(event())).toBe('E1')
    expect(seriesKeyOf(event({ recurringEventId: 'E9' }))).toBe('E9')
  })
})
