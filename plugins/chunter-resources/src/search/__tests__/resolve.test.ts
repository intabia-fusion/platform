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

import type { Person } from '@hcengineering/contact'
import type { Class, Doc, PersonId, Ref, Space } from '@hcengineering/core'

// `expandClasses` walks the hierarchy; these tests are about what ends up in the filter, so the
// expansion is stubbed to the identity and covered separately in classes.test.ts.
jest.mock('../classes', () => ({
  expandClasses: (classes: Array<Ref<Class<Doc>>>) => classes
}))

const getSocialIdsByPersonRefs = jest.fn()
jest.mock('@hcengineering/contact-resources', () => ({
  getSocialIdsByPersonRefs: async (refs: Array<Ref<Person>>) => await getSocialIdsByPersonRefs(refs)
}))

/* eslint-disable import/first */
import { endOfDay, pickAuthors, startOfDay, toSearchFilters, toSearchSpaces } from '../resolve'
import type { ChatSearchFilters, PickedAuthor } from '../types'

const ALICE = 'person:alice' as Ref<Person>
const BOB = 'person:bob' as Ref<Person>
const ALICE_EMAIL = 'social:alice-email' as PersonId
const ALICE_TG = 'social:alice-telegram' as PersonId
const BOB_EMAIL = 'social:bob-email' as PersonId

const author = (person: Ref<Person>, socialIds: PersonId[]): PickedAuthor => ({ person, socialIds })

describe('toSearchFilters', () => {
  it('excludes transcriptions even when nothing else is picked', () => {
    // They are long and noisy, so they stay out until asked for by name.
    expect(toSearchFilters({})).toEqual({ excludeCollections: ['transcription'] })
  })

  it('stops excluding transcriptions once they are asked for', () => {
    expect(toSearchFilters({ includeTranscription: true })).toBeUndefined()
  })

  it('flattens every social id of every picked author', () => {
    // The index stores `createdBy` as a social id, and one person has several.
    const filters: ChatSearchFilters = {
      authors: [author(ALICE, [ALICE_EMAIL, ALICE_TG]), author(BOB, [BOB_EMAIL])],
      includeTranscription: true
    }

    expect(toSearchFilters(filters)?.createdBy).toEqual([ALICE_EMAIL, ALICE_TG, BOB_EMAIL])
  })

  it('leaves an empty createdBy when a picked author has no social id at all', () => {
    // Empty means "matches nothing", which is what the adapter does with it - dropping the
    // filter instead would widen the search back to everyone.
    const filters: ChatSearchFilters = { authors: [author(ALICE, [])], includeTranscription: true }

    expect(toSearchFilters(filters)?.createdBy).toEqual([])
  })

  it('ignores an empty author list rather than matching nothing', () => {
    // Nobody picked is not the same as picking someone unreachable.
    expect(toSearchFilters({ authors: [], includeTranscription: true })).toBeUndefined()
  })

  it('carries the date range as given', () => {
    const filters: ChatSearchFilters = { after: 1000, before: 2000, includeTranscription: true }

    expect(toSearchFilters(filters)).toEqual({ createdAfter: 1000, createdBefore: 2000 })
  })

  it('carries one end of the range without inventing the other', () => {
    expect(toSearchFilters({ after: 1000, includeTranscription: true })).toEqual({ createdAfter: 1000 })
    expect(toSearchFilters({ before: 2000, includeTranscription: true })).toEqual({ createdBefore: 2000 })
  })

  it('keeps a zero timestamp rather than treating it as absent', () => {
    expect(toSearchFilters({ after: 0, includeTranscription: true })).toEqual({ createdAfter: 0 })
  })

  it('maps picked objects to the ids the server matches on', () => {
    const filters: ChatSearchFilters = {
      attachedTo: [
        { _id: 'chan1' as Ref<Doc>, _class: 'chunter:class:Channel' as Ref<Class<Doc>>, title: 'General' },
        { _id: 'task1' as Ref<Doc>, _class: 'tracker:class:Issue' as Ref<Class<Doc>>, title: 'TSK-1' }
      ],
      includeTranscription: true
    }

    expect(toSearchFilters(filters)?.attachedTo).toEqual(['chan1', 'task1'])
  })

  it('sets hasAttachment only when it is actually on', () => {
    expect(toSearchFilters({ hasAttachment: true, includeTranscription: true })).toEqual({ hasAttachment: true })
    expect(toSearchFilters({ hasAttachment: false, includeTranscription: true })).toBeUndefined()
  })

  it('combines every picked filter into one object', () => {
    const filters: ChatSearchFilters = {
      attachedToClasses: ['chunter:class:Channel' as Ref<Class<Doc>>],
      authors: [author(ALICE, [ALICE_EMAIL])],
      after: 1000,
      hasAttachment: true
    }

    expect(toSearchFilters(filters)).toEqual({
      attachedToClass: ['chunter:class:Channel'],
      createdBy: [ALICE_EMAIL],
      createdAfter: 1000,
      hasAttachment: true,
      excludeCollections: ['transcription']
    })
  })
})

