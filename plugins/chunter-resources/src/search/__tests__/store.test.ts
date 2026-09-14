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

import { get } from 'svelte/store'
import type { Ref, SearchResult, Space } from '@hcengineering/core'

const searchFulltext = jest.fn()
jest.mock('@hcengineering/presentation', () => ({
  getClient: () => ({
    searchFulltext,
    getHierarchy: () => ({
      getDescendants: () => ['chunter:class:ChatMessage', 'chunter:class:ThreadMessage'],
      isMixin: () => false
    })
  })
}))

// Rows are what `hydrate` makes of the raw docs; here one row per doc, keyed by id, is enough.
jest.mock('../hydrate', () => ({
  hydrateResults: async (docs: Array<{ id: string }>) => docs.map((d) => ({ _id: d.id }))
}))

jest.mock('../resolve', () => ({
  toSearchFilters: () => undefined,
  toSearchSpaces: (_filters: unknown, scope?: Ref<Space>) => (scope !== undefined ? [scope] : undefined)
}))

/* eslint-disable import/first */
import { createChatSearchStore, seedGlobalSearch, takePendingSearch } from '../store'

const page = (ids: string[], cursor?: string): SearchResult =>
  ({ docs: ids.map((id) => ({ id })), cursor, total: ids.length }) as unknown as SearchResult

async function settle (): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 550))
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

