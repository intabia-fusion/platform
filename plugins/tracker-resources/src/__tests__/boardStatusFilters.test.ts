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

import type { Ref, Status } from '@hcengineering/core'
import { pruneStatusCondition, pruneBoardStatusFilters, createBoardProjectUpdater } from '../boardStatusFilters'

const allowed = new Set(['shared', 'remaining'] as Array<Ref<Status>>)
const condition = (mode: string, values: string[]): string =>
  JSON.stringify([
    { key: { key: 'status' }, mode, value: values, index: 1 },
    { key: { key: 'priority' }, value: [1], index: 2 }
  ])

describe('project removal status filters', () => {
  it('clears excluded statuses from columns while preserving shared statuses, empty columns and settings', () => {
    const columns = [
      { id: 'a', title: 'Doing', category: 'active', limit: 3, statuses: ['removed', 'shared'] },
      { id: 'b', title: 'Done', category: 'won', statuses: ['removed'] }
    ]
    const board = { filter: '', quickFilters: [], swimlanes: [], colorRules: [], columns }
    const result = pruneBoardStatusFilters(board as any, allowed) as any
    expect(result.columns).toEqual([
      { ...columns[0], statuses: ['shared'] },
      { ...columns[1], statuses: [] }
    ])
    expect(columns[0].statuses).toEqual(['removed', 'shared'])
  })
  it.each(['view:filter:FilterObjectIn', 'view:filter:FilterObjectNin'])(
    'cleans %s and keeps shared statuses',
    (mode) => {
      const result = JSON.parse(pruneStatusCondition(condition(mode, ['removed', 'shared']), allowed))
      expect(result[0].value).toEqual(['shared'])
      expect(result[0].mode).toBe(mode)
      expect(result[1].value).toEqual([1])
    }
  )
  it('keeps the Not selected option and reports the number of removed values', () => {
    const removed = jest.fn()
    const input = JSON.stringify([{ key: { key: 'status' }, value: [null, 'removed', 'shared'] }])
    expect(JSON.parse(pruneStatusCondition(input, allowed, removed))[0].value).toEqual([null, 'shared'])
    expect(removed).toHaveBeenCalledWith(1)
  })
  it('removes an empty condition entirely', () => {
    const result = JSON.parse(pruneStatusCondition(condition('in', ['removed']), allowed))
    expect(result).toEqual([{ key: { key: 'priority' }, value: [1], index: 2 }])
    expect(pruneStatusCondition(JSON.stringify([{ key: { key: 'status' }, value: ['removed'] }]), allowed)).toBe('')
  })
  it('preserves unmodified and invalid conditions', () => {
    for (const value of ['', 'broken', '{}', condition('in', ['shared'])]) {
      expect(pruneStatusCondition(value, allowed)).toBe(value)
    }
  })
  it('cleans quick filters, lanes and colors as well as the main condition', () => {
    const rule = { id: 'r', condition: condition('in', ['removed', 'remaining']) }
    const board = { filter: rule.condition, quickFilters: [rule], swimlanes: [rule], colorRules: [rule], columns: [] }
    const cleaned = pruneBoardStatusFilters(board as any, allowed)
    for (const value of [
      cleaned.filter,
      cleaned.quickFilters[0].condition,
      cleaned.swimlanes[0].condition,
      cleaned.colorRules[0].condition
    ]) {
      expect(JSON.parse(value)[0].value).toEqual(['remaining'])
    }
    expect(JSON.parse(board.filter)[0].value).toContain('removed')
  })
})

