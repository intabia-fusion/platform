//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { type Event } from '@hcengineering/calendar'
import { type Person } from '@hcengineering/contact'
import { type Ref } from '@hcengineering/core'
import { createDayGroups, groupsForDay } from '../utils'

jest.mock('@hcengineering/presentation', () => ({ getClient: () => ({}) }))
jest.mock('@hcengineering/workbench-resources', () => ({ openWidget: () => {} }))
jest.mock('@hcengineering/calendar-resources', () => ({ isVisible: () => true }))

const me = 'me' as Ref<Person>
const other = 'other' as Ref<Person>
const hour = 60 * 60 * 1000
const day1 = new Date(2026, 8, 7).setHours(0, 0, 0, 0)
const day2 = new Date(2026, 8, 8).setHours(0, 0, 0, 0)

function event (date: number): Event {
  return {
    _id: `e-${date}` as Ref<Event>,
    _class: 'calendar:class:Event' as any,
    space: 'sp' as any,
    modifiedBy: '' as any,
    modifiedOn: 0,
    eventId: `e-${date}`,
    calendar: 'cal' as any,
    participants: [other],
    date,
    dueDate: date + hour,
    allDay: false
  } as unknown as Event
}

function cache (): ReturnType<typeof createDayGroups> {
  return createDayGroups([], [event(day1 + 9 * hour), event(day2 + 9 * hour)], [], new Map(), me, new Map())
}

describe('day grouping cache', () => {
  it('groups a day once and hands the same result back', () => {
    const groups = cache()

    const first = groupsForDay(groups, day1, day1 + 24 * hour)
    const second = groupsForDay(groups, day1, day1 + 24 * hour)

    // A grouping pass scans every person, so a grid must not redo it per cell in the column.
    expect(second).toBe(first)
    expect(groups.groups.size).toBe(1)
  })

  it('keeps days apart', () => {
    const groups = cache()

    const first = groupsForDay(groups, day1, day1 + 24 * hour)
    const next = groupsForDay(groups, day2, day2 + 24 * hour)

    expect(next).not.toBe(first)
    expect(groups.groups.size).toBe(2)
  })

  it('keeps windows of the same day apart', () => {
    const groups = cache()

    const morning = groupsForDay(groups, day1, day1 + 12 * hour)
    const wholeDay = groupsForDay(groups, day1, day1 + 24 * hour)

    // Same start, different end is a different window - serving the first answer hides events.
    expect(wholeDay).not.toBe(morning)
  })

  it('starts empty so a changed input is never served from a stale cache', () => {
    expect(cache().groups.size).toBe(0)
  })
})
