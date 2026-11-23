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
  type MeetingGroup,
  type PermanentMeeting,
  type Room,
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
  /** Free text of the event; a permanent meeting keeps the rich description on its own document. */
  description?: string
  /** The fields pick whole days: the series covers the day, and the time of the fields is ignored. */
  allDay?: boolean
  /** Zone the user picked; absent falls back to the caller's own. */
  timeZone?: string
  /** Office room the session runs in. Only a one-off meeting has one. */
  room?: Ref<Room>
  /** Repeat period in msec; absent creates a one-off meeting. */
  period?: number
  endDate?: number
  members: AccountUuid[]
  /** Lead time of the single reminder; the smallest of `reminders` when the list is set. */
  reminderBefore: number
  /** Every lead time the user asked for. The calendar keeps a list, the meeting one value. */
  reminders?: number[]
  /** Plain-text guest password to set, '' to leave it as is, null to remove. */
  guestPassword?: string | null
  /** Group the meeting is created in, when the dialog was opened from a group header. */
  group?: Ref<MeetingGroup>
  /**
   * Put the meeting into the calendar and the planner as a series. Defaults to true; only the
   * "new meeting" dialog of the permanent meetings list can pass false.
   */
  calendar?: boolean
}

export async function findPrimaryCalendarId (client: Client): Promise<Ref<Calendar> | undefined> {
  const acc = getCurrentAccount()
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
    group?: Ref<MeetingGroup>
    startDate?: number
    timeZone?: string
    calendar?: boolean
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
    // The schedule kept on the meeting itself: the "next meeting" column falls back to it when
    // there is no series to ask (a meeting that is only a link).
    startDate: data.startDate,
    timeZone: data.timeZone,
    // Only the explicit "no calendar" is stored: a missing flag means the meeting has its series.
    ...(data.calendar === false ? { calendar: false } : {}),
    // Only when the dialog was opened from a group header: absent stays absent, not null.
    ...(data.group !== undefined ? { group: data.group } : {}),
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
  // The zone belongs to the meeting, not to the person creating it: a series made for a colleague in
  // another city keeps the zone the dialog showed.
  const timeZone = input.timeZone ?? ctx.timeZone
  const allDay = input.allDay === true
  // A meeting may exist only as a link and a row in the list: then it gets no series, and nothing
  // but the meeting itself says when it should be held.
  const inCalendar = input.calendar !== false

  const rules = input.period !== undefined ? periodRules(input.startDate, input.period) : []
  if (rules.length > 0 && input.endDate !== undefined) rules[0] = { ...rules[0], endDate: input.endDate }

  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]

  let eventId = ''
  const eventIdRef = generateId<Event>()
  if (inCalendar) {
    const participants = await participantsOf(client, members)
    eventId = generateEventId()
    const dueDate = allDay ? new Date(input.startDate).setHours(23, 59, 59, 999) : input.startDate + input.duration

    const common = {
      calendar: ctx.calendarId,
      eventId,
      date: input.startDate,
      dueDate,
      title: input.name,
      description: input.description ?? '',
      participants,
      externalParticipants: [],
      reminders: input.reminders ?? [input.reminderBefore],
      visibility: 'private' as const,
      blockTime: true,
      allDay,
      timeZone,
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
  }

  const meeting = await createPermanentMeeting(client, {
    name: input.name,
    type,
    language,
    startWithRecording,
    startWithTranscription,
    members,
    owners: [ctx.me],
    repeatEvery: input.period,
    reminderBefore: input.reminderBefore,
    group: input.group,
    startDate: input.startDate,
    timeZone,
    calendar: inCalendar
  })

  if (inCalendar) {
    await client.updateMixin(eventIdRef, calendar.class.Event, ctx.space, love.mixin.MeetingEventLink, {
      permanentMeeting: meeting
    })
  }

  if (input.guestPassword !== undefined && input.guestPassword !== null) {
    await ctx.setGuestPassword(meeting, input.guestPassword)
  }

  // No series: there is no event to report, only the meeting the dialog opens the link for.
  return { eventId, meeting }
}

/**
 * The meeting mixin on the master event: where the session runs, who may start it and how the media
 * starts. Shared by the calendar form (through `createMeeting`) and the one-off writer below, so a
 * meeting made here and one made from the calendar differ in nothing but the fields the form offers.
 */
export async function attachMeetingLink (
  client: TxOperations,
  master: Event,
  options: { room?: Ref<Room>, language: string, reminderBefore: number }
): Promise<void> {
  // The room, when picked, decides the type, the language and the media the session starts with, the
  // way a meeting held in a room always has. No room means the workspace service room.
  const room = options.room !== undefined ? await client.findOne(love.class.Room, { _id: options.room }) : undefined
  await client.createMixin<Event, MeetingEventLink>(
    master._id,
    master._class,
    master.space,
    love.mixin.MeetingEventLink,
    {
      type: room?.type === RoomType.Audio ? RoomType.Audio : RoomType.Video,
      room: room?._id,
      linkVersion: 1,
      meetingAccess: defaultMeetingAccess,
      private: room?.startPrivate ?? false,
      language: (room?.language ?? options.language) as RoomLanguage,
      startWithRecording: room?.startWithRecording ?? false,
      startWithTranscription: room?.startWithTranscription ?? false,
      reminderBefore: options.reminderBefore
    }
  )
}

/**
 * A one-off meeting is a calendar event with the meeting mixin and nothing else: no `PermanentMeeting`
 * document, so it never shows up in the permanent meetings list. The room picked in the form decides
 * where the session runs and which media settings it starts with, exactly as a calendar meeting does.
 */
export async function createOneOffMeeting (
  client: TxOperations,
  input: PermanentMeetingInput,
  ctx: ScheduleContext
): Promise<{ eventId: string }> {
  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]
  const participants = await participantsOf(client, members)
  const timeZone = input.timeZone ?? ctx.timeZone
  const allDay = input.allDay === true
  const eventId = generateEventId()
  const eventRef = generateId<Event>()

  await client.addCollection(
    calendar.class.Event,
    ctx.space,
    calendar.ids.NoAttached,
    calendar.class.Event,
    'events',
    {
      calendar: ctx.calendarId,
      eventId,
      date: input.startDate,
      dueDate: allDay ? new Date(input.startDate).setHours(23, 59, 59, 999) : input.startDate + input.duration,
      title: input.name,
      description: input.description ?? '',
      participants,
      externalParticipants: [],
      reminders: input.reminders ?? [input.reminderBefore],
      visibility: 'private' as const,
      blockTime: true,
      allDay,
      timeZone,
      access: AccessLevel.Owner,
      user: ctx.primarySocialId
    },
    eventRef
  )

  // The mixin is written by the same function the calendar form uses, so a meeting made here and one
  // made from the calendar differ in nothing but the fields this dialog offers.
  const master = await client.findOne(calendar.class.Event, { _id: eventRef })
  if (master !== undefined) {
    await attachMeetingLink(client, master, {
      room: input.room,
      language: ctx.language,
      reminderBefore: input.reminderBefore
    })
  }

  return { eventId }
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
  const timeZone = input.timeZone ?? ctx.timeZone
  const allDay = input.allDay === true

  await client.update(object, {
    name: input.name,
    members,
    reminderBefore: input.reminderBefore,
    repeatEvery: input.period,
    // Kept in step with the series: a meeting without one reads its schedule from here.
    startDate: input.startDate,
    timeZone
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
      dueDate: allDay ? new Date(input.startDate).setHours(23, 59, 59, 999) : input.startDate + input.duration,
      allDay,
      timeZone,
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
