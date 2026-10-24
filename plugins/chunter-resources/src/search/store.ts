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
import { get, writable } from 'svelte/store'

import { hydrateResults } from './hydrate'
import { createPagedSearch, type PagedSearchSnapshot, type PagedSearchStore } from './paged'
import { toSearchFilters, toSearchSpaces } from './resolve'
import type { ChatSearchFilters, ChatSearchScope, SearchResultRow } from './types'

export const PAGE_SIZE = 50

export type ChatSearchStore = PagedSearchStore<SearchResultRow, ChatSearchFilters>

export function createChatSearchStore (scope: ChatSearchScope = {}): ChatSearchStore {
  const hierarchy = getClient().getHierarchy()
  const allClasses: Array<Ref<Class<Doc>>> = hierarchy
    .getDescendants(chunter.class.ChatMessage)
    .filter((c) => !hierarchy.isMixin(c))

  return createPagedSearch<SearchResultRow, ChatSearchFilters>({
    filters: {},
    sort: 'relevance',
    pageSize: PAGE_SIZE,
    // Filters only narrow a query, they do not search on their own.
    request: (search, filters) =>
      search === ''
        ? undefined
        : {
            query: {
              query: search,
              classes: allClasses,
              spaces: toSearchSpaces(filters, scope.space),
              filters: toSearchFilters(filters, scope.attachedTo)
            },
            options: { searchIn: ['content'], highlight: true, fields: ['message'] }
          },
    hydrate: hydrateResults
  })
}

export interface PendingSearch {
  search: string
  filters: ChatSearchFilters
  sort: SearchSortOrder
}

const pendingSearchQuery = writable<PendingSearch | undefined>(undefined)

export interface SearchSnapshot extends PagedSearchSnapshot<SearchResultRow> {
  key: string
  search: string
  filters: ChatSearchFilters
  sort: SearchSortOrder
  scrollTop: number
}

let snapshot: SearchSnapshot | undefined

export function searchKey (search: string, filters: ChatSearchFilters, sort: SearchSortOrder): string {
  return JSON.stringify({ search: search.trim(), filters, sort })
}

export function keepSearchSnapshot (value: SearchSnapshot): void {
  snapshot = value
}

export function takeSearchSnapshot (key: string): SearchSnapshot | undefined {
  if (snapshot?.key !== key) return undefined
  const value = snapshot
  snapshot = undefined
  return value
}

export function peekSearchSnapshot (): SearchSnapshot | undefined {
  return snapshot
}

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
