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

import type { Doc, Ref } from '@hcengineering/core'
import {
  assignLanes,
  distinctResources,
  dropChange,
  dropNeighbours,
  endChain,
  estimatedStart,
  getWindow,
  groupByOwner,
  groupDocsBy,
  groupWrites,
  inWindow,
  mergeResults,
  placeholderValues,
  resourceMove,
  sortField,
  windowCollector,
  windowConditions,
  type DropRow,
  type MoveRow
} from '../timelineRows'

const doc = (id: string, extra: Record<string, any> = {}): Doc =>
  ({ _id: id as Ref<Doc>, _class: 'c', space: 's', ...extra }) as unknown as Doc
const DAY = 24 * 60 * 60 * 1000

describe('window', () => {
  it('centers the selected month', () => {
    const w = getWindow(new Date(2026, 5, 1).getTime(), 3)
    expect(w.from).toBe(new Date(2026, 4, 1).getTime())
    expect(w.to).toBe(new Date(2026, 7, 1).getTime() - 1)
  })

  it('builds one condition per end field plus the no-end one', () => {
    const conds = windowConditions({ from: 10, to: 20 }, { key: 's', mixin: 'm' as any }, { key: 'e', fallback: 'd' })
    expect(conds).toEqual([{ e: { $gte: 10 } }, { d: { $gte: 10 } }, { 'm.s': { $lte: 20 }, e: null, d: null }])
    expect(endChain({ key: 'e', fallback: { key: 'f', fallback: 'g' } }).map((it) => it.key)).toEqual(['e', 'f', 'g'])
  })

  it('inWindow', () => {
    const w = { from: 10, to: 20 }
    expect(inWindow(undefined, undefined, w)).toBe(false)
    expect(inWindow(5, 9, w)).toBe(false)
    expect(inWindow(5, 10, w)).toBe(true)
    expect(inWindow(21, undefined, w)).toBe(false)
    expect(inWindow(15, undefined, w)).toBe(true)
    expect(inWindow(undefined, 15, w)).toBe(true)
    expect(inWindow(undefined, undefined, undefined)).toBe(true)
  })
})

describe('mergeResults / distinctResources', () => {
  it('dedups by id and sorts by start', () => {
    const a = doc('a', { s: 5 })
    const b = doc('b', { s: 1 })
    expect(mergeResults([[a], [b, a]], undefined, (d) => (d as any).s)).toEqual([b, a])
  })

  it('sorts by rank when given', () => {
    const a = doc('a', { r: 'b' })
    const b = doc('b', { r: 'a' })
    expect(mergeResults([[a, b]], 'r', () => 0)).toEqual([b, a])
  })

  it('distinctResources skips empty values', () => {
    const docs = [doc('1', { p: 'x' }), doc('2', { p: 'x' }), doc('3', {}), doc('4', { p: null })]
    expect(distinctResources(docs, 'p')).toEqual(['x'])
  })
})

describe('assignLanes', () => {
  const get = (d: Doc): number | undefined => (d as any).s
  const getEnd = (d: Doc): number | undefined => (d as any).e
  const t = (n: number): number => new Date(2026, 0, n, 12).getTime()

  it('reuses a lane only after the previous bar ended on an earlier day', () => {
    const a = doc('a', { s: t(1), e: t(3) })
    const b = doc('b', { s: t(3), e: t(4) })
    const c = doc('c', { s: t(4), e: t(5) })
    expect(assignLanes([c, b, a], get, getEnd).lane).toEqual([0, 1, 0])
  })

  it('bar without end occupies 28 days', () => {
    const a = doc('a', { s: t(1) })
    const b = doc('b', { s: t(1) + 27 * DAY })
    const c = doc('c', { s: t(1) + 29 * DAY })
    expect(assignLanes([a, b, c], get, getEnd).lane).toEqual([0, 1, 0])
  })
})

describe('groupByOwner', () => {
  it('keeps unassigned apart', () => {
    const a = doc('a', { p: 'x' })
    const b = doc('b', {})
    const c = doc('c', { p: 'x' })
    expect(groupByOwner([a, b, c], 'p')).toEqual({ assigned: [['x', [a, c]]], free: [b] })
  })
})

