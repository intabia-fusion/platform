import {
  type Calendar,
  type Event,
  type ReccuringEvent,
  type ReccuringInstance,
  generateEventId
} from '@hcengineering/calendar'
import {
  type Client,
  type Doc,
  type DocumentUpdate,
  type IdMap,
  type Ref,
  type Timestamp,
  getCurrentAccount,
  toIdMap
} from '@hcengineering/core'
import presentation, { createQuery, getClient, onClient } from '@hcengineering/presentation'
import { DAY, showPopup } from '@hcengineering/ui'
import { writable } from 'svelte/store'
import calendar from './plugin'
import { getMetadata } from '@hcengineering/platform'
import login from '@hcengineering/login'
import { getClient as getAccountClientRaw, type AccountClient } from '@hcengineering/account-client'
import CalDavAccess from './components/CalDavAccess.svelte'

export function saveUTC (date: Timestamp): Timestamp {
  const utcdate = new Date(date)
  return Date.UTC(
    utcdate.getFullYear(),
    utcdate.getMonth(),
    utcdate.getDate(),
    utcdate.getHours(),
    utcdate.getMinutes(),
    utcdate.getSeconds(),
    utcdate.getMilliseconds()
  )
}

export function hidePrivateEvents (events: Event[], calendars: IdMap<Calendar>, allowMe: boolean = true): Event[] {
  const res: Event[] = []
  for (const event of events) {
    if (getCurrentAccount().socialIds.includes(event.user) && allowMe) {
      res.push(event)
    } else {
      if (event.visibility !== undefined) {
        if (event.visibility !== 'private') {
          res.push(event)
        }
      } else {
        const calendar = calendars.get(event.calendar)
        if (calendar != null && calendar.visibility !== 'private') {
          res.push(event)
        }
      }
    }
  }
  return res
}

export function isReadOnly (value: Event): boolean {
  if (value.createdBy === undefined || !getCurrentAccount().socialIds.includes(value.user)) return true
  if (['owner', 'writer'].includes(value.access)) return false
  return true
}

export function isVisible (value: Event, calendars: IdMap<Calendar>): boolean {
  if (value.createdBy !== undefined && getCurrentAccount().socialIds.includes(value.user)) return true
  if (value.visibility === 'freeBusy') {
    return false
  } else if (value.visibility === 'public') {
    return true
  }
  const calendar = calendars.get(value.calendar)
  if (calendar == null) {
    return true
  } else {
    return calendar.visibility === 'public'
  }
}

export const calendarByIdStore = writable<IdMap<Calendar>>(new Map())
export const calendarStore = writable<Calendar[]>([])
export const visibleCalendarStore = writable<Calendar[]>([])

const query = createQuery(true)
onClient((client, account) => {
  query.query(calendar.class.Calendar, {}, (res) => {
    calendarStore.set(res)
    visibleCalendarStore.set(res.filter((p) => !p.hidden))
    calendarByIdStore.set(toIdMap(res))
  })
})

export async function updatePast (ops: DocumentUpdate<Event>, object: ReccuringInstance): Promise<void> {
  const client = getClient()
  const origin = await client.findOne(calendar.class.ReccuringEvent, {
    eventId: object.recurringEventId,
    calendar: object.calendar
  })
  if (origin !== undefined) {
    await client.addCollection(
      calendar.class.ReccuringEvent,
      origin.space,
      origin.attachedTo,
      origin.attachedToClass,
      origin.collection,
      {
        ...origin,
        date: object.date,
        dueDate: object.dueDate,
        ...ops,
        eventId: generateEventId()
      }
    )
    const targetDate = ops.date ?? object.date
    await client.update(origin, {
      rules: [{ ...origin.rules[0], endDate: targetDate - DAY }],
      rdate: origin.rdate.filter((p) => p < targetDate)
    })
    const instances = await client.findAll(calendar.class.ReccuringInstance, {
      recurringEventId: origin.eventId,
      date: { $gte: targetDate }
    })
    for (const instance of instances) {
      await client.remove(instance)
    }
  }
}

/**
 * Applies a change made on one occurrence of a series.
 *
 * A change to an occurrence was once a question - "this event or all of them" - asked on every save.
 * It is not a question here: the series is the scope of the change, so it goes to the master event
 * straight away and no `UpdateRecInstancePopup` stands between the user and the edit.
 */
export async function updateReccuringInstance (
  ops: DocumentUpdate<ReccuringEvent>,
  object: ReccuringInstance
): Promise<boolean> {
  const client = getClient()
  if (object.virtual !== true) {
    await client.update(object, ops)
    return true
  }
  const base = await client.findOne(calendar.class.ReccuringEvent, {
    calendar: object.calendar,
    eventId: object.recurringEventId
  })
  if (base === undefined) return false
  // The dates come from the occurrence the user edited, not from the master: the shift they made is
  // the same for both, so it is applied relative to the master's own dates.
  if (ops.date !== undefined) {
    ops.date = base.date - (object.date - ops.date)
  }
  if (ops.dueDate !== undefined) {
    ops.dueDate = base.dueDate - (object.dueDate - ops.dueDate)
  }
  await client.update(base, ops)
  return true
}

export async function configureCalDavAccess (): Promise<void> {
  showPopup(CalDavAccess, {}, undefined)
}

export function getAccountClient (): AccountClient {
  const accountsUrl = getMetadata(login.metadata.AccountsUrl)
  const token = getMetadata(presentation.metadata.Token)

  return getAccountClientRaw(accountsUrl, token)
}

export async function eventTitleProvider (client: Client, ref: Ref<Doc>, doc?: Event): Promise<string> {
  const object = doc ?? (await client.findOne(calendar.class.Event, { _id: ref as Ref<Event> }))
  if (object === undefined) {
    return ''
  }
  return object.title
}
