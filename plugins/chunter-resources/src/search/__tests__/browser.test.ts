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

import { formatDateTime, formatDay, groupByMonth, justifyRows, placeJustified, shownOrder } from '../browser'

const at = (y: number, m: number, d: number): number => new Date(y, m, d, 12).getTime()

describe('groupByMonth', () => {
  const rows = [
    { _id: 'a', createdOn: at(2026, 9, 20) },
    { _id: 'b', createdOn: at(2026, 9, 1) },
    { _id: 'c', createdOn: at(2026, 8, 30) },
    { _id: 'd', createdOn: at(2025, 8, 2) }
  ]

  it('splits a dated list by month and keeps each row at its list index', () => {
    const groups = groupByMonth(rows, 'date-desc')
    expect(groups.map((g) => g.rows.map((r) => r.row._id))).toEqual([['a', 'b'], ['c'], ['d']])
    expect(groups[1].rows[0].index).toBe(2)
    expect(groups[0].month).toBe(new Date(2026, 9, 1).getTime())
  })

  it('keeps a list ranked by relevance whole', () => {
    const groups = groupByMonth(rows, 'relevance')
    expect(groups).toHaveLength(1)
    expect(groups[0].month).toBeUndefined()
  })

  it('groups a feed by month even if relevance is the picked order', () => {
    expect(groupByMonth(rows, shownOrder('relevance', ''))).toHaveLength(3)
  })

  it('keeps one group per month for rows still in another order', () => {
    const mixed = [rows[0], rows[2], rows[1]]
    const groups = groupByMonth(mixed, 'date-desc')
    expect(groups.map((g) => g.key)).toEqual(['2026-9', '2026-8'])
    expect(groups[0].rows.map((r) => r.row._id)).toEqual(['a', 'b'])
  })

  it('has no groups for no rows', () => {
    expect(groupByMonth([], 'relevance')).toEqual([])
    expect(groupByMonth([], 'date-desc')).toEqual([])
  })
})

describe('shownOrder', () => {
  it('turns relevance into newest first without a query only', () => {
    expect(shownOrder('relevance', '')).toBe('date-desc')
    expect(shownOrder('relevance', 'x')).toBe('relevance')
    expect(shownOrder('date-asc', '')).toBe('date-asc')
  })
})

describe('placeJustified', () => {
  it('lays the rows out one under another with the gap between pictures and rows', () => {
    const rows = justifyRows([1, 1, 1], (r) => r, 204, 100, 4)
    const { items, height } = placeJustified(rows, 4)
    expect(items.map(({ x, y, width }) => [x, y, width])).toEqual([
      [0, 0, 100],
      [104, 0, 100],
      [0, 104, 100]
    ])
    expect(height).toBe(204)
  })
})

describe('justifyRows', () => {
  const ratio = (r: number): number => r

  it('fills each full row to the width and keeps proportions', () => {
    const rows = justifyRows([1.5, 1, 1.5, 1.5, 1], ratio, 400, 100, 0)
    expect(rows.map((r) => r.items.length)).toEqual([3, 2])
    expect(rows[0].height).toBe(100)
    expect(rows[0].items.map((i) => i.width)).toEqual([150, 100, 150])
    expect(rows[1].height).toBe(100)
  })

  it('takes the gaps out of the width', () => {
    const [row] = justifyRows([1, 1, 1, 1], ratio, 410, 100, 10)
    expect(row.items.length).toBe(4)
    expect(row.height).toBeCloseTo(95)
  })

  it('ends a full row flush with the width despite rounding', () => {
    const [row] = justifyRows([1, 1, 1], ratio, 401, 150, 2)
    expect(row.items.reduce((sum, i) => sum + i.width, 0) + 2 * 2).toBe(401)
  })

  it('crops extreme and unknown proportions', () => {
    const [row] = justifyRows([10, 0.2, Number.NaN], ratio, 1000, 100, 0)
    expect(row.items.map((i) => i.width)).toEqual([177, 75, 100])
  })

  it('lays out nothing without a width', () => {
    expect(justifyRows([1], ratio, 0, 100, 0)).toEqual([])
  })
})

describe('formatDay', () => {
  it('leaves the year out for the current one only', () => {
    const now = new Date(2026, 9, 21)
    expect(formatDay(at(2026, 9, 5), 'en', now)).toBe('Oct 5')
    expect(formatDay(at(2025, 9, 5), 'en', now)).toBe('Oct 5, 2025')
  })
})

describe('formatDateTime', () => {
  it('gives the day with the year and the time', () => {
    expect(formatDateTime(new Date(2026, 7, 31, 21, 11).getTime(), 'ru')).toBe('31 авг. 2026 г., 21:11')
  })
})
