//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//

import type { WorkSlot } from '@hcengineering/time'
import { splitEventsDuration } from '../utils'

jest.mock('@hcengineering/presentation', () => ({ getClient: () => ({}) }))

const HOUR = 60 * 60 * 1000
const now = new Date(2026, 8, 20, 12, 0).getTime()

function slot (from: number, to: number): WorkSlot {
  return { date: from, dueDate: to } as unknown as WorkSlot
}

describe('splitEventsDuration', () => {
  it('counts a finished slot as spent', () => {
    expect(splitEventsDuration([slot(now - 3 * HOUR, now - HOUR)], now)).toEqual({ spent: 2 * HOUR, planned: 0 })
  })

  it('counts an upcoming slot as planned', () => {
    expect(splitEventsDuration([slot(now + HOUR, now + 3 * HOUR)], now)).toEqual({ spent: 0, planned: 2 * HOUR })
  })

  it('splits a slot in progress', () => {
    expect(splitEventsDuration([slot(now - HOUR, now + 2 * HOUR)], now)).toEqual({ spent: HOUR, planned: 2 * HOUR })
  })

  it('does not count overlapping slots twice', () => {
    const res = splitEventsDuration([slot(now - 2 * HOUR, now), slot(now - HOUR, now + HOUR)], now)
    expect(res).toEqual({ spent: 2 * HOUR, planned: HOUR })
  })
})
