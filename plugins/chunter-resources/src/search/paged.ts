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

import type { SearchOptions, SearchQuery, SearchResultDoc, SearchSortOrder } from '@hcengineering/core'
import { getClient } from '@hcengineering/presentation'
import { get, writable, type Readable, type Writable } from 'svelte/store'

import type { SearchFailure } from './types'

// How many thin pages are fetched on their own before the scroll takes over again.
export const MAX_AUTO_PAGES = 5
const DEBOUNCE_MS = 500

export interface PagedSearchState<Row, Filters> {
  search: string
  /** The search the results were found by; `search` runs ahead of it while typing. */
  searched: string
  filters: Filters
  sort: SearchSortOrder
  results: Row[]
  total?: number
  totalExact?: boolean
  loading: boolean
  loadingMore: boolean
  done: boolean
  failure?: SearchFailure
}

export interface PagedSearchRequest {
  query: SearchQuery
  options: Omit<SearchOptions, 'cursor' | 'limit' | 'sort'>
  sort?: SearchSortOrder
}

export interface PagedSearchConfig<Row, Filters> {
  search?: string
  filters: Filters
  sort: SearchSortOrder
  pageSize: number
  request: (search: string, filters: Filters, sort: SearchSortOrder) => PagedSearchRequest | undefined
  hydrate: (docs: SearchResultDoc[]) => Promise<Row[]>
  debounceMs?: number
}

export interface PagedSearchSnapshot<Row> {
  results: Row[]
  cursor?: string
  total?: number
  totalExact?: boolean
  done: boolean
}

export interface PagedSearchStore<Row, Filters> extends Readable<PagedSearchState<Row, Filters>> {
  getCursor: () => string | undefined
  setSearchSilently: (search: string) => void
  restore: (snapshot: PagedSearchSnapshot<Row>) => void
  setSearch: (search: string) => void
  setFilters: (filters: Filters) => void
  /** `keepResults`: the shown list is already in this order, only the choice is remembered. */
  setSort: (sort: SearchSortOrder, keepResults?: boolean) => void
  submit: () => void
  loadMore: () => void
  retry: () => void
  clear: () => void
  destroy: () => void
}

function sameFilters<Filters> (a: Filters, b: Filters): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function createPagedSearch<Row extends { _id: string }, Filters> (
  config: PagedSearchConfig<Row, Filters>
): PagedSearchStore<Row, Filters> {
  const emptyState: PagedSearchState<Row, Filters> = {
    search: '',
    searched: '',
    filters: config.filters,
    sort: config.sort,
    results: [],
    loading: false,
    loadingMore: false,
    done: true
  }
  const store: Writable<PagedSearchState<Row, Filters>> = writable({
    ...emptyState,
    search: config.search ?? '',
    searched: config.search ?? ''
  })

  // A late response from a superseded request must not write; a debounce alone does not prevent it.
  let generation = 0
  let autoPages = 0
  let cursor: string | undefined
  let timer: any
  let destroyed = false

  // A document reindexed between page fetches can surface twice, and a repeated id breaks the keyed list.
  function appendUnique (existing: Row[], incoming: Row[]): Row[] {
    const seen = new Set(existing.map((r) => r._id))
    return [...existing, ...incoming.filter((r) => !seen.has(r._id))]
  }

  // A failed next page keeps its cursor so a retry continues; a failed search drops the old list.
  function fail (append: boolean, search: string, failure: SearchFailure): void {
    if (!append) cursor = undefined
    store.update((s) => ({
      ...s,
      ...(append ? {} : { searched: search, results: [], total: undefined, totalExact: undefined }),
      loading: false,
      loadingMore: false,
      done: !append,
      failure
    }))
  }

  async function run (append: boolean): Promise<void> {
    const gen = ++generation
    if (!append) autoPages = 0
    const state = get(store)
    const request = config.request(state.search.trim(), state.filters, state.sort)

    if (request === undefined) {
      cursor = undefined
      store.update((s) => ({
        ...s,
        searched: state.search,
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
      const result = await getClient().searchFulltext(request.query, {
        ...request.options,
        limit: config.pageSize,
        sort: request.sort ?? state.sort,
        cursor: append ? cursor : undefined
      })
      // The newer search owns the loading flags; clearing them here would flash an empty list.
      if (gen !== generation || destroyed) return

      // An outage resolves with an empty payload; without this the panel would say "nothing found".
      if (result.failed === true) {
        fail(append, state.search, { kind: 'unavailable' })
        return
      }

      const rows = await config.hydrate(result.docs)
      if (gen !== generation || destroyed) return

      cursor = result.cursor
      const done = result.cursor === undefined
      store.update((s) => {
        const results = append ? appendUnique(s.results, rows) : rows
        return {
          ...s,
          searched: append ? s.searched : state.search,
          results,
          // The server marks the total a bound for the pages it has not read yet; with none left it is the list.
          total: done ? results.length : result.total,
          totalExact: done ? true : result.totalExact,
          loading: false,
          loadingMore: false,
          done
        }
      })

      // A page too thin to scroll never fires the scroll handler, so follow it (a few times at most); an empty page always.
      const thin = rows.length < config.pageSize / 2 && autoPages < MAX_AUTO_PAGES
      if (result.cursor !== undefined && (rows.length === 0 || thin)) {
        if (rows.length > 0) autoPages++
        void run(true)
      }
    } catch (err: any) {
      if (gen !== generation || destroyed) return
      console.error('search failed', err)
      fail(append, state.search, { kind: 'error', message: `${err.message ?? err}` })
    }
  }

  function schedule (): void {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void run(false)
    }, config.debounceMs ?? DEBOUNCE_MS)
  }

  return {
    subscribe: store.subscribe,

    getCursor (): string | undefined {
      return cursor
    },

    setSearchSilently (search: string): void {
      store.update((s) => ({ ...s, search, searched: search }))
    },

    restore (snapshot: PagedSearchSnapshot<Row>): void {
      clearTimeout(timer)
      generation++
      cursor = snapshot.cursor
      store.update((s) => ({
        ...s,
        results: snapshot.results,
        total: snapshot.total,
        totalExact: snapshot.totalExact,
        loading: false,
        loadingMore: false,
        done: snapshot.done,
        failure: undefined
      }))
    },

    setSearch (search: string): void {
      if (get(store).search === search) return
      // A next page of the old search still on its way would bring back its cursor.
      generation++
      cursor = undefined
      store.update((s) => ({ ...s, search, loadingMore: false }))
      schedule()
    },

    setFilters (filters: Filters): void {
      if (sameFilters(get(store).filters, filters)) return
      cursor = undefined
      store.update((s) => ({ ...s, filters }))
      clearTimeout(timer)
      void run(false)
    },

    setSort (sort: SearchSortOrder, keepResults = false): void {
      if (get(store).sort === sort) return
      if (keepResults) {
        store.update((s) => ({ ...s, sort }))
        return
      }
      // The run takes the typed query too: the debounce would only repeat it.
      clearTimeout(timer)
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
      // After a failure only `retry` asks again: the scroll would repeat it on every move.
      if (s.loading || s.loadingMore || s.done || s.failure != null || cursor == null) return
      autoPages = 0
      void run(true)
    },

    retry (): void {
      const s = get(store)
      if (s.results.length > 0 && !s.done && cursor != null) {
        autoPages = 0
        void run(true)
        return
      }
      clearTimeout(timer)
      cursor = undefined
      void run(false)
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
