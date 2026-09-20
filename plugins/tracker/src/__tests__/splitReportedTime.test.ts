//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import type { Ref } from '@hcengineering/core'
import type { WorkSlot } from '@hcengineering/time'

import { splitReportedTime } from '../index'

const HOUR = 60 * 60 * 1000
const now = new Date(2026, 8, 20, 12, 0).getTime()
const slot = 'slot:1' as Ref<WorkSlot>

describe('splitReportedTime', () => {
  it('counts a slot report from the past as spent', () => {
    expect(splitReportedTime([{ date: now - 3 * HOUR, value: 2, workslot: slot }], now)).toEqual({
      spent: 2,
      planned: 0
    })
  })

  it('counts a slot report ahead of now as planned', () => {
    expect(splitReportedTime([{ date: now + HOUR, value: 2, workslot: slot }], now)).toEqual({ spent: 0, planned: 2 })
  })

  it('splits a slot in progress proportionally', () => {
    expect(splitReportedTime([{ date: now - HOUR / 2, value: 2, workslot: slot }], now)).toEqual({
      spent: 0.5,
      planned: 1.5
    })
  })

  it('counts a report entered by hand as fully spent', () => {
    // The popup stamps it with the current time, so proportional splitting would report almost nothing.
    expect(splitReportedTime([{ date: now, value: 2 }], now)).toEqual({ spent: 2, planned: 0 })
  })

  it('counts a report entered by hand for a future date as planned', () => {
    expect(splitReportedTime([{ date: now + HOUR, value: 2 }], now)).toEqual({ spent: 0, planned: 2 })
  })

  it('treats a report without a date as spent', () => {
    expect(splitReportedTime([{ date: null, value: 3 }], now)).toEqual({ spent: 3, planned: 0 })
  })
})
