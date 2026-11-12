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
//
// Creating a permanent meeting writes two documents: the series that puts the meeting into the
// schedule and the always-open room itself. Both live here rather than in `utils.ts` so the pair can
// be exercised without a browser: everything environment-shaped (who I am, which calendar, which
// time zone) arrives in `ScheduleContext`.
//

import calendar, {
  AccessLevel,
  generateEventId,
  getPrimaryCalendar,
  type Calendar,
  type Event,
  type ReccuringEvent
} from '@hcengineering/calendar'
import core, {
  generateId,
  getCurrentAccount,
  type AccountUuid,
  type Client,
  type PersonId,
  type Ref,
  type Space,
  type TxOperations
} from '@hcengineering/core'
import {
  defaultMeetingAccess,
  type MeetingEventLink,
  type PermanentMeeting,
  type RoomLanguage,
  RoomType
} from '@hcengineering/love'
import contact, { type Person } from '@hcengineering/contact'
import { periodRules } from './period'
import love from './plugin'

/** Everything the two writers below cannot know on their own: the caller's identity and defaults. */
export interface ScheduleContext {
  calendarId: Ref<Calendar>
  space: Ref<Space>
  timeZone: string
  me: AccountUuid
  primarySocialId: PersonId
  /** Language of the meeting itself: it has no room to inherit it from any more. */
  language: string
  /** Applied only when the input carries a password; a session-less meeting needs the service call. */
  setGuestPassword: (meeting: Ref<PermanentMeeting>, password: string | null) => Promise<void>
}

export interface PermanentMeetingInput {
  name: string
  startDate: number
  duration: number
  /** Repeat period in msec; absent creates a one-off meeting. */
  period?: number
  endDate?: number
  members: AccountUuid[]
  reminderBefore: number
  /** Plain-text guest password to set, '' to leave it as is, null to remove. */
  guestPassword?: string | null
}

export async function findPrimaryCalendarId (client: Client): Promise<Ref<Calendar> | undefined> {  const acc = getCurrentAccount()
  const calendars = await client.findAll(calendar.class.Calendar, {
    user: acc.primarySocialId,
    hidden: false,
    access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
  })
  const preference = await client.findOne(calendar.class.PrimaryCalendar, {})
  return calendars.length > 0 ? getPrimaryCalendar(calendars, preference, acc.uuid) : undefined
}

// A permanent meeting is always open: it is created without a series, and `repeatEvery` only
// records how often the team intends to hold it, so the panel can show the period.
/**
 * Participants with every owner kept in the list. The server pushes a missing owner back anyway
 * (`OnPermanentMeetingUpdate`), so a form that shows them gone would lie until the next refresh.
 */
export function withOwners (members: AccountUuid[], owners: AccountUuid[]): AccountUuid[] {
  const missing = owners.filter((it) => !members.includes(it))
  return missing.length > 0 ? [...missing, ...members] : members
}

/**
 * The people of the meeting as event participants.
 *
 * The series is a calendar event, and the calendar keeps a copy of an event in the calendar of every
 * participant, propagating the master's changes to those copies. Without this list a member of the
 * meeting has no series in their own planner at all, and a rename made by the organiser never
 * reaches them - the two see different names for the same meeting.
 */
async function participantsOf (client: Client, members: AccountUuid[]): Promise<Array<Ref<Person>>> {
  if (members.length === 0) return []
  const persons = await client.findAll(contact.class.Person, { personUuid: { $in: members } })
  return persons.map((it) => it._id)
}

export async function createPermanentMeeting (
  client: TxOperations,
  data: {
    name: string
    type: RoomType.Video | RoomType.Audio
    language: string
    startWithRecording: boolean
    startWithTranscription: boolean
    members: AccountUuid[]
    owners: AccountUuid[]
    repeatEvery?: number
    reminderBefore?: number
  }
): Promise<Ref<PermanentMeeting>> {
  return await client.createDoc(love.class.PermanentMeeting, core.space.Space, {
    name: data.name,
    type: data.type,
    language: data.language as any,
    startWithRecording: data.startWithRecording,
    startWithTranscription: data.startWithTranscription,
    private: true,
    members: data.members,
    owners: data.owners,
    archived: false,
    description: '',
    descriptionRef: null,
    repeatEvery: data.repeatEvery,
    reminderBefore: data.reminderBefore,
    // A permanent meeting is an always-open room: whoever holds the link may open a session,
    // outside any occurrence. The default `start: 'members'` made a guest wait for a participant
    // to start the meeting, which for this kind of meeting is exactly what the link should avoid.
    meetingAccess: { ...defaultMeetingAccess, start: 'link' as const }
  })
}

