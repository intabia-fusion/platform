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
import { descriptionMarkup } from './description'
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
  /**
   * Create the calendar series for the meeting. Only the planner grid passes true: a meeting made in
   * the meetings section stays out of the planner, whatever the calendar flag says.
   */
  series?: boolean
}

/**
 * The calendar that keeps the events of meetings made in the meetings section. It is the user's own
 * calendar, so the section's calendar view shows the meetings, but the Planner leaves it out: the
 * Planner shows only the events created in the Planner itself.
 */
export function meetingsCalendarId (me: AccountUuid): Ref<Calendar> {
  return `${me}_meetings_calendar` as Ref<Calendar>
}

/** Suffix of the meetings calendar id: the Planner recognises it without asking love. */
export const MEETINGS_CALENDAR_SUFFIX = '_meetings_calendar'

async function findOrCreateMeetingsCalendar (
  client: TxOperations,
  ctx: ScheduleContext
): Promise<Ref<Calendar>> {
  const id = meetingsCalendarId(ctx.me)
  const existing = await client.findOne(calendar.class.Calendar, { _id: id })
  if (existing !== undefined) return id
  await client.createDoc(
    calendar.class.Calendar,
    core.space.Space,
    {
      name: 'Meetings',
      hidden: false,
      // The Planner filters this calendar out by id, visibility plays no part in it.
      visibility: 'private',
      user: ctx.primarySocialId,
      access: AccessLevel.Owner
    },
    id
  )
  return id
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
    /** Length of a one-off meeting in ms: the series is what says it for a recurring one. */
    duration?: number
    /** Room of a one-off meeting: the session runs there, a permanent meeting owns no room. */
    room?: Ref<Room>
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
    duration: data.duration,
    ...(data.room !== undefined ? { room: data.room } : {}),
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
/**
 * The calendar side of a meeting: the series in the meetings calendar (the caller's own calendar when
 * the Planner asked for it) and the mixin that links it back to the meeting. Shared by the create and
 * the update paths, so turning "show in calendar" on later builds exactly the same event.
 */
async function createMeetingEvent (
  client: TxOperations,
  meeting: Ref<PermanentMeeting> | undefined,
  input: PermanentMeetingInput,
  ctx: ScheduleContext,
  planner: boolean
): Promise<{ eventId: string, eventRef: Ref<Event> }> {
  const type = RoomType.Video
  const language = ctx.language as RoomLanguage
  const timeZone = input.timeZone ?? ctx.timeZone
  const allDay = input.allDay === true
  const eventCalendar = planner ? ctx.calendarId : await findOrCreateMeetingsCalendar(client, ctx)

  const rules = input.period !== undefined ? periodRules(input.startDate, input.period) : []
  if (rules.length > 0 && input.endDate !== undefined) rules[0] = { ...rules[0], endDate: input.endDate }

  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]
  const participants = await participantsOf(client, members)
  const eventId = generateEventId()
  const dueDate = allDay ? new Date(input.startDate).setHours(23, 59, 59, 999) : input.startDate + input.duration
  const eventIdRef = generateId<Event>()

  const common = {
    calendar: eventCalendar,
    eventId,
    date: input.startDate,
    dueDate,
    title: input.name,
    description: descriptionMarkup(input.description ?? ''),
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
      startWithRecording: false,
      startWithTranscription: false,
      reminderBefore: input.reminderBefore,
      // The room is part of the meeting, not of the document only: the love service starts the
      // session in the room of this link, and the event card reads the room from it. A link without
      // a room made a meeting booked into a room run in the shared service room instead.
      ...(input.room !== undefined ? { room: input.room } : {}),
      // The meeting is known when the event is built for an existing meeting; on create the link is
      // written right after the document appears, as it always was.
      ...(meeting !== undefined ? { permanentMeeting: meeting } : {}),
      ...(planner ? { planner: true } : {})
    }
  )

  return { eventId, eventRef: eventIdRef }
}

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
  // The series is the planner's business: only its grid asks for one. A meeting from the section still
  // gets an event, but in the meetings calendar, so it shows in the section and stays out of the Planner.
  const series = input.series === true
  const inCalendar = input.calendar !== false
  const withEvent = series || inCalendar
  const members = input.members.includes(ctx.me) ? input.members : [ctx.me, ...input.members]

  let eventId = ''
  let eventRef: Ref<Event> | undefined
  if (withEvent) {
    const created = await createMeetingEvent(client, undefined, { ...input, members }, ctx, series)
    eventId = created.eventId
    eventRef = created.eventRef
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
    duration: input.duration,
    // The room matters for a one-off meeting: its session runs there. A permanent meeting owns no
    // room, so the field stays empty and the session uses the workspace service room.
    room: input.room,
    timeZone,
    calendar: input.calendar
  })

  // The event and the meeting point at each other: the planner grid and the meetings calendar both
  // reach the meeting through this link.
  if (withEvent && eventRef !== undefined) {
    await client.updateMixin(eventRef, calendar.class.Event, ctx.space, love.mixin.MeetingEventLink, {
      permanentMeeting: meeting
    })
    // The meeting remembers its own event: the row reads it to tell whether the meeting is in the
    // calendar, and the writer finds it without a query by the link mixin's nested field.
    await client.updateDoc(love.class.PermanentMeeting, core.space.Space, meeting, { event: eventRef })
  }
  if (input.guestPassword !== undefined && input.guestPassword !== null) {
    // The password lives in the love service, not in the document: a service that is down must not
    // undo a meeting that is already written, and must not leave the dialog half done either.
    try {
      await ctx.setGuestPassword(meeting, input.guestPassword)
    } catch (err: any) {
      console.error('Failed to set the guest password of the new meeting', {
        meeting,
        error: err?.message ?? err
      })
    }
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
 * A one-off meeting is a meeting document like any other: the lists of the section read
 * `PermanentMeeting`, so a meeting that existed only as a calendar event was invisible there. It gets
 * no `repeatEvery`, and its series - and therefore the planner - appears only when the dialog was
 * opened from the planner itself.
 */
export async function createOneOffMeeting (
  client: TxOperations,
  input: PermanentMeetingInput,
  ctx: ScheduleContext
): Promise<{ eventId: string, meeting: Ref<PermanentMeeting> }> {
  // No period is what makes the meeting a one-off: the shared writer creates the series only when
  // the input says so, and writes the room and the length of the meeting onto the document.
  return await createPermanentMeetingWithSchedule(client, input, ctx)
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
    // A one-off has no period, and a repeating meeting holds no room: the two fields are exclusive,
    // so one of them is cleared by the same write that sets the other.
    $unset: {
      ...(input.period === undefined ? { repeatEvery: 1 } : { room: 1 })
    },
    ...(input.period !== undefined ? { repeatEvery: input.period } : {}),
    // Kept in step with the series: a meeting without one reads its schedule from here.
    startDate: input.startDate,
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    // The document keeps the text: `description` is a plain string attribute of a space, and the panel
    // shows it as it is. The markup goes to the event, which is the only place that renders it.
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.room !== undefined && input.period === undefined ? { room: input.room } : {}),
    ...(input.group !== undefined ? { group: input.group } : {}),
    timeZone
  })
  // The flag is stored only when the meeting is hidden: a missing field means "shown", so turning
  // the switch back on has to remove it rather than write `true`.
  if (input.calendar === false) {
    await client.update(object, { calendar: false })
  } else if (input.calendar === true && object.calendar === false) {
    await client.update(object, { $unset: { calendar: 1 } })
  }

  const rules = input.period !== undefined ? periodRules(input.startDate, input.period) : []
  if (rules.length > 0 && input.endDate !== undefined) rules[0] = { ...rules[0], endDate: input.endDate }

  const participants = await participantsOf(client, members)
  // The reference on the meeting comes first: a query by the link mixin's nested field found nothing
  // on some adapters, and every save then built another event beside the ones it could not see.
  const known =
    object.event !== undefined ? await client.findOne(calendar.class.Event, { _id: object.event }) : undefined
  const series =
    known !== undefined
      ? [known]
      : await client.findAll(calendar.class.Event, {
          [`${love.mixin.MeetingEventLink as string}.permanentMeeting`]: object._id
        } as any)
  // Older meetings only had the link on the event: remember it on the meeting, so the row shows the
  // calendar icon right away and the next save finds the series without asking the mixin.
  if (object.event === undefined && series.length > 0) {
    await client.update(object, { event: series[0]._id })
  }

  if (input.calendar === false) {
    // "Not in the calendar" has to mean it: a switch that says hidden while the event stays is a lie,
    // and the calendar would keep showing the meeting.
    for (const event of series) {
      await client.removeDoc(event._class, event.space, event._id)
    }
    if (series.length > 0) await client.update(object, { $unset: { event: 1 } })
  } else {
    // The switch was off and is now on: the meeting gets the event it never had, built the same way
    // creating it would have built one.
    if (series.length === 0 && input.calendar === true) {
      const created = await createMeetingEvent(client, object._id, { ...input, members }, ctx, false)
      await client.update(object, { event: created.eventRef })
    }
    if (series.length > 0 && (object.repeatEvery !== undefined) !== (input.period !== undefined)) {
      // The meeting changed its kind (one-off ↔ repeating): the old rule and the new period would
      // disagree, so the calendar side is rebuilt from scratch.
      for (const event of series) {
        await client.removeDoc(event._class, event.space, event._id)
      }
      const created = await createMeetingEvent(client, object._id, { ...input, members }, ctx, false)
      await client.update(object, { event: created.eventRef })
      return
    }
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
      if (input.description !== undefined) update.description = descriptionMarkup(input.description)
      if (input.reminders !== undefined) update.reminders = input.reminders
      await client.update(event, update as any)
      await client.updateMixin(event._id, event._class, event.space, love.mixin.MeetingEventLink, {
        reminderBefore: input.reminderBefore,
        // The room follows the meeting: the series is what the love service and the event card read,
        // so changing the room in the settings window has to reach the link as well as the document.
        ...(input.room !== undefined ? { room: input.room } : {})
      })
    }
  }

  if (input.guestPassword !== undefined) {
    await ctx.setGuestPassword(object._id, input.guestPassword)
  }
}
