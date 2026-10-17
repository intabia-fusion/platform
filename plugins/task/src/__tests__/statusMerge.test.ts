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
  checkStatusMerge,
  mapStatusIds,
  mergeProjectStatusEntries,
  replaceStatusIdsInJson,
  rewriteStatusAttributeUpdates
} from '../statusMerge'

const map = new Map([['s', 't']])

describe('status merge helpers', () => {
  it('replaces ids in a list without repeats, keeping order', () => {
    expect(mapStatusIds(['a', 's', 'b', 't'], map)).toEqual(['a', 't', 'b'])
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
      { _id: 't', taskType: 'tt2', color: 3 }
    ])
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
