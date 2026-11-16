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
import { pruneStatusCondition, pruneBoardStatusFilters } from '../boardStatusFilters'

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
