//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { SortingOrder, type DocumentQuery, type PersonId, type Ref } from '@hcengineering/core'
import calendar, { getAllEvents, type Calendar, type Event } from '@hcengineering/calendar'
import { activityTxQuery, eventWindowQueries } from '../utils'

jest.mock('@hcengineering/presentation', () => ({ getClient: () => ({}) }))

const from = new Date(2026, 8, 10).getTime()
const to = new Date(2026, 8, 17).getTime()

describe('activityTxQuery', () => {
  it('bounds the scan by window, row count and payload', () => {
    const { query, options } = activityTxQuery(['s1', 's2'] as PersonId[], from, to)

    expect(query.modifiedBy).toEqual({ $in: ['s1', 's2'] })
    expect(query.modifiedOn).toEqual({ $gt: from, $lt: to })
    expect(options.limit).toBe(2000)
    // Counters and the tooltip read no tx payload; shipping it is what filled the wire.
    const projected = Object.keys(options.projection ?? {})
    expect(projected).not.toContain('attributes')
    expect(projected).not.toContain('operations')
    expect(projected).toEqual(expect.arrayContaining(['objectId', 'objectClass', 'modifiedOn']))
  })

  it('drops the oldest days first when the limit bites', () => {
    const { options } = activityTxQuery(['s1'] as PersonId[], from, to)

    // Truncation is silent, so at least make it lose the far end of the window, not today.
    expect(options.sort).toEqual({ modifiedOn: SortingOrder.Descending })
  })
})

describe('eventWindowQueries', () => {
  const calendars = ['cal-a', 'cal-b'] as Array<Ref<Calendar>>

  it('windows plain events at both ends', () => {
    const { plain } = eventWindowQueries(calendars, from, to)

    expect(plain.calendar).toEqual({ $in: calendars })
    expect(plain.date).toEqual({ $lte: to })
    expect(plain.dueDate).toEqual({ $gte: from })
  })

  it('leaves both recurring classes to their own queries', () => {
    const { plain } = eventWindowQueries(calendars, from, to)

    // An override caught here as well would arrive twice, once per query.
    expect(plain._class).toEqual({
      $nin: [calendar.class.ReccuringEvent, calendar.class.ReccuringInstance]
    })
  })

  it('leaves a recurring master open at the start', () => {
    const { recurring } = eventWindowQueries(calendars, from, to)

    // Its date/dueDate describe the first occurrence only, so the window's start cannot apply.
    expect(recurring.date).toEqual({ $lte: to })
    expect(recurring.dueDate).toBeUndefined()
  })

  it('leaves an override unwindowed', () => {
    const { instances } = eventWindowQueries(calendars, from, to)

    // getAllEvents matches it to the master by originalStartTime, which no date bound describes.
    expect(instances).toEqual({ calendar: { $in: calendars } })
  })
})

type Cond = Record<string, unknown>

interface Operators {
  $nin?: unknown[]
  $in?: unknown[]
  $lte?: number
  $gte?: number
}

/** The subset of the query language these three queries use. */
function matches (doc: Cond, query: DocumentQuery<Event>): boolean {
  return Object.entries(query as Cond).every(([field, cond]) => {
    const value = doc[field]
    if (cond === null || typeof cond !== 'object') return value === cond
    const op = cond as Operators
    if (op.$nin !== undefined) return !op.$nin.includes(value)
    if (op.$in !== undefined) return op.$in.includes(value)
    const num = value as number
    return (op.$lte === undefined || num <= op.$lte) && (op.$gte === undefined || num >= op.$gte)
  })
}

/** What the three queries together hand to getAllEvents, class filter included. */
function fetched (all: Cond[], calendars: Array<Ref<Calendar>>, wFrom: number, wTo: number): Event[] {
  const q = eventWindowQueries(calendars, wFrom, wTo)
  const byClass = [
    [q.plain, undefined],
    [q.recurring, calendar.class.ReccuringEvent],
    [q.instances, calendar.class.ReccuringInstance]
  ] as const
  const res = new Map<string, Cond>()
  for (const [query, _class] of byClass) {
    for (const doc of all) {
      if (_class !== undefined && doc._class !== _class) continue
      if (matches(doc, query)) res.set(doc._id as string, doc)
    }
  }
  return Array.from(res.values()) as unknown as Event[]
}

describe('window against getAllEvents', () => {
  const calendars = ['cal-a'] as Array<Ref<Calendar>>
  const day = (d: number, h = 9): number => new Date(2026, 8, d, h).getTime()
  const hour = 60 * 60 * 1000

  const master = {
    _id: 'master',
    _class: calendar.class.ReccuringEvent,
    calendar: 'cal-a',
    eventId: 'ev-1',
    date: day(11),
    dueDate: day(11) + hour,
    rules: [],
    rdate: [day(11), day(12)],
    exdate: []
  }
  // The 11th was dragged to October, far outside the window we render.
  const moved = {
    _id: 'moved',
    _class: calendar.class.ReccuringInstance,
    calendar: 'cal-a',
    eventId: 'ev-1-moved',
    recurringEventId: 'ev-1',
    originalStartTime: day(11),
    date: new Date(2026, 9, 20, 9).getTime(),
    dueDate: new Date(2026, 9, 20, 10).getTime()
  }

  it('keeps the untouched occurrence', () => {
    const res = getAllEvents(fetched([master, moved], calendars, from, to), from, to)

    expect(res.map((it) => it.date)).toEqual([day(12)])
  })

  it('does not resurrect an occurrence moved out of the window', () => {
    const res = getAllEvents(fetched([master, moved], calendars, from, to), from, to)

    // Windowing the override by `date` drops it, and the master regenerates the 11th as a ghost.
    expect(res.some((it) => it.date === day(11))).toBe(false)
  })

  it('still shows an occurrence moved into the window', () => {
    const past = {
      ...master,
      _id: 'past-master',
      eventId: 'ev-2',
      date: day(1),
      dueDate: day(1) + hour,
      rdate: [day(1)]
    }
    const into = {
      ...moved,
      _id: 'into',
      eventId: 'ev-2-moved',
      recurringEventId: 'ev-2',
      originalStartTime: day(1),
      date: day(14),
      dueDate: day(14) + hour
    }
    const res = getAllEvents(fetched([past, into], calendars, from, to), from, to)

    expect(res.map((it) => it._id)).toEqual(['into'])
  })

  it('drops a plain event outside the window before getAllEvents sees it', () => {
    const plain = {
      _id: 'plain',
      _class: calendar.class.Event,
      calendar: 'cal-a',
      eventId: 'ev-3',
      date: new Date(2026, 0, 5, 9).getTime(),
      dueDate: new Date(2026, 0, 5, 10).getTime()
    }
    expect(fetched([plain], calendars, from, to)).toEqual([])
  })
})
