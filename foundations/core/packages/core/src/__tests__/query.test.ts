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

import type { Doc } from '../classes'
import core from '../component'
import { Hierarchy } from '../hierarchy'
import { findProperty, matchQuery, resultSort } from '../query'
import { searchTargets, SortingOrder } from '../storage'
import { genMinModel } from './minmodel'

describe('findProperty', () => {
  it('matches an object subset against an array-of-objects field', () => {
    const docs = [
      { _id: 'a', relations: [{ _id: 'c1', _class: 'Org' }] },
      { _id: 'b', relations: [{ _id: 'c2', _class: 'Org' }] }
    ] as unknown as Doc[]
    // Fresh object literal (as a live query rebuilds it) must still match by value,
    // not reference — this is what makes related-issues update dynamically.
    const res = findProperty(docs, 'relations', { _id: 'c1', _class: 'Org' })
    expect(res.map((d) => d._id)).toEqual(['a'])
  })

  it('does not match a non-existing object', () => {
    const docs = [{ _id: 'a', relations: [{ _id: 'c1', _class: 'Org' }] }] as unknown as Doc[]
    expect(findProperty(docs, 'relations', { _id: 'x', _class: 'Org' })).toHaveLength(0)
  })

  it('still matches a primitive value in an array', () => {
    const docs = [{ _id: 'a', tags: ['x', 'y'] }] as unknown as Doc[]
    expect(findProperty(docs, 'tags', 'x')).toHaveLength(1)
    expect(findProperty(docs, 'tags', 'z')).toHaveLength(0)
  })
})

describe('matchQuery', () => {
  it('takes $searchIn for a fulltext directive, not a field', () => {
    const hierarchy = new Hierarchy()
    for (const tx of genMinModel()) {
      hierarchy.tx(tx)
    }
    const docs = [{ _id: 'a', _class: core.class.Space, name: 'x' }] as unknown as Doc[]

    expect(matchQuery(docs, { name: 'x', $searchIn: ['title'] }, core.class.Space, hierarchy)).toHaveLength(1)
    expect(matchQuery(docs, { name: 'y', $searchIn: ['title'] }, core.class.Space, hierarchy)).toHaveLength(0)
  })
})

describe('searchTargets', () => {
  it('reads no list, null and a list with all as everything', () => {
    expect(searchTargets(undefined)).toBeUndefined()
    expect(searchTargets(null)).toBeUndefined()
    expect(searchTargets(['title', 'all'])).toBeUndefined()
    expect(searchTargets(['title', 'content'])).toEqual(['title', 'content'])
  })
})

describe('resultSort', () => {
  const hierarchy = new Hierarchy()
  const docs = (): any[] => [
    { _id: 'none', _class: core.class.Space, modifiedOn: 1 },
    { _id: 'old', _class: core.class.Space, modifiedOn: 1, $lookup: { readState: { latestMessageTimestamp: 10 } } },
    { _id: 'new', _class: core.class.Space, modifiedOn: 2, $lookup: { readState: { latestMessageTimestamp: 20 } } }
  ]
  const ids = (result: any[]): string[] => result.map((it) => it._id)

  it('puts a missing joined value last in DESC and first in ASC, as the server orders NULL of a join', () => {
    const desc = docs()
    resultSort(
      desc,
      { '$lookup.readState.latestMessageTimestamp': SortingOrder.Descending } as any,
      core.class.Space,
      hierarchy,
      {} as any
    )
    expect(ids(desc)).toEqual(['new', 'old', 'none'])

    const asc = docs()
    resultSort(
      asc,
      { '$lookup.readState.latestMessageTimestamp': SortingOrder.Ascending } as any,
      core.class.Space,
      hierarchy,
      {} as any
    )
    expect(ids(asc)).toEqual(['none', 'old', 'new'])
  })

  it('puts a missing plain value last whatever the direction, as the server orders NULL of a field', () => {
    const items = (): any[] => [
      { _id: 'b', _class: core.class.Space, modifiedOn: 1, name: 'b' },
      { _id: 'none', _class: core.class.Space, modifiedOn: 1 },
      { _id: 'unset', _class: core.class.Space, modifiedOn: 1, name: null },
      { _id: 'a', _class: core.class.Space, modifiedOn: 1, name: 'a' }
    ]
    const desc = items()
    resultSort(desc, { name: SortingOrder.Descending } as any, core.class.Space, hierarchy, {} as any)
    expect(ids(desc).slice(0, 2)).toEqual(['b', 'a'])
    expect(ids(desc).slice(2).sort()).toEqual(['none', 'unset'])
    const asc = items()
    resultSort(asc, { name: SortingOrder.Ascending } as any, core.class.Space, hierarchy, {} as any)
    expect(ids(asc).slice(0, 2)).toEqual(['a', 'b'])
    expect(ids(asc).slice(2).sort()).toEqual(['none', 'unset'])
  })

  it('sorts by rules and keeps a value the rules do not name last whatever the direction', () => {
    const rules = (order: SortingOrder): any => ({
      order,
      cases: [
        { query: 'urgent', index: 0 },
        { query: 'high', index: 1 },
        { query: 'low', index: 2 }
      ]
    })
    const items = (): any[] => [
      { _id: 'low', _class: core.class.Space, modifiedOn: 1, name: 'low' },
      { _id: 'other', _class: core.class.Space, modifiedOn: 1, name: 'other' },
      { _id: 'none', _class: core.class.Space, modifiedOn: 1 },
      { _id: 'urgent', _class: core.class.Space, modifiedOn: 1, name: 'urgent' },
      { _id: 'high', _class: core.class.Space, modifiedOn: 1, name: 'high' }
    ]
    const asc = items()
    resultSort(asc, { name: rules(SortingOrder.Ascending) }, core.class.Space, hierarchy, {} as any)
    expect(ids(asc).slice(0, 3)).toEqual(['urgent', 'high', 'low'])
    expect(ids(asc).slice(3).sort()).toEqual(['none', 'other'])
    const desc = items()
    resultSort(desc, { name: rules(SortingOrder.Descending) }, core.class.Space, hierarchy, {} as any)
    expect(ids(desc).slice(0, 3)).toEqual(['low', 'high', 'urgent'])
    expect(ids(desc).slice(3).sort()).toEqual(['none', 'other'])
  })
})
