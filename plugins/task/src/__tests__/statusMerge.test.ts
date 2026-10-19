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

import {
  addStatusTarget,
  addTargetStatusEntries,
  checkStatusMerge,
  mapStatusIds,
  mapStatusOrder,
  mergeProjectStatusEntries,
  replaceStatusIdsInJson,
  rewriteRuleStatuses,
  rewriteStatusAttributeUpdates
} from '../statusMerge'

const map = new Map([['s', 't']])

describe('status merge helpers', () => {
  it('replaces ids in a list without repeats, keeping order', () => {
    expect(mapStatusIds(['a', 's', 'b', 't'], map)).toEqual(['a', 't', 'b'])
  })

  it('adds the target after the first source and keeps the sources', () => {
    const two = new Map([
      ['s', 't'],
      ['s2', 't']
    ])
    expect(addStatusTarget(['a', 's', 'b', 's2'], two)).toEqual(['a', 's', 't', 'b', 's2'])
  })

  it('returns the same list when the target is there or no source is', () => {
    const withTarget = ['s', 't']
    const without = ['a', 'b']
    expect(addStatusTarget(withTarget, map)).toBe(withTarget)
    expect(addStatusTarget(without, map)).toBe(without)
  })

  it('merges project type entries per (status, taskType) and keeps the target entry content', () => {
    const res = mergeProjectStatusEntries(
      [
        { _id: 's', taskType: 'tt', color: 1 },
        { _id: 'x', taskType: 'tt' },
        { _id: 't', taskType: 'tt', color: 2 },
        { _id: 's', taskType: 'tt2', color: 3 }
      ],
      map
    )
    expect(res).toEqual([
      { _id: 't', taskType: 'tt', color: 2 },
      { _id: 'x', taskType: 'tt' },
      { _id: 't', taskType: 'tt2', color: 2 }
    ])
  })

  it('gives every entry of the target the color, icon and description of its own entry', () => {
    // readers take the first entry of a status: red must not win over the green of the target
    const res = mergeProjectStatusEntries(
      [
        { _id: 's', taskType: 'A', color: 1, icon: 'red-icon', description: 'old' },
        { _id: 't', taskType: 'B', color: 2 },
        { _id: 't', taskType: 'C', color: 5, description: 'other' }
      ],
      map
    )
    expect(res).toEqual([
      { _id: 't', taskType: 'A', color: 2 },
      { _id: 't', taskType: 'B', color: 2 },
      { _id: 't', taskType: 'C', color: 2 }
    ])
  })

  it('keeps the style of the first source entry when the target has no entry', () => {
    const res = mergeProjectStatusEntries(
      [
        { _id: 's', taskType: 'A', color: 1 },
        { _id: 's', taskType: 'B', color: 3 }
      ],
      map
    )
    expect(res).toEqual([
      { _id: 't', taskType: 'A', color: 1 },
      { _id: 't', taskType: 'B', color: 1 }
    ])
  })

  it('maps only the entries of the scoped task types', () => {
    const res = mergeProjectStatusEntries(
      [
        { _id: 's', taskType: 'A', color: 1 },
        { _id: 's', taskType: 'B', color: 1 },
        { _id: 't', taskType: 'B', color: 2 }
      ],
      map,
      new Set(['A'])
    )
    expect(res).toEqual([
      { _id: 't', taskType: 'A', color: 2 },
      { _id: 's', taskType: 'B', color: 1 },
      { _id: 't', taskType: 'B', color: 2 }
    ])
    // an entry without a task type is no task type's: it keeps the source
    const typeless = mergeProjectStatusEntries([{ _id: 's', taskType: 'A' }, { _id: 's' }], map, new Set(['A']))
    expect(typeless).toEqual([{ _id: 't', taskType: 'A' }, { _id: 's' }])
  })

  it('adds a styled target entry to every task type that has a source entry', () => {
    const entries = [
      { _id: 's', taskType: 'A', color: 1 },
      { _id: 'x', taskType: 'A' },
      { _id: 's', taskType: 'B', color: 1 },
      { _id: 't', taskType: 'B', color: 2 },
      { _id: 's' }
    ]
    expect(addTargetStatusEntries(entries, map)).toEqual([
      { _id: 's', taskType: 'A', color: 1 },
      { _id: 't', taskType: 'A', color: 2 },
      { _id: 'x', taskType: 'A' },
      { _id: 's', taskType: 'B', color: 1 },
      { _id: 't', taskType: 'B', color: 2 },
      { _id: 's' }
    ])
    expect(addTargetStatusEntries(entries, map, new Set(['B']))).toBe(entries)
  })

  it('maps the status order, a kept source stays and the target joins after it', () => {
    expect(mapStatusOrder(['s', 'x', 't'], map, new Set())).toEqual(['t', 'x'])
    expect(mapStatusOrder(['x', 's', 'y'], map, new Set(['s']))).toEqual(['x', 's', 't', 'y'])
    expect(mapStatusOrder(['t', 'x', 's'], map, new Set(['s']))).toEqual(['t', 'x', 's'])
  })

  it('rewrites the status lists of a rule per task type, `null` stays', () => {
    const statuses = { A: ['s', 'x', 't'], B: null, C: ['s'] }
    const replace = (ids: string[]): string[] => mapStatusIds(ids, map)
    expect(rewriteRuleStatuses(statuses, replace)).toEqual({ A: ['t', 'x'], B: null, C: ['t'] })
    expect(rewriteRuleStatuses(statuses, replace, new Set(['C']))).toEqual({ A: ['s', 'x', 't'], B: null, C: ['t'] })
    expect(rewriteRuleStatuses(statuses, (ids) => addStatusTarget(ids, map))).toEqual({
      A: ['s', 'x', 't'],
      B: null,
      C: ['s', 't']
    })
  })

  it('rewrites only the present activity fields', () => {
    expect(rewriteStatusAttributeUpdates({ attrKey: 'status', set: ['s'], prevValue: 's' }, map)).toEqual({
      attrKey: 'status',
      set: ['t'],
      prevValue: 't'
    })
  })

  it('replaces quoted ids in filter JSON only', () => {
    expect(replaceStatusIdsInJson('{"v":["s","sx"]}', map)).toBe('{"v":["t","sx"]}')
  })
})

