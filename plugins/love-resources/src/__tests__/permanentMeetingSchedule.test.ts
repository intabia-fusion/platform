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

import calendar, { type Calendar, type ReccuringEvent } from '@hcengineering/calendar'
import type { AccountUuid, PersonId, Ref, Space, TxOperations } from '@hcengineering/core'
import love, { type PermanentMeeting } from '@hcengineering/love'
import {
  createPermanentMeetingWithSchedule,
  updatePermanentMeetingWithSchedule,
  type PermanentMeetingInput,
  type ScheduleContext
} from '../permanentMeetingSchedule'
import { periodRules } from '../period'

const me = 'account:me' as AccountUuid
const other = 'account:other' as AccountUuid
const calendarId = 'calendar:1' as Ref<Calendar>
const space = 'space:1' as Ref<Space>
const meetingId = 'permanent:new' as Ref<PermanentMeeting>

interface Recorded {
  method: string
  // Everything the writer passes, positional: the assertions below read it by index.
  args: any[]
}

function createFakeClient (): { client: TxOperations, calls: Recorded[] } {
  const calls: Recorded[] = []
  const client = {
    findOne: async (cls: any, query: any) => {
      calls.push({ method: 'findOne', args: [cls, query] })
      return undefined
    },
    findAll: async (cls: any, query: any) => {
      calls.push({ method: 'findAll', args: [cls, query] })
      return []
    },
    addCollection: async (...args: any[]) => {
      calls.push({ method: 'addCollection', args })
      return args[6]
    },
    createMixin: async (...args: any[]) => {
      calls.push({ method: 'createMixin', args })
      return undefined
    },
    updateMixin: async (...args: any[]) => {
      calls.push({ method: 'updateMixin', args })
      return undefined
    },
    createDoc: async (...args: any[]) => {
      calls.push({ method: 'createDoc', args })
      return meetingId
    },
    update: async (...args: any[]) => {
      calls.push({ method: 'update', args })
      return undefined
    }
  } as unknown as TxOperations
  return { client, calls }
}

function createContext (setGuestPassword = jest.fn(async () => {})): ScheduleContext {
  return {
    calendarId,
    space,
    timeZone: 'Europe/Moscow',
    me,
    primarySocialId: 'social:me' as PersonId,
    language: 'ru',
    setGuestPassword
  }
}

const WEEK = 7 * 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const startDate = new Date('2026-11-10T09:00:00Z').getTime()

function input (opts?: Partial<PermanentMeetingInput>): PermanentMeetingInput {
  return {
    name: 'Daily standup',
    startDate,
    duration: HOUR,
    period: WEEK,
    members: [other],
    reminderBefore: 15 * 60 * 1000,
    ...opts
  }
}

function find (calls: Recorded[], method: string): Recorded[] {
  return calls.filter((it) => it.method === method)
}

describe('createPermanentMeetingWithSchedule', () => {
  it('creates the series and the meeting, and links them both ways', async () => {
    const { client, calls } = createFakeClient()

    const result = await createPermanentMeetingWithSchedule(client, input(), createContext())

    const series = find(calls, 'addCollection')
    expect(series).toHaveLength(1)
    expect(series[0].args[0]).toBe(calendar.class.ReccuringEvent)
    expect(series[0].args[5].rules).toEqual(periodRules(startDate, WEEK))
    expect(series[0].args[5].date).toBe(startDate)
    expect(series[0].args[5].dueDate).toBe(startDate + HOUR)

    const meeting = find(calls, 'createDoc')
    expect(meeting).toHaveLength(1)
    expect(meeting[0].args[0]).toBe(love.class.PermanentMeeting)
    // The period is stored on the meeting as well: the panel shows it without reading the series.
    expect(meeting[0].args[2].repeatEvery).toBe(WEEK)
    expect(meeting[0].args[2].reminderBefore).toBe(15 * 60 * 1000)
    // The creator is always a member, even when the form did not include them.
    expect(meeting[0].args[2].members).toEqual([me, other])

    const mixin = find(calls, 'createMixin')
    expect(mixin).toHaveLength(1)
    expect(mixin[0].args[3]).toBe(love.mixin.MeetingEventLink)

    // The back-reference is what a later settings save uses to find the series.
    const back = find(calls, 'updateMixin')
    expect(back).toHaveLength(1)
    expect(back[0].args[3]).toBe(love.mixin.MeetingEventLink)
    expect(back[0].args[4]).toEqual({ permanentMeeting: meetingId })

    expect(result.meeting).toBe(meetingId)
  })

  it('creates a one-off event when no period is given', async () => {
    const { client, calls } = createFakeClient()

    await createPermanentMeetingWithSchedule(client, input({ period: undefined }), createContext())

    const series = find(calls, 'addCollection')
    expect(series[0].args[0]).toBe(calendar.class.Event)
    expect(series[0].args[5].rules).toBeUndefined()
    expect(find(calls, 'createDoc')[0].args[2].repeatEvery).toBeUndefined()
  })

  it('caps the rule with the end of the recurrence', async () => {
    const { client, calls } = createFakeClient()
    const endDate = startDate + 4 * WEEK

    await createPermanentMeetingWithSchedule(client, input({ endDate }), createContext())

    const rules = find(calls, 'addCollection')[0].args[5].rules as ReccuringEvent['rules']
    expect(rules[0].endDate).toBe(endDate)
  })

  it('sets the guest password through the meeting service', async () => {
    const setGuestPassword = jest.fn(async () => {})
    const { client } = createFakeClient()

    await createPermanentMeetingWithSchedule(client, input({ guestPassword: 'secret' }), createContext(setGuestPassword))

    expect(setGuestPassword).toHaveBeenCalledWith(meetingId, 'secret')
  })

  it('keeps the meeting standalone: no room is read and the language comes from the caller', async () => {
    const { client, calls } = createFakeClient()

    await createPermanentMeetingWithSchedule(client, input(), createContext())

    expect(find(calls, 'findOne')).toHaveLength(0)
    expect(find(calls, 'createMixin')[0].args[4]).toMatchObject({ language: 'ru', private: false })
  })
})

describe('updatePermanentMeetingWithSchedule', () => {
  it('updates the meeting itself and every series pointing at it', async () => {
    const { client, calls } = createFakeClient()
    // The fake `findAll` returns the series the back-reference points at.
    const meeting = { _id: meetingId, name: 'Old name' } as PermanentMeeting

    await updatePermanentMeetingWithSchedule(client, meeting, input({ name: 'New name' }), createContext())

    const updates = find(calls, 'update')
    expect(updates[0].args[0]).toBe(meeting)
    expect(updates[0].args[1]).toMatchObject({ name: 'New name', repeatEvery: WEEK })
    // Nothing else to update: the fake client answers `findAll` with an empty list.
    expect(updates).toHaveLength(1)
  })
})
