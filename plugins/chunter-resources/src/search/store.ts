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

import { type Class, type Doc, type Ref, type SearchSortOrder } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import chunter from '@hcengineering/chunter'
import { get, writable, type Readable, type Writable } from 'svelte/store'

import { hydrateResults } from './hydrate'
import { toSearchFilters, toSearchSpaces } from './resolve'
import type { ChatSearchFilters, ChatSearchScope, ChatSearchState, SearchResultRow } from './types'

export const PAGE_SIZE = 50
const DEBOUNCE_MS = 500

const emptyState: ChatSearchState = {
  search: '',
  filters: {},
  sort: 'relevance',
  results: [],
  loading: false,
  loadingMore: false,
  done: true
}

export interface ChatSearchStore extends Readable<ChatSearchState> {
  setSearch: (search: string) => void
  setFilters: (filters: ChatSearchFilters) => void
  setSort: (sort: SearchSortOrder) => void
  submit: () => void
  loadMore: () => void
  clear: () => void
  destroy: () => void
}

function sameFilters (a: ChatSearchFilters, b: ChatSearchFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function createChatSearchStore (scope: ChatSearchScope = {}): ChatSearchStore {
  const store: Writable<ChatSearchState> = writable({ ...emptyState })

  // Bumped on every new search. A late response from a superseded request checks this before
  // writing, which is what fixes out of order results - a debounce alone does not.
  let generation = 0
  let cursor: string | undefined
  let timer: any
  let destroyed = false

  const hierarchy = getClient().getHierarchy()
  const allClasses: Array<Ref<Class<Doc>>> = hierarchy
    .getDescendants(chunter.class.ChatMessage)
    .filter((c) => !hierarchy.isMixin(c))

  // A document reindexed between two page fetches can surface on both, and a repeated id would
  // break the keyed list rendering the results. Dropping it keeps the cursor walk monotonic.
  function appendUnique (existing: SearchResultRow[], incoming: SearchResultRow[]): SearchResultRow[] {
    const seen = new Set(existing.map((r) => r._id))
    return [...existing, ...incoming.filter((r) => !seen.has(r._id))]
  }

  function releaseFlags (append: boolean): void {
    store.update((s) => (append ? { ...s, loadingMore: false } : { ...s, loading: false }))
  }

  async function run (append: boolean): Promise<void> {
    const gen = ++generation
    const state = get(store)
    const text = state.search.trim()

    // Filters only narrow a query, they do not search on their own.
    if (text === '') {
      cursor = undefined
      store.update((s) => ({
        ...s,
        results: [],
        total: undefined,
        totalExact: undefined,
        loading: false,
        loadingMore: false,
        done: true,
        failure: undefined
      }))
      return
    }

    store.update((s) => ({
      ...s,
      loading: !append,
      loadingMore: append,
      failure: undefined
    }))

    try {
      const result = await getClient().searchFulltext(
        {
          query: text,
          classes: allClasses,
          spaces: toSearchSpaces(state.filters, scope.space),
          filters: toSearchFilters(state.filters)
        },
        {
          limit: PAGE_SIZE,
          sort: state.sort,
          searchIn: 'content',
          fuzzy: true,
          cursor: append ? cursor : undefined,
          highlight: true,
          fields: ['message']
        }
      )
      if (gen !== generation || destroyed) {
        releaseFlags(append)
        return
      }

      // An outage resolves normally with an empty payload, so without this the panel would
      // report "nothing found" for a search that never ran.
      if (result.failed === true) {
        store.update((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          done: true,
          failure: { kind: 'unavailable' }
        }))
        return
      }

      const rows = await hydrateResults(result.docs)
      if (gen !== generation || destroyed) {
        releaseFlags(append)
        return
      }

      cursor = result.cursor
      store.update((s) => ({
        ...s,
        results: append ? appendUnique(s.results, rows) : rows,
        total: result.total,
        totalExact: result.totalExact,
        loading: false,
        loadingMore: false,
        done: result.cursor === undefined
      }))

      if (rows.length === 0 && result.cursor !== undefined) {
        void run(true)
      }
    } catch (err: any) {
      if (gen !== generation || destroyed) {
        releaseFlags(append)
        return
      }
      console.error('chat search failed', err)
      store.update((s) => ({
        ...s,
        loading: false,
        loadingMore: false,
        done: true,
        failure: { kind: 'error', message: `${err.message ?? err}` }
      }))
    }
  }

  function schedule (): void {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void run(false)
    }, DEBOUNCE_MS)
  }

  return {
    subscribe: store.subscribe,

    setSearch (search: string): void {
      if (get(store).search === search) return
      cursor = undefined
      store.update((s) => ({ ...s, search }))
      schedule()
    },

    setFilters (filters: ChatSearchFilters): void {
      if (sameFilters(get(store).filters, filters)) return
      cursor = undefined
      store.update((s) => ({ ...s, filters }))
      clearTimeout(timer)
      void run(false)
    },

    setSort (sort: SearchSortOrder): void {
      if (get(store).sort === sort) return
      cursor = undefined
      store.update((s) => ({ ...s, sort, results: [], done: true }))
      void run(false)
    },

    submit (): void {
      clearTimeout(timer)
      cursor = undefined
      void run(false)
    },

    loadMore (): void {
      const s = get(store)
      if (s.loading || s.loadingMore || s.done || cursor === undefined) return
      void run(true)
    },

    clear (): void {
      clearTimeout(timer)
      generation++
      cursor = undefined
      store.set({ ...emptyState, sort: get(store).sort })
    },

    destroy (): void {
      destroyed = true
      clearTimeout(timer)
    }
  }
}

export interface PendingSearch {
  search: string
  filters: ChatSearchFilters
  sort: SearchSortOrder
}

const pendingSearchQuery = writable<PendingSearch | undefined>(undefined)

export function seedGlobalSearch (search: PendingSearch): void {
  pendingSearchQuery.set(search)
}

export function takePendingSearch (): PendingSearch | undefined {
  const value = get(pendingSearchQuery)
  if (value !== undefined) {
    pendingSearchQuery.set(undefined)
  }
  return value
}