describe('toSearchSpaces', () => {
  it('locks to the scoped space when there is one', () => {
    expect(toSearchSpaces({}, 'space:general' as Ref<Space>)).toEqual(['space:general'])
  })

  it('leaves the scope open otherwise, so picked objects narrow it instead', () => {
    expect(toSearchSpaces({})).toBeUndefined()
  })
})

describe('startOfDay / endOfDay', () => {
  it('moves to the first millisecond of the day', () => {
    const at = startOfDay(new Date(2024, 4, 17, 13, 45, 30, 500).getTime())
    const d = new Date(at)

    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2024, 4, 17])
  })

  it('moves to the last millisecond of the same day', () => {
    // `before` has to cover the whole day, or the day a person named is silently left out.
    const at = endOfDay(new Date(2024, 4, 17, 13, 45).getTime())
    const d = new Date(at)

    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([23, 59, 59, 999])
    expect(d.getDate()).toBe(17)
  })

  it('spans exactly one day between the two', () => {
    const at = new Date(2024, 4, 17, 8).getTime()

    expect(endOfDay(at) - startOfDay(at)).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('is idempotent on a value already at the start of a day', () => {
    const at = startOfDay(Date.now())

    expect(startOfDay(at)).toBe(at)
  })
})

describe('pickAuthors', () => {
  beforeEach(() => {
    getSocialIdsByPersonRefs.mockReset()
  })

  it('asks for nothing when nobody is picked', async () => {
    expect(await pickAuthors([])).toEqual([])
    expect(getSocialIdsByPersonRefs).not.toHaveBeenCalled()
  })

  it('pairs each person with their social ids', async () => {
    getSocialIdsByPersonRefs.mockResolvedValue(
      new Map([
        [ALICE, [ALICE_EMAIL, ALICE_TG]],
        [BOB, [BOB_EMAIL]]
      ])
    )

    expect(await pickAuthors([ALICE, BOB])).toEqual([
      { person: ALICE, socialIds: [ALICE_EMAIL, ALICE_TG] },
      { person: BOB, socialIds: [BOB_EMAIL] }
    ])
  })

  it('keeps a person the lookup knows nothing about, with no ids', async () => {
    // Dropping them would quietly widen the filter; an empty list makes the search match nothing.
    getSocialIdsByPersonRefs.mockResolvedValue(new Map())

    expect(await pickAuthors([ALICE])).toEqual([{ person: ALICE, socialIds: [] }])
  })

  it('resolves everyone in one lookup', async () => {
    getSocialIdsByPersonRefs.mockResolvedValue(new Map())

    await pickAuthors([ALICE, BOB])

    expect(getSocialIdsByPersonRefs).toHaveBeenCalledTimes(1)
    expect(getSocialIdsByPersonRefs).toHaveBeenCalledWith([ALICE, BOB])
  })
})