// bug 3
describe('groupDocsBy', () => {
  it('docs without the value go to the empty key, not undefined', () => {
    const a = doc('a', { g: 'x' })
    const b = doc('b', {})
    expect(Array.from(groupDocsBy([a, b], 'g').keys())).toEqual(['x', ''])
  })
})

// bug 7: group ids come from distinctResources
describe('distinctResources for groups', () => {
  it('skips docs without the value', () => {
    expect(distinctResources([doc('a', { g: 'x' }), doc('b', {})], 'g')).toStrictEqual(['x'])
  })
})

// bug 6
describe('sortField', () => {
  it('uses the mixin-prefixed key like the window query', () => {
    expect(sortField(undefined, { key: 'startDate', mixin: 'task:mixin:TimeManaged' as any })).toBe(
      'task:mixin:TimeManaged.startDate'
    )
    expect(sortField('rank', { key: 'startDate' })).toBe('rank')
  })
})

// bug 4
describe('windowCollector', () => {
  it('emits only once every slot has answered', () => {
    const emit = jest.fn()
    const merge = (r: Doc[][]): Doc[] => r.flat()
    const answer = windowCollector(3, merge, emit)
    answer(0, [doc('a')])
    answer(2, [doc('c')])
    expect(emit).not.toHaveBeenCalled()
    answer(1, [doc('b')])
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0].map((d: Doc) => d._id)).toEqual(['a', 'b', 'c'])
    answer(1, [])
    expect(emit).toHaveBeenCalledTimes(2)
  })
})

// bug 2
describe('dropNeighbours', () => {
  const row = (id: string, extra: Partial<DropRow> & Record<string, any> = {}): DropRow & Record<string, any> => ({
    doc: doc(id),
    child: true,
    rankField: 'rank',
    ...extra
  })

  it('picks neighbours among rows of the same level', () => {
    const [a, b, c] = [row('a'), row('b'), row('c')]
    expect(dropNeighbours([a, b, c], a, c)).toEqual({ prev: b, next: c })
    expect(dropNeighbours([a, b, c], c, a)).toEqual({ prev: undefined, next: a })
  })

  it('refuses a drop onto a child of another parent', () => {
    const [a, b] = [row('a', { parent: 'p1' }), row('b', { parent: 'p2' })]
    expect(dropNeighbours([a, b], a, b)).toBeUndefined()
  })

  it('does not rank against foreign parents', () => {
    const [a, b, x, c] = [
      row('a', { parent: 'p1' }),
      row('b', { parent: 'p1' }),
      row('x', { parent: 'p2' }),
      row('c', { parent: 'p1' })
    ]
    expect(dropNeighbours([a, x, b, c], a, c)?.prev).toBe(b)
    expect(dropNeighbours([x, a, c], c, a)?.prev).toBeUndefined()
  })

  it('refuses a drop across groups', () => {
    const [a, b] = [row('a', { child: false, groupValue: 'g1' }), row('b', { child: false, groupValue: 'g2' })]
    expect(dropNeighbours([a, b], a, b)).toBeUndefined()
  })
})

// bug 5
describe('groupWrites', () => {
  it('merges non-mixin fields into one update', () => {
    const w = groupWrites([
      { field: { key: 'startDate' }, value: 1 },
      { field: { key: 'endDate' }, value: 2 },
      { field: { key: 's', mixin: 'm' as any }, value: 3 },
      { field: { key: 'e', mixin: 'm' as any }, value: 4 }
    ])
    expect(w.attrs).toEqual({ startDate: 1, endDate: 2 })
    expect(Array.from(w.mixins.entries())).toEqual([['m', { s: 3, e: 4 }]])
  })
})

