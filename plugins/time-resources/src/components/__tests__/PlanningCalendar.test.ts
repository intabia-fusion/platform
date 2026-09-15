//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { setCurrentAccount } from '@hcengineering/core'
import { writable } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stub from '../../__test__/Stub.svelte'

interface Issued {
  _class: string
  query: any
}

const issued: Issued[] = []

vi.mock('@hcengineering/presentation', () => ({
  createQuery: () => ({
    query: (_class: string, query: any, onResult: (res: any[]) => void) => {
      issued.push({ _class, query })
      onResult([])
      return true
    },
    unsubscribe: () => {}
  }),
  getClient: () => ({ getHierarchy: () => ({ isDerived: () => false }) }),
  reduceCalls: (op: any) => op
}))

vi.mock('@hcengineering/calendar-resources', () => ({
  calendarByIdStore: writable(new Map()),
  hidePrivateEvents: (events: any[]) => events,
  DayCalendar: Stub
}))

vi.mock('@hcengineering/contact-resources', () => ({
  employeeByIdStore: writable(new Map()),
  UserBoxList: Stub
}))

// view-resources runs queries at import time, which needs a live client.
vi.mock('@hcengineering/view-resources', () => ({ DocNavLink: Stub, ObjectPresenter: Stub }))

// PlannerViewSwitch imports the package index, which mounts the whole plugin's component graph
// (activity, notifications, ...) at import time. Only a type is taken from it here.
vi.mock('../..', () => ({}))

beforeEach(() => {
  issued.length = 0
  setCurrentAccount({ uuid: 'acc', socialIds: ['s1'], primarySocialId: 's1' } as any)
})

describe('PlanningCalendar', () => {
  it('asks only for the events of the shown window', async () => {
    const { default: PlanningCalendar } = await import('../PlanningCalendar.svelte')
    const target = document.createElement('div')
    document.body.appendChild(target)
    const cmp = new (PlanningCalendar as any)({
      target,
      props: { currentDate: new Date(2026, 8, 15), displayedDaysCount: 3 }
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    void cmp

    const plain = issued.find((it) => it._class === 'calendar:class:Event')
    expect(plain).toBeDefined()
    expect(plain?.query.date.$lte).toBeGreaterThan(plain?.query.dueDate.$gte)

    // A recurring master's own date only describes its first occurrence, so the window's start
    // cannot be applied to it - but nothing starting after the window's end can occur inside.
    const recurring = issued.find((it) => it._class === 'calendar:class:ReccuringEvent')
    expect(recurring).toBeDefined()
    expect(recurring?.query.date.$lte).toBe(plain?.query.date.$lte)
    expect(recurring?.query.dueDate).toBeUndefined()
  })
})
