import {
  getCurrentAccount,
  SortingOrder,
  type Client,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  type PersonId,
  type Ref,
  type Space,
  type Timestamp,
  type TxCUD
} from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import type { ToDo, WorkSlot } from '@hcengineering/time'
import time from '@hcengineering/time'
import type { DefSeparators } from '@hcengineering/ui'

import calendarPlugin, { AccessLevel, getPrimaryCalendar, type Calendar, type Event } from '@hcengineering/calendar'
import { getCurrentEmployeeSpace } from '@hcengineering/contact'

export * from './types'

export function getNearest (events: WorkSlot[]): WorkSlot | undefined {
  const now = Date.now()
  events.sort((a, b) => a.date - b.date)
  return (
    events.find((event) => event.date <= now && event.dueDate >= now) ??
    events.find((event) => event.date >= now) ??
    events[events.length - 1]
  )
}

/**
 * @public
 */
export const timeSeparators: DefSeparators = [
  { minSize: 18, size: 18, maxSize: 22.5, float: 'navigator' },
  null,
  { minSize: 25, size: 41.25, maxSize: 90 }
]

/**
 * With the todo list hidden the Planner shows two panels, not three - Separator indexes
 * straight into this config, so the layouts need one entry set (and one name) each.
 *
 * @public
 */
export const timeSeparatorsNoToDos: DefSeparators = [{ minSize: 18, size: 18, maxSize: 22.5, float: 'navigator' }, null]

/**
 * @public
 */
export const teamSeparators: DefSeparators = [{ minSize: 12.5, size: 17.5, maxSize: 22.5, float: 'navigator' }, null]

export async function ToDoTitleProvider (client: Client, ref: Ref<ToDo>, doc?: ToDo): Promise<string> {
  const object = doc ?? (await client.findOne(time.class.ToDo, { _id: ref }))

  if (object === undefined) return ''

  return object.title
}

export function calculateEventsDuration (events: WorkSlot[]): number {
  const points = events.flatMap((event) => [
    { time: event.date, type: 'start' },
    { time: event.dueDate, type: 'end' }
  ])

  points.sort((a, b) => a.time - b.time)

  let activeEvents = 0
  let duration = 0
  let lastTime = 0

  points.forEach((point) => {
    if (activeEvents > 0) {
      duration += point.time - lastTime
    }
    activeEvents += point.type === 'start' ? 1 : -1
    lastTime = point.time
  })

  return duration
}

/**
 * Slots before now are time already spent, slots after it are still a plan; a slot in progress
 * counts on both sides.
 */
export function splitEventsDuration (events: WorkSlot[], now: number = Date.now()): { spent: number, planned: number } {
  const clip = (from: number, to: number): WorkSlot[] =>
    events
      .map((event) => ({ ...event, date: Math.max(event.date, from), dueDate: Math.min(event.dueDate, to) }))
      .filter((event) => event.dueDate > event.date)

  return {
    spent: calculateEventsDuration(clip(0, now)),
    planned: calculateEventsDuration(clip(now, Number.MAX_SAFE_INTEGER))
  }
}

// A ProjectToDo's workslot goes to the project space, a plain ToDo's workslot to the owner's personal space.
export function getWorkSlotSpace (todo: Pick<ToDo, 'attachedSpace'>): Ref<Space> {
  return todo.attachedSpace ?? getCurrentEmployeeSpace()
}

export async function findPrimaryCalendar (): Promise<Ref<Calendar>> {
  const acc = getCurrentAccount()
  const primary = acc.primarySocialId
  const client = getClient()
  const calendars = await client.findAll(calendarPlugin.class.Calendar, {
    user: primary,
    hidden: false,
    access: { $in: [AccessLevel.Owner, AccessLevel.Writer] }
  })
  const preference = await client.findOne(calendarPlugin.class.PrimaryCalendar, {})
  return getPrimaryCalendar(calendars, preference, acc.uuid)
}

/**
 * @public
 *
 * Activity counters read no tx payload, and an unbounded scan of the tx domain is what made one
 * staging transactor run out of memory (FUSIO-1344).
 *
 * ponytail: the limit truncates silently - on a busy workspace the oldest days of the window
 * lose their counters (newest survive, the sort is descending). Per-day queries if that shows.
 */
export function activityTxQuery (
  socialIds: PersonId[],
  from: Timestamp,
  to: Timestamp
): { query: DocumentQuery<TxCUD<Doc>>, options: FindOptions<TxCUD<Doc>> } {
  return {
    query: { modifiedBy: { $in: socialIds }, modifiedOn: { $gt: from, $lt: to } },
    options: {
      limit: 2000,
      sort: { modifiedOn: SortingOrder.Descending },
      projection: { _class: 1, objectId: 1, objectClass: 1, modifiedBy: 1, createdBy: 1, modifiedOn: 1 }
    }
  }
}

/**
 * @public
 *
 * A master's date/dueDate describe the first occurrence only, and an override is matched to it by
 * `originalStartTime` - windowing either by date resurrects occurrences moved out of view.
 */
export function eventWindowQueries (
  calendarIds: Array<Ref<Calendar>>,
  from: Timestamp,
  to: Timestamp
): { plain: DocumentQuery<Event>, recurring: DocumentQuery<Event>, instances: DocumentQuery<Event> } {
  return {
    plain: {
      _class: { $nin: [calendarPlugin.class.ReccuringEvent, calendarPlugin.class.ReccuringInstance] },
      calendar: { $in: calendarIds },
      date: { $lte: to },
      dueDate: { $gte: from }
    },
    recurring: { calendar: { $in: calendarIds }, date: { $lte: to } },
    instances: { calendar: { $in: calendarIds } }
  }
}
