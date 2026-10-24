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
import { BrowserTab } from '../attachments'
import { defaultSort, formatsFromQuery, namesSearch, replaceSearch, searchToQuery, tabFromQuery } from '../url'

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
