//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import { type Ref } from '@hcengineering/core'
import { type Person } from '@hcengineering/contact'
import { writable } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Stub from '../../../../__test__/Stub.svelte'

interface Issued {
  _class: string
  query: any
  options: any
}

const persons = ['p1', 'p2', 'p3', 'p4']

const issued: Issued[] = []
let groupCalls = 0
const groupDays = new Set<number>()
let socialIds: string[] = []

vi.mock('@hcengineering/presentation', () => ({
  createQuery: () => ({
    query: (_class: string, query: any, onResult: (res: any[]) => void, options?: any) => {
      issued.push({ _class, query, options })
      if (_class === 'contact:mixin:Employee') onResult(persons.map((_id) => ({ _id })))
      else if (_class === 'contact:class:SocialIdentity') onResult(socialIds.map((_id) => ({ _id })))
      else onResult([])
      return true
    },
    unsubscribe: () => {}
  }),
  getClient: () => ({
    getHierarchy: () => ({
      isDerived: () => false,
      getClass: () => ({}),
      classHierarchyMixin: () => undefined
    })
  }),
  reduceCalls: (op: any) => op
}))

vi.mock('@hcengineering/calendar-resources', () => ({
  calendarByIdStore: writable(new Map()),
  visibleCalendarStore: writable([]),
  hidePrivateEvents: (events: any[]) => events,
  isVisible: () => true
}))

vi.mock('@hcengineering/contact-resources', () => ({
  employeeRefByAccountUuidStore: writable(new Map()),
  getPersonRefsByPersonIdsCb: (_ids: any[], onResult: (res: Map<any, any>) => void) => {
    onResult(new Map())
  },
  PersonPresenter: Stub
}))

vi.mock('@hcengineering/workbench-resources', () => ({ openWidget: () => {} }))

// view-resources runs queries at import time, which needs a live client.
vi.mock('@hcengineering/view-resources', () => ({ DocNavLink: Stub, ObjectPresenter: Stub }))

// Count the grouping passes without changing what they return.
vi.mock('../../utils', async (orig) => {
  const actual = (await orig()) as any
  return {
    ...actual,
    groupTeamData: (...args: any[]) => {
      groupCalls++
      groupDays.add(args[6])
      return actual.groupTeamData(...args)
    }
  }
})

async function mount (props: Record<string, unknown>): Promise<void> {
  const { default: TeamCalendar } = await import('../TeamCalendar.svelte')
  const target = document.createElement('div')
  document.body.appendChild(target)
  const cmp = new (TeamCalendar as any)({
    target,
    props: {
      currentDate: new Date(2026, 8, 15),
      spaces: [],
      filterPersons: persons as Array<Ref<Person>>,
      maxDays: 5,
      ...props
    }
  })
  // The grid only fills in once the employee query has fed persons back through the bindings.
  await new Promise((resolve) => setTimeout(resolve, 0))
  void cmp
}

beforeEach(() => {
  issued.length = 0
  groupCalls = 0
  groupDays.clear()
  socialIds = []
})

describe('TeamCalendar', () => {
  it('does not touch the tx domain while the activity counters are off', async () => {
    socialIds = ['s1', 's2']
    await mount({ showActivity: false })

    expect(issued.some((it) => it._class === 'contact:mixin:Employee')).toBe(true)
    expect(issued.some((it) => it._class === 'contact:class:SocialIdentity')).toBe(false)
    expect(issued.some((it) => it._class === 'core:class:TxCUD')).toBe(false)
  })

  it('bounds the tx query when the activity counters are on', async () => {
    socialIds = ['s1', 's2']
    await mount({ showActivity: true })

    expect(issued.some((it) => it._class === 'contact:class:SocialIdentity')).toBe(true)
    const tx = issued.find((it) => it._class === 'core:class:TxCUD')
    expect(tx).toBeDefined()
    expect(tx?.query.modifiedBy).toEqual({ $in: ['s1', 's2'] })
    expect(tx?.query.modifiedOn.$gt).toBeLessThan(tx?.query.modifiedOn.$lt)
    expect(tx?.options.limit).toBe(2000)
    // Neither the counters nor the tooltip read the tx payload.
    const projected = Object.keys(tx?.options.projection ?? {})
    expect(projected).not.toContain('attributes')
    expect(projected).not.toContain('operations')
  })

  it('groups once per day column, not once per cell', async () => {
    await mount({ showActivity: false })

    // The pass scans every person, so one call per (person x day) cell would be quadratic in
    // the row count: it has to be driven by the day columns alone.
    expect(groupDays.size).toBe(5)
    expect(groupCalls).toBeGreaterThan(0)
    expect(groupCalls).toBeLessThan(groupDays.size * persons.length)
  })
})
