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

import type { Doc, IdMap, Ref } from '@hcengineering/core'
import { describe, expect, it } from 'vitest'
import { type LaneDocs, mergeLaneDocs, planLaneQueries } from '../laneQueries'
import type { DocWithRank } from '../types'

const doc = (id: string, rev: number = 0): DocWithRank => ({ _id: id, rank: String(rev) }) as unknown as DocWithRank
const docMap = (...docs: DocWithRank[]): IdMap<DocWithRank> => new Map(docs.map((d) => [d._id, d]))
const refs = (...ids: string[]): Array<Ref<Doc>> => ids as Array<Ref<Doc>>
const lanes = (entries: Record<string, string[]>): Map<string, Array<Ref<Doc>>> =>
  new Map(Object.entries(entries).map(([key, ids]) => [key, refs(...ids)]))
const laneDocs = (ids: string[], docs: DocWithRank[], pending: boolean): LaneDocs => ({
  ids: refs(...ids),
  docs: docMap(...docs),
  pending
})

describe('planLaneQueries', () => {
  it('runs every non-empty lane on the first call', () => {
    const plan = planLaneQueries(new Map(), lanes({ A: ['a1', 'a2'], B: ['b1'], C: [] }))
    expect(plan.drop).toEqual([])
    expect(Array.from(plan.run.keys())).toEqual(['A', 'B'])
    expect(plan.run.get('A')).toEqual(['a1', 'a2'])
  })

  it('leaves lanes with the same ids alone', () => {
    const plan = planLaneQueries(lanes({ A: ['a1', 'a2'] }), lanes({ A: ['a1', 'a2'] }))
    expect(plan).toEqual({ drop: [], run: new Map() })
  })

  it('re-runs only the lanes whose ids changed', () => {
    const plan = planLaneQueries(lanes({ A: ['a1', 'a2'], B: ['b1'] }), lanes({ A: ['a2'], B: ['b1'] }))
    expect(plan.drop).toEqual([])
    expect(Array.from(plan.run)).toEqual([['A', ['a2']]])
  })

  it('drops lanes that are gone or have nothing to query', () => {
    const plan = planLaneQueries(lanes({ A: ['a1'], B: ['b1'], C: ['c1'] }), lanes({ B: [], C: ['c1'] }))
    expect(plan.drop).toEqual(['A', 'B'])
    expect(plan.run.size).toBe(0)
  })

  it('treats a reordered id list as a change', () => {
    // collectVisibleGroups sorts the ids, so a new order means new ids, not a shuffle.
    const plan = planLaneQueries(lanes({ A: ['a1', 'a2'] }), lanes({ A: ['a2', 'a1'] }))
    expect(plan.run.has('A')).toBe(true)
  })
})

describe('mergeLaneDocs', () => {
  it('joins the docs of all lanes', () => {
    const merged = mergeLaneDocs(
      [laneDocs(['a1'], [doc('a1')], false), laneDocs(['b1', 'b2'], [doc('b1'), doc('b2')], false)],
      new Map()
    )
    expect(Array.from(merged.keys()).sort()).toEqual(['a1', 'b1', 'b2'])
  })

  // The lane a card leaves answers first: the card must stay until the lane it enters answers.
  it('keeps the previous copy of a card a pending lane asks for', () => {
    const previous = docMap(doc('a1'), doc('b1'))
    // Lane A answered without a1; lane B still runs its old query, which has no a1 either.
    const merged = mergeLaneDocs(
      [laneDocs(['a2'], [doc('a2')], false), laneDocs(['a1', 'b1'], [doc('b1')], true)],
      previous
    )
    expect(merged.get('a1' as Ref<DocWithRank>)).toBe(previous.get('a1' as Ref<DocWithRank>))
  })

  it('prefers the copy a lane answered with over the previous one', () => {
    const fresh = doc('a1', 2)
    const merged = mergeLaneDocs([laneDocs(['a1'], [fresh], true)], docMap(doc('a1', 1)))
    expect(merged.get('a1' as Ref<DocWithRank>)).toBe(fresh)
  })

  it('drops a card the lane answered without', () => {
    // E.g. the card was deleted or became inaccessible: an answered lane is the source of truth.
    const merged = mergeLaneDocs([laneDocs(['a1', 'b1'], [doc('b1')], false)], docMap(doc('a1'), doc('b1')))
    expect(merged.has('a1' as Ref<DocWithRank>)).toBe(false)
  })

  it('does not keep previous docs no lane asks for', () => {
    const merged = mergeLaneDocs([laneDocs(['b1'], [], true)], docMap(doc('a1'), doc('b1')))
    expect(Array.from(merged.keys())).toEqual(['b1'])
  })
})
