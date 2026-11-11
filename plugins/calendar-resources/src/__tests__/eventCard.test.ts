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

import type { Class, Client, Doc, Ref } from '@hcengineering/core'
import type { AnyComponent } from '@hcengineering/ui'
import { eventCard } from '../eventCard'

const calendarEditor = 'calendar:component:EditEvent' as unknown as AnyComponent
const meetingEditor = 'love:component:EditScheduledMeeting' as unknown as AnyComponent

const meetingMixin = 'love:mixin:MeetingEventLink' as Ref<Class<Doc>>
const plainMixin = 'other:mixin:Plain' as Ref<Class<Doc>>

function event (extra: Record<string, unknown> = {}): Doc {
  return { _id: 'event:1', _class: 'calendar:class:Event', space: 'space:1', ...extra } as unknown as Doc
}

function fakeClient (editors: Record<string, AnyComponent | undefined>, attached: string[]): Client {
  const hierarchy = {
    getAllPossibleMixins: () => [meetingMixin, plainMixin],
    classHierarchyMixin: (mixin: string) =>
      editors[mixin] !== undefined ? { _id: mixin, editor: editors[mixin] } : undefined,
    hasMixin: (doc: Doc, mixin: string) => (doc as unknown as Record<string, unknown>)[mixin] !== undefined
  }
  return {
    getHierarchy: () => hierarchy,
    findOne: async (cls: string) =>
      attached.includes(cls) ? { _id: 'event:1', _class: cls, attached: cls } : undefined
  } as unknown as Client
}

describe('eventCard', () => {
  it('opens an event that already carries a card mixin with that mixin editor', async () => {
    const client = fakeClient({ [meetingMixin]: meetingEditor }, [])
    const card = await eventCard(client, event({ [meetingMixin]: {} }), calendarEditor)
    expect(card?.editor).toBe(meetingEditor)
  })

  it('finds the mixin by a query when the event came without it', async () => {
    const client = fakeClient(
      { [meetingMixin]: meetingEditor, [plainMixin]: calendarEditor },
      [meetingMixin as string]
    )
    const card = await eventCard(client, event(), calendarEditor)
    expect(card?.editor).toBe(meetingEditor)
  })

  it('ignores a mixin that only repeats the calendar editor', async () => {
    // The calendar's own editor on a mixin means the popup is the right place to edit: nothing to open.
    const client = fakeClient({ [meetingMixin]: calendarEditor }, [meetingMixin as string])
    expect(await eventCard(client, event(), calendarEditor)).toBeUndefined()
  })

  it('leaves a plain event to the popup when no candidate is attached', async () => {
    const client = fakeClient({ [meetingMixin]: meetingEditor }, [])
    expect(await eventCard(client, event(), calendarEditor)).toBeUndefined()
  })

  it('asks nothing when the class has no mixin with an editor', async () => {
    const client = fakeClient({}, [meetingMixin as string])
    expect(await eventCard(client, event(), calendarEditor)).toBeUndefined()
  })
})
