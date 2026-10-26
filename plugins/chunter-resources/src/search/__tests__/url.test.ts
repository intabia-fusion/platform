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

// Only the pure address helpers are tested: what resolves names from the platform is stubbed out.
jest.mock('@hcengineering/view-resources', () => ({ getDocIdentifier: jest.fn(), getDocTitle: jest.fn() }))
jest.mock('@hcengineering/presentation', () => ({ getClient: jest.fn() }))
jest.mock('../resolve', () => ({ pickAuthors: jest.fn() }))
jest.mock('../hydrate', () => ({}))
jest.mock('@hcengineering/contact-resources', () => ({}))

/* eslint-disable import/first */
import { getClient } from '@hcengineering/presentation'
import { getDocIdentifier, getDocTitle } from '@hcengineering/view-resources'

import { BrowserTab } from '../attachments'
import { pickAuthors } from '../resolve'
import {
  defaultSort,
  filtersFromLink,
  formatsFromQuery,
  namesSearch,
  replaceSearch,
  searchToQuery,
  startTab,
  tabFromQuery
} from '../url'

const plain = {
  tab: BrowserTab.Messages,
  query: '',
  filters: {},
  sort: defaultSort(BrowserTab.Messages),
  formats: [],
  content: false
}

describe('browser url', () => {
  it('leaves a plain browser with a plain address', () => {
    expect(searchToQuery(plain)).toEqual({})
    expect(searchToQuery({ ...plain, tab: BrowserTab.Files, sort: 'date-desc' })).toEqual({ tab: 'files' })
  })

  it('writes what differs from the default', () => {
    expect(
      searchToQuery({
        tab: BrowserTab.Files,
        query: 'report',
        filters: { attachedToClasses: ['chunter:class:Channel' as Ref<Class<Doc>>], hasAttachment: true },
        sort: 'relevance',
        formats: ['pdf', 'document'] as any,
        content: true
      })
    ).toEqual({
      q: 'report',
      type: 'chunter:class:Channel',
      files: '1',
      sort: 'relevance',
      tab: 'files',
      formats: 'pdf,document',
      content: '1'
    })
  })

  it('reads back a known tab and formats only', () => {
    expect(tabFromQuery({ tab: 'audio' })).toBe(BrowserTab.Audio)
    expect(tabFromQuery({ tab: 'nope' })).toBeUndefined()
    expect(formatsFromQuery({ formats: 'pdf,nope,,archive' })).toEqual(['pdf', 'archive'])
    expect(formatsFromQuery(undefined)).toEqual([])
  })

  it('tells a link naming a search from a plain one', () => {
    expect(namesSearch({ q: 'x' })).toBe(true)
    expect(namesSearch({ sort: 'date-asc' })).toBe(true)
    expect(namesSearch({ other: '1' })).toBe(false)
    expect(namesSearch(undefined)).toBe(false)
  })

  it('replaces the previous search and keeps the rest of the page', () => {
    expect(replaceSearch({ q: 'old', tab: 'media', message: 'm1' }, { q: 'new' })).toEqual({ message: 'm1', q: 'new' })
  })
})

describe('browser start tab', () => {
  const saved = (): BrowserTab => BrowserTab.Audio

  it('opens the tab a link names', () => {
    expect(startTab({ tab: 'files', from: 'p1' }, saved)).toBe(BrowserTab.Files)
  })

  // A link copied from the messages tab carries no tab: it must not open on the recipient's last one.
  it('opens messages for a link naming only a filter', () => {
    expect(startTab({ from: 'p1' }, saved)).toBe(BrowserTab.Messages)
    expect(startTab({ in: 'tracker:class:Issue~i1' }, saved)).toBe(BrowserTab.Messages)
    expect(startTab({ q: 'x' }, saved)).toBe(BrowserTab.Messages)
  })

  it('opens the last tab for a plain link', () => {
    expect(startTab({ message: 'm1' }, saved)).toBe(BrowserTab.Audio)
    expect(startTab(undefined, saved)).toBe(BrowserTab.Audio)
  })
})

describe('filters from a link', () => {
  const objects = {
    getHierarchy: () => ({ hasClass: () => true, getClass: () => ({ icon: 'icon' }) }),
    findOne: async (_class: string, query: { _id: string }) => ({ _id: query._id })
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(getClient as jest.Mock).mockReturnValue(objects)
    ;(getDocIdentifier as jest.Mock).mockResolvedValue(undefined)
    ;(getDocTitle as jest.Mock).mockImplementation(async (_client, _id) => {
      if (_id === 'bad') throw new Error('no title')
      return `Title ${_id as string}`
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('drops only the object whose title fails to load', async () => {
    const filters = await filtersFromLink({ in: 'tracker:class:Issue~good,tracker:class:Issue~bad' })
    expect(filters.attachedTo?.map((o) => o._id)).toEqual(['good'])
  })

  it('opens unfiltered when the filters fail to load', async () => {
    ;(pickAuthors as jest.Mock).mockRejectedValueOnce(new Error('network'))
    await expect(filtersFromLink({ from: 'p1', after: '10' })).resolves.toEqual({})
  })
})