describe('dropChange', () => {
  const row = (id: string, extra: Partial<DropRow> = {}): DropRow => ({
    doc: doc(id),
    child: true,
    rankField: 'rank',
    ...extra
  })
  const opts = { parentField: 'milestone', groupBy: 'space' }
  const m1 = row('m1', { child: false, rankField: 'rank', groupValue: 's1' })
  const m2 = row('m2', { child: false, rankField: 'rank', groupValue: 's1' })
  const a = row('a', { parent: 'm1', groupValue: 's1' })
  const b = row('b', { parent: 'm1', groupValue: 's1' })
  const x = row('x', { parent: 'm2', groupValue: 's1' })
  const y = row('y', { parent: 'm2', groupValue: 's1' })
  const rows = [m1, a, b, m2, x, y]

  it('reorders within the same parent without touching the parent field', () => {
    expect(dropChange(rows, a, b, opts)).toEqual({ updates: {}, rank: { prev: undefined, next: b } })
    expect(dropChange(rows, b, a, opts)).toEqual({ updates: {}, rank: { prev: undefined, next: a } })
  })

  it('moves under another parent before the target row', () => {
    expect(dropChange(rows, a, y, opts)).toEqual({ updates: { milestone: 'm2' }, rank: { prev: x, next: y } })
  })

  it('drops on a parent row: another parent gets the row at the end, own parent is a no-op', () => {
    expect(dropChange(rows, a, m2, opts)).toEqual({ updates: { milestone: 'm2' }, rank: { prev: y } })
    expect(dropChange(rows, a, m1, opts)).toBeUndefined()
  })

  it('refuses a move between spaces', () => {
    const z = row('z', { parent: 'm3', groupValue: 's2' })
    expect(dropChange([...rows, z], a, z, opts)).toBeUndefined()
    const m3 = row('m3', { child: false, groupValue: 's2' })
    expect(dropChange([...rows, m3], a, m3, opts)).toBeUndefined()
  })

  it('refuses group headers and rows without rank', () => {
    const g = row('g', { child: false, group: 's1' })
    expect(dropChange([...rows, g], a, g, opts)).toBeUndefined()
    expect(dropChange([...rows, g], g, a, opts)).toBeUndefined()
    const r = row('r', { parent: 'm1', rankField: undefined })
    expect(dropChange([...rows, r], r, x, opts)).toBeUndefined()
  })

  it('keeps root rows within their group', () => {
    expect(dropChange(rows, m1, m2, opts)).toEqual({ updates: {}, rank: { prev: undefined, next: m2 } })
    const other = row('o', { child: false, groupValue: 's2' })
    expect(dropChange([...rows, other], m1, other, opts)).toBeUndefined()
  })
})

describe('resourceMove', () => {
  const row = (id: string, extra: Partial<MoveRow> = {}): MoveRow => ({ doc: doc(id), resource: true, ...extra })
  const opts = { resourceField: 'assignee', parentField: 'milestone', groupBy: 'space' }

  it('sets the resource value of the target row', () => {
    expect(resourceMove(row('p1', { parent: 'm1' }), row('p2', { parent: 'm1' }), opts)).toEqual({ assignee: 'p2' })
  })

  it('writes null for the unassigned row', () => {
    expect(resourceMove(row('p1'), row('', { unassigned: true }), opts)).toEqual({ assignee: null })
  })

  it('also sets the parent when the target row lies under another parent', () => {
    expect(resourceMove(row('p1', { parent: 'm1' }), row('p2', { parent: 'm2' }), opts)).toEqual({
      assignee: 'p2',
      milestone: 'm2'
    })
  })

  it('refuses the same row, non-resource rows and another space', () => {
    const f = row('p1')
    expect(resourceMove(f, f, opts)).toBeUndefined()
    expect(resourceMove(f, row('c', { resource: false }), opts)).toBeUndefined()
    expect(resourceMove(row('p1', { groupValue: 's1' }), row('p2', { groupValue: 's2' }), opts)).toBeUndefined()
  })
})

describe('placeholderValues', () => {
  const all = ['a', 'b', 'c', 'd'].map((id) => doc(id))

  it('drops shown values and keeps candidate order', () => {
    expect(placeholderValues(all, ['b', 'x'], 10).map((it) => it._id)).toEqual(['a', 'c', 'd'])
  })

  it('caps the count', () => {
    expect(placeholderValues(all, [], 2).map((it) => it._id)).toEqual(['a', 'b'])
  })
})

describe('estimatedStart', () => {
  const day = (n: number, h = 0): number => new Date(2026, 9, n, h).getTime()
  it('counts the end day and skips weekends back', () => {
    // 2026-10-07 is a Wednesday
    expect(estimatedStart(day(7, 15), undefined)).toBe(day(7))
    expect(estimatedStart(day(7, 15), 8)).toBe(day(7))
    expect(estimatedStart(day(7), 9)).toBe(day(6))
    expect(estimatedStart(day(7), 40)).toBe(day(1))
  })
})