describe('exclusive board project updates', () => {
  function fixture (loaded: string[] = ['b', 'c'], complete = true): any {
    let board: any = {
      projects: ['a', 'b', 'c'],
      filter: condition('in', ['removed']),
      columns: [],
      quickFilters: [],
      swimlanes: [],
      colorRules: []
    }
    const save = jest.fn(async (patch) => {
      board = { ...board, ...patch }
    })
    const load = jest.fn(async () => loaded.map((_id) => ({ _id })) as any)
    const busy = jest.fn()
    const update = createBoardProjectUpdater(
      () => board,
      load,
      () => (complete ? allowed : undefined),
      save,
      busy
    )
    return { update, save, load, busy, board: () => board }
  }

  it.each([false, true])('preserves configuration with incomplete scope (missing model: %s)', async (missingModel) => {
    const f = fixture(missingModel ? ['b', 'c'] : ['b'], !missingModel)
    await f.update(['b', 'c'] as any)
    expect(f.save).toHaveBeenCalledWith({ projects: ['b', 'c'] }, 0)
    expect(f.board().filter).toBe(condition('in', ['removed']))
  })

  function defer (): { promise: Promise<void>, resolve: () => void } {
    let finish!: () => void
    const promise = new Promise<void>((resolve) => {
      finish = resolve
    })
    return { promise, resolve: finish }
  }

  it.each([
    [
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c', 'd', 'e']
    ],
    [
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'c']
    ],
    [['c'], ['c']]
  ])('saves the last selection from an open popup after the current save: %j', async (middle, last) => {
    const f = fixture()
    const gate = defer()
    f.save.mockImplementationOnce(async (patch: any) => {
      await gate.promise
      Object.assign(f.board(), patch)
    })
    const first = f.update(['a', 'b', 'c', 'x'] as any)
    await f.update(middle as any)
    await f.update(last as any)
    expect(f.save).toHaveBeenCalledTimes(1)
    gate.resolve()
    await first
    expect(f.board().projects).toEqual(last)
    expect(f.save).toHaveBeenCalledTimes(2)
    expect(f.busy.mock.calls).toEqual([[true], [false]])
  })

  it('uses the latest selection when it changes while project data loads', async () => {
    const f = fixture()
    const gate = defer()
    f.load.mockImplementationOnce(async () => {
      await gate.promise
      return [{ _id: 'b' }, { _id: 'c' }]
    })
    const first = f.update(['b', 'c'] as any)
    await f.update(['a', 'b', 'c', 'd'] as any)
    gate.resolve()
    await first
    expect(f.save).toHaveBeenCalledTimes(1)
    expect(f.save).toHaveBeenCalledWith({ projects: ['a', 'b', 'c', 'd'] }, 0)
    expect(f.board().filter).toBe(condition('in', ['removed']))
  })

  it('does not save again if the last selection matches the completed save', async () => {
    const f = fixture()
    const gate = defer()
    f.save.mockImplementationOnce(async (patch: any) => {
      await gate.promise
      Object.assign(f.board(), patch)
    })
    const first = f.update(['a', 'b', 'c', 'd'] as any)
    await f.update(['a', 'b', 'c', 'd'] as any)
    gate.resolve()
    await first
    expect(f.save).toHaveBeenCalledTimes(1)
  })

  it('releases the updater on a save error and does not replay an old pending selection on retry', async () => {
    const f = fixture()
    const gate = defer()
    f.save.mockImplementationOnce(async () => {
      await gate.promise
      throw new Error('save failed')
    })
    const first = f.update(['a', 'b', 'c', 'd'] as any)
    await f.update(['a', 'b', 'c', 'e'] as any)
    const failed = expect(first).rejects.toThrow('save failed')
    gate.resolve()
    await failed
    await f.update(['a', 'b', 'c', 'f'] as any)
    expect(f.board().projects).toEqual(['a', 'b', 'c', 'f'])
    expect(f.save).toHaveBeenCalledTimes(2)
    expect(f.busy.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  it('releases the controls after a failed request and leaves settings untouched', async () => {
    const f = fixture()
    f.load.mockRejectedValueOnce(new Error('offline'))
    await expect(f.update(['b', 'c'] as any)).rejects.toThrow('offline')
    expect(f.save).not.toHaveBeenCalled()
    await f.update(['b', 'c'] as any)
    expect(f.board().projects).toEqual(['b', 'c'])
  })
})