describe('checkStatusMerge', () => {
  const statuses = new Map([
    ['t', { ofAttribute: 'attr', category: 'active' }],
    ['s1', { ofAttribute: 'attr', category: 'active' }],
    ['s2', { ofAttribute: 'attr', category: 'won' }],
    ['o', { ofAttribute: 'other', category: 'active' }]
  ])
  const inPt = new Set(['t', 's1', 's2', 'o'])

  it('accepts same-category sources and skips the ones already outside the project type', () => {
    expect(checkStatusMerge({ target: 't', sources: ['s1', 'gone'] }, statuses, inPt)).toEqual({
      errors: [],
      sources: ['s1']
    })
  })

  it('refuses a target outside the project type, a self source, another attribute and another category', () => {
    expect(checkStatusMerge({ target: 'x', sources: ['s1'] }, statuses, inPt).errors).toHaveLength(1)
    expect(checkStatusMerge({ target: 't', sources: ['t'] }, statuses, inPt).errors).toHaveLength(1)
    expect(checkStatusMerge({ target: 't', sources: ['o'] }, statuses, inPt).errors).toHaveLength(1)
    expect(checkStatusMerge({ target: 't', sources: ['s2'] }, statuses, inPt).errors).toHaveLength(1)
  })

  it('transfer mode takes another category and a source outside the project type', () => {
    const live = new Map([...statuses, ['orphan', { ofAttribute: 'attr', category: 'lost' }]])
    const req = { target: 't', sources: ['s2', 'orphan'], transfer: true }
    expect(checkStatusMerge(req, live, inPt)).toEqual({ errors: [], sources: ['s2', 'orphan'] })
    expect(checkStatusMerge({ ...req, sources: ['o'] }, live, inPt).errors).toHaveLength(1)
    expect(checkStatusMerge({ target: 't', sources: ['orphan'] }, live, inPt).sources).toEqual([])
  })
})