describe('createChatSearchStore', () => {
  beforeEach(() => {
    searchFulltext.mockReset()
  })

  it('searches nothing until something is typed', async () => {
    const store = createChatSearchStore()

    store.setSearch('')
    await settle()

    expect(searchFulltext).not.toHaveBeenCalled()
    expect(get(store).done).toBe(true)
  })

  it('runs one search for a burst of keystrokes', async () => {
    // The debounce is what keeps a request off every character.
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()

    store.setSearch('r')
    store.setSearch('re')
    store.setSearch('rel')
    await settle()

    expect(searchFulltext).toHaveBeenCalledTimes(1)
    expect(get(store).results.map((r) => r._id)).toEqual(['m1'])
  })

  it('ignores a late answer to a query that was replaced', async () => {
    // Out of order responses are what the generation counter exists for: a debounce alone
    // cannot stop the first request from landing after the second.
    let resolveFirst: (r: SearchResult) => void = () => {}
    searchFulltext
      .mockImplementationOnce(async () => await new Promise<SearchResult>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(page(['second']))

    const store = createChatSearchStore()
    store.setSearch('first')
    await settle()

    store.submit()
    await settle()

    resolveFirst(page(['first']))
    await settle()

    expect(get(store).results.map((r) => r._id)).toEqual(['second'])
  })

  it('releases the spinner even when the answer is discarded', async () => {
    // A superseded request still owns the flag it turned on; leaving it would block loadMore.
    let resolveFirst: (r: SearchResult) => void = () => {}
    searchFulltext
      .mockImplementationOnce(async () => await new Promise<SearchResult>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(page(['second']))

    const store = createChatSearchStore()
    store.setSearch('first')
    await settle()
    store.submit()
    await settle()
    resolveFirst(page(['first']))
    await settle()

    expect(get(store).loading).toBe(false)
    expect(get(store).loadingMore).toBe(false)
  })

  it('appends the next page instead of replacing the list', async () => {
    searchFulltext.mockResolvedValueOnce(page(['m1', 'm2'], 'cur1')).mockResolvedValueOnce(page(['m3']))

    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()

    store.loadMore()
    await settle()

    expect(get(store).results.map((r) => r._id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('drops a document that surfaces on two pages at once', async () => {
    // A reindex between two fetches can return the same id twice, and a repeated key breaks
    // the rendered list.
    searchFulltext.mockResolvedValueOnce(page(['m1', 'm2'], 'cur1')).mockResolvedValueOnce(page(['m2', 'm3']))

    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()
    store.loadMore()
    await settle()

    expect(get(store).results.map((r) => r._id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('walks on by itself when a page comes back empty but the cursor lives', async () => {
    // Nothing was added, so the scroll handler that normally asks for more will never fire.
    searchFulltext
      .mockResolvedValueOnce(page([], 'cur1'))
      .mockResolvedValueOnce(page(['m1']))

    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()
    await settle()

    expect(searchFulltext).toHaveBeenCalledTimes(2)
    expect(get(store).results.map((r) => r._id)).toEqual(['m1'])
  })

  it('is done only when the index hands back no cursor', async () => {
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()

    store.setSearch('release')
    await settle()

    expect(get(store).done).toBe(true)
  })

  it('does not ask for more once it is done', async () => {
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()

    store.loadMore()
    await settle()

    expect(searchFulltext).toHaveBeenCalledTimes(1)
  })

  it('starts from the top when the sort changes', async () => {
    // The cursor encodes the sort it was made with, so it cannot survive the switch.
    searchFulltext.mockResolvedValue(page(['m1'], 'cur1'))
    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()

    store.setSort('date-desc')
    await settle()

    const last = searchFulltext.mock.calls[searchFulltext.mock.calls.length - 1]
    expect(last[1].cursor).toBeUndefined()
    expect(last[1].sort).toBe('date-desc')
  })

  it('applies filters at once rather than after the debounce', async () => {
    // Picking a filter is deliberate, unlike typing.
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()
    searchFulltext.mockClear()

    store.setFilters({ hasAttachment: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(searchFulltext).toHaveBeenCalled()
  })

  it('reports an outage instead of an empty result', async () => {
    // A backend that is down answers normally with no docs; without the flag the panel would
    // say "nothing found" for a search that never ran.
    searchFulltext.mockResolvedValue({ docs: [], failed: true } as unknown as SearchResult)
    const store = createChatSearchStore()

    store.setSearch('release')
    await settle()

    expect(get(store).failure).toEqual({ kind: 'unavailable' })
    expect(get(store).results).toEqual([])
  })

  it('carries the message of a thrown error', async () => {
    searchFulltext.mockRejectedValue(new Error('boom'))
    const store = createChatSearchStore()

    store.setSearch('release')
    await settle()

    expect(get(store).failure).toEqual({ kind: 'error', message: 'boom' })
  })

  it('clears the failure when the next search starts', async () => {
    searchFulltext.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page(['m1']))
    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()

    store.submit()
    await settle()

    expect(get(store).failure).toBeUndefined()
  })

  it('keeps the sort when everything else is cleared', async () => {
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()
    store.setSort('date-asc')
    await settle()
    store.setSearch('release')
    await settle()

    store.clear()

    expect(get(store).results).toEqual([])
    expect(get(store).search).toBe('')
    expect(get(store).sort).toBe('date-asc')
  })

  it('writes nothing after being destroyed', async () => {
    let release: (r: SearchResult) => void = () => {}
    searchFulltext.mockImplementation(async () => await new Promise<SearchResult>((resolve) => (release = resolve)))

    const store = createChatSearchStore()
    store.setSearch('release')
    await settle()

    store.destroy()
    release(page(['m1']))
    await settle()

    expect(get(store).results).toEqual([])
  })

  it('scopes the query to its own space in the in-channel mode', async () => {
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore({ space: 'space:general' as Ref<Space> })

    store.setSearch('release')
    await settle()

    expect(searchFulltext.mock.calls[0][0].spaces).toEqual(['space:general'])
  })

  it('asks the index for the message body along with the result', async () => {
    // The index holds plain text; the snippet renders with the message's own formatting.
    searchFulltext.mockResolvedValue(page(['m1']))
    const store = createChatSearchStore()

    store.setSearch('release')
    await settle()

    expect(searchFulltext.mock.calls[0][1]).toMatchObject({
      searchIn: 'content',
      fuzzy: true,
      highlight: true,
      fields: ['message']
    })
  })
})

describe('pending search', () => {
  it('hands the whole search over, filters and all', () => {
    // Dropping the filters would widen a search the user had already narrowed.
    const search = { search: 'release', filters: { hasAttachment: true }, sort: 'relevance' as const }

    seedGlobalSearch(search)

    expect(takePendingSearch()).toEqual(search)
  })

  it('is consumed once, so a later visit starts clean', () => {
    seedGlobalSearch({ search: 'release', filters: {}, sort: 'relevance' })

    takePendingSearch()

    expect(takePendingSearch()).toBeUndefined()
  })

  it('is undefined when nothing was handed over', () => {
    expect(takePendingSearch()).toBeUndefined()
  })
})