/**
 * Creating a permanent meeting means two documents: the series that puts the meeting into the
 * schedule, and the meeting itself, which stays open between occurrences. It is a standalone
 * entity: it belongs to no office room, so the session of such a meeting runs in the service room
 * and the media settings below are defaults rather than something inherited from a room.
 */
export async function createPermanentMeetingWithSchedule (
  client: TxOperations,
  input: PermanentMeetingInput,
  ctx: ScheduleContext
): Promise<{ eventId: string, meeting: Ref<PermanentMeeting> }> {
  const type = RoomType.Video
  const language = ctx.language as RoomLanguage
  const startWithRecording = false
  const startWithTranscription = false

  const rules = input.period !== undefined ? periodRules(input.startDate, input.period) : []
  if (rules.length > 0 && input.endDate !== undefined) rules[0] = { ...rules[0], endDate: input.endDate }

  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]
  const participants = await participantsOf(client, members)
  const eventId = generateEventId()
  const dueDate = input.startDate + input.duration
  const eventIdRef = generateId<Event>()

  const common = {
    calendar: ctx.calendarId,
    eventId,
    date: input.startDate,
    dueDate,
    title: input.name,
    description: '',
    participants,
    externalParticipants: [],
    reminders: [input.reminderBefore],
    visibility: 'private' as const,
    blockTime: true,
    allDay: false,
    timeZone: ctx.timeZone,
    access: AccessLevel.Owner,
    user: ctx.primarySocialId
  }

  if (rules.length > 0) {
    await client.addCollection(
      calendar.class.ReccuringEvent,
      ctx.space,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      {
        ...common,
        rules,
        rdate: [],
        exdate: [],
        originalStartTime: input.startDate
      },
      eventIdRef as Ref<ReccuringEvent>
    )
  } else {
    await client.addCollection(
      calendar.class.Event,
      ctx.space,
      calendar.ids.NoAttached,
      calendar.class.Event,
      'events',
      common,
      eventIdRef
    )
  }

  await client.createMixin<Event, MeetingEventLink>(
    eventIdRef,
    calendar.class.Event,
    ctx.space,
    love.mixin.MeetingEventLink,
    {
      type,
      linkVersion: 1,
      meetingAccess: defaultMeetingAccess,
      private: false,
      language,
      startWithRecording,
      startWithTranscription,
      reminderBefore: input.reminderBefore
    }
  )

  const meeting = await createPermanentMeeting(client, {
    name: input.name,
    type,
    language,
    startWithRecording,
    startWithTranscription,
    members,
    owners: [ctx.me],
    repeatEvery: input.period,
    reminderBefore: input.reminderBefore
  })

  await client.updateMixin(eventIdRef, calendar.class.Event, ctx.space, love.mixin.MeetingEventLink, {
    permanentMeeting: meeting
  })

  if (input.guestPassword !== undefined && input.guestPassword !== null) {
    await ctx.setGuestPassword(meeting, input.guestPassword)
  }

  return { eventId, meeting }
}

/**
 * Saving the settings window of an existing meeting: the meeting itself, its series and the guest
 * password. The series is found by the back-reference on the mixin, so a meeting created before the
 * link existed simply updates without one.
 */
export async function updatePermanentMeetingWithSchedule (
  client: TxOperations,
  object: PermanentMeeting,
  input: PermanentMeetingInput,
  ctx: ScheduleContext
): Promise<void> {
  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]

  await client.update(object, {
    name: input.name,
    members,
    reminderBefore: input.reminderBefore,
    repeatEvery: input.period
  })

  const rules = input.period !== undefined ? periodRules(input.startDate, input.period) : []
  if (rules.length > 0 && input.endDate !== undefined) rules[0] = { ...rules[0], endDate: input.endDate }

  const participants = await participantsOf(client, members)
  const series = await client.findAll(calendar.class.Event, {
    [`${love.mixin.MeetingEventLink as string}.permanentMeeting`]: object._id
  } as any)
  for (const event of series) {
    const update: Record<string, any> = {
      title: input.name,
      date: input.startDate,
      dueDate: input.startDate + input.duration,
      participants
    }
    if (rules.length > 0) update.rules = rules
    await client.update(event, update as any)
    await client.updateMixin(event._id, event._class, event.space, love.mixin.MeetingEventLink, {
      reminderBefore: input.reminderBefore
    })
  }

  if (input.guestPassword !== undefined) {
    await ctx.setGuestPassword(object._id, input.guestPassword)
  }
}
