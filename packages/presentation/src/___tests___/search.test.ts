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

import { searchFor } from '../search'

const mockSearchFulltext = jest.fn(async () => ({ docs: [] }))
const mockFindAll = jest.fn(async (_class: string, query: { context: string }) => [
  { _id: `category-${query.context}`, classToSearch: 'test:class:Doc', context: query.context }
])

jest.mock('../utils', () => ({
  getClient: () => ({
    findAll: mockFindAll,
    searchFulltext: mockSearchFulltext,
    getHierarchy: () => ({ getDescendants: (_class: string) => [_class] })
  })
}))

describe('searchFor', () => {
  beforeEach(() => {
    mockSearchFulltext.mockClear()
  })

  it('passes searchIn to every category search', async () => {
    await searchFor('mention', 'release', undefined, undefined, { searchIn: ['title', 'identifier'] })

    expect(mockSearchFulltext).toHaveBeenCalledWith(
      { query: 'release*', classes: ['test:class:Doc'] },
      { limit: 5, searchIn: ['title', 'identifier'] }
    )
  })

  it('matches inside words with infix', async () => {
    await searchFor('mention', 'lease', undefined, undefined, { searchIn: ['title', 'identifier'], infix: true })

    expect(mockSearchFulltext).toHaveBeenCalledWith(
      { query: '*lease*', classes: ['test:class:Doc'] },
      { limit: 5, searchIn: ['title', 'identifier'] }
    )
  })

  it('keeps an empty query a plain prefix with infix', async () => {
    await searchFor('mention', '', undefined, undefined, { infix: true })

    expect(mockSearchFulltext).toHaveBeenCalledWith({ query: '*', classes: ['test:class:Doc'] }, { limit: 5 })
  })

  it.each([
    ['rel*', '*rel*'],
    ['*rel', '*rel*'],
    ['*', '*']
  ])('does not double the asterisks of %s with infix', async (input, pattern) => {
    await searchFor('mention', input, undefined, undefined, { infix: true })

    expect(mockSearchFulltext).toHaveBeenCalledWith({ query: pattern, classes: ['test:class:Doc'] }, { limit: 5 })
  })

  it('does not double the trailing asterisk without infix', async () => {
    await searchFor('spotlight', 'rel*')

    expect(mockSearchFulltext).toHaveBeenCalledWith({ query: 'rel*', classes: ['test:class:Doc'] }, { limit: 5 })
  })

  it('leaves searchIn to the server default without it', async () => {
    await searchFor('spotlight', 'release')

    expect(mockSearchFulltext).toHaveBeenCalledWith(
      { query: 'release*', classes: ['test:class:Doc'] },
      { limit: 5, searchIn: undefined }
    )
  })
})
