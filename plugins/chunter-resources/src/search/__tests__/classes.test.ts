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

import type { Class, Doc, Ref } from '@hcengineering/core'

const hierarchy = {
  getDescendants: jest.fn(),
  getMixinClasses: jest.fn(),
  getClass: jest.fn(),
  hasMixin: jest.fn()
}

jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({ getHierarchy: () => hierarchy })
}))

/* eslint-disable import/first */
import { expandClasses, getActivityDocClasses, splitPrimaryClasses } from '../classes'

const CHANNEL = 'chunter:class:Channel' as Ref<Class<Doc>>
const DIRECT = 'chunter:class:DirectMessage' as Ref<Class<Doc>>
const ISSUE = 'tracker:class:Issue' as Ref<Class<Doc>>
const DOCUMENT = 'document:class:Document' as Ref<Class<Doc>>
const CARD = 'card:class:Card' as Ref<Class<Doc>>
const PERSON = 'contact:class:Person' as Ref<Class<Doc>>

describe('splitPrimaryClasses', () => {
  it('lifts the common types out, in their own order rather than the given one', () => {
    // The order is what the picker shows, so it comes from the primary list, not the input.
    const { primary } = splitPrimaryClasses([ISSUE, CHANNEL, DIRECT])

    expect(primary).toEqual([CHANNEL, DIRECT, ISSUE])
  })

  it('leaves everything else behind, keeping the order it came in', () => {
    const { rest } = splitPrimaryClasses([CARD, CHANNEL, PERSON])

    expect(rest).toEqual([CARD, PERSON])
  })

  it('skips a primary class the workspace does not have', () => {
    // Tracker is not installed everywhere; its absence must not leave a hole in the list.
    const { primary, rest } = splitPrimaryClasses([CHANNEL, PERSON])

    expect(primary).toEqual([CHANNEL])
    expect(rest).toEqual([PERSON])
  })

  it('splits nothing into nothing', () => {
    expect(splitPrimaryClasses([])).toEqual({ primary: [], rest: [] })
  })

  it('puts every class in exactly one of the two halves', () => {
    const input = [CARD, CHANNEL, PERSON, DOCUMENT]
    const { primary, rest } = splitPrimaryClasses(input)

    expect([...primary, ...rest].sort()).toEqual([...input].sort())
    expect(primary.filter((c) => rest.includes(c))).toEqual([])
  })
})

describe('expandClasses', () => {
  beforeEach(() => {
    hierarchy.getDescendants.mockReset()
  })

  it('adds the descendants the index actually stores', () => {
    // A document is indexed under its own class, so filtering by a base one has to list them.
    hierarchy.getDescendants.mockReturnValue([PERSON, 'contact:class:Employee' as Ref<Class<Doc>>])

    expect(expandClasses([PERSON])).toEqual([PERSON, 'contact:class:Employee'])
  })

  it('keeps the class itself when it has no descendants', () => {
    hierarchy.getDescendants.mockReturnValue([])

    expect(expandClasses([CHANNEL])).toEqual([CHANNEL])
  })

  it('reports a shared descendant once', () => {
    hierarchy.getDescendants.mockReturnValue([CARD])

    expect(expandClasses([CHANNEL, DIRECT])).toEqual([CHANNEL, CARD, DIRECT])
  })

  it('keeps going when a class is missing from this workspace', () => {
    // A plugin may be absent, and one unknown class must not cost the whole filter.
    hierarchy.getDescendants.mockImplementation((c: Ref<Class<Doc>>) => {
      if (c === ISSUE) throw new Error('no such class')
      return []
    })

    expect(expandClasses([ISSUE, CHANNEL])).toEqual([ISSUE, CHANNEL])
  })

  it('expands nothing into nothing', () => {
    expect(expandClasses([])).toEqual([])
  })
})

describe('getActivityDocClasses', () => {
  beforeEach(() => {
    hierarchy.getMixinClasses.mockReset()
    hierarchy.getClass.mockReset()
    hierarchy.hasMixin.mockReset()
  })

  it('keeps only the classes declaring the mixin themselves', () => {
    // `getMixinClasses` also reports every descendant, which would fill the picker with
    // near duplicates of the same type.
    hierarchy.getMixinClasses.mockReturnValue([CHANNEL, DIRECT])
    hierarchy.getClass.mockImplementation((c: Ref<Class<Doc>>) => ({ _id: c }))
    hierarchy.hasMixin.mockImplementation((clazz: { _id: Ref<Class<Doc>> }) => clazz._id === CHANNEL)

    expect(getActivityDocClasses()).toEqual([CHANNEL])
  })

  it('drops a class this workspace cannot resolve', () => {
    hierarchy.getMixinClasses.mockReturnValue([ISSUE, CHANNEL])
    hierarchy.getClass.mockImplementation((c: Ref<Class<Doc>>) => {
      if (c === ISSUE) throw new Error('no such class')
      return { _id: c }
    })
    hierarchy.hasMixin.mockReturnValue(true)

    expect(getActivityDocClasses()).toEqual([CHANNEL])
  })
})
