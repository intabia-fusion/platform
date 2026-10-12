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
import { findProperty, matchQuery } from '../query'
import { searchTargets } from '../storage'
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
