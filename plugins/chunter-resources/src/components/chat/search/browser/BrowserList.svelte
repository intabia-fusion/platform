<!--
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
-->
<script lang="ts" generics="Row extends { _id: string }, Filters">
  import type { SearchSortOrder } from '@hcengineering/core'
  import ui, {
    BlankView,
    Button,
    IconOptions,
    IconSearch,
    Label,
    Loading,
    ModernDropdown,
    Scroller,
    type DropdownIntlItem
  } from '@hcengineering/ui'
  import { afterUpdate, onDestroy, onMount } from 'svelte'

  import type { ContentTab } from '../../../../search/attachments'
  import { shownOrder } from '../../../../search/browser'
  import type { PagedSearchStore } from '../../../../search/paged'
  import type { ChatSearchFilters, SearchOption } from '../../../../search/types'
  import chunter from '../../../../plugin'
  import SearchFailureState from '../SearchFailureState.svelte'
  import SearchFilterBar from '../SearchFilterBar.svelte'
  import BrowserSkeleton from './BrowserSkeleton.svelte'
  import { tabConfig } from './tabs'

  /** Owned from here on: submitted on mount, destroyed with the list. */
  export let store: PagedSearchStore<Row, Filters>
  export let tab: ContentTab
  export let value: string = ''
  export let filters: ChatSearchFilters = {}
  export let sort: SearchSortOrder = 'date-desc'
  /** Options of the filter bar, e.g. searching inside files. */
  export let options: SearchOption[] | undefined = undefined
  /** Any filter narrows the results: an empty list then says nothing was found, not that there is nothing. */
  export let filtered: boolean = false
  /** False until the list knows its width: before that it only looks short. */
  export let measured: boolean = true

  // How close to the end of the list the next page starts loading.
  const LOAD_AHEAD = 600

  const sortItems: DropdownIntlItem[] = [
    { id: 'date-desc', label: chunter.string.SortByNewest },
    { id: 'date-asc', label: chunter.string.SortByOldest },
    // Offered without a query too, or nobody learns it exists; it applies once something is typed.
    { id: 'relevance', label: chunter.string.SortByRelevance }
  ]

  let divScroll: HTMLElement | undefined | null = undefined
  // A new query or filter starts the list over; staying scrolled down would show its middle.
  let listKey = ''
  let filledAt = -1

  onMount(() => {
    store.submit()
  })

  onDestroy(() => {
    store.destroy()
  })

  $: store.setSearch(value)

  $: state = $store
  // What the shown results were found by: typed text runs ahead of them until the debounce.
  $: search = state.searched.trim()
  $: count = state.results.length
  $: sortLabel = (sortItems.find((i) => i.id === state.sort) ?? sortItems[0]).label

  // Relevance and newest-first without a query are one list: switching keeps it unless a query is pending.
  $: store.setSort(sort, sameOrder(sort, state.sort, search) && sameOrder(sort, state.sort, state.search.trim()))

  $: {
    const key = JSON.stringify([state.searched, state.filters, shownOrder(state.sort, search)])
    if (key !== listKey) {
      listKey = key
      filledAt = -1
      if (divScroll != null) divScroll.scrollTop = 0
    }
  }

  // A short page cannot scroll, so the next one loads here; once per result count, or empty pages would follow each other to the end.
  afterUpdate(() => {
    if (divScroll == null || !measured || state.done || state.loading || state.loadingMore || count === filledAt) return
    if (divScroll.scrollHeight - divScroll.clientHeight < LOAD_AHEAD) {
      filledAt = count
      store.loadMore()
    }
  })

  function sameOrder (a: SearchSortOrder, b: SearchSortOrder, search: string): boolean {
    return shownOrder(a, search) === shownOrder(b, search)
  }

  function selectSort (id: unknown): void {
    if (id === state.sort) return
    sort = id as SearchSortOrder
  }

  function handleScroll (): void {
    if (divScroll == null || state.done || state.loadingMore) return
    if (divScroll.scrollTop + divScroll.clientHeight >= divScroll.scrollHeight - LOAD_AHEAD) {
      store.loadMore()
    }
  }

  function retry (): void {
    store.retry()
  }

  function loadMore (): void {
    store.loadMore()
  }

  // The search box belongs to the page above, which marks it with `.header-search`.
  function onWindowKeydown (e: KeyboardEvent): void {
    if (e.defaultPrevented) return
    const target = e.target as HTMLElement | null
    if (target?.tagName !== 'INPUT' || target.closest('.header-search') == null) return
    if (e.key === 'Escape' && value !== '') {
      e.preventDefault()
      value = ''
    } else if (e.key === 'Enter') {
      e.preventDefault()
      store.submit()
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<div class="panel">
  <SearchFilterBar
    {filters}
    messageFilters={false}
    {options}
    on:change={(e) => {
      filters = e.detail
    }}
    on:options
  >
    <slot name="filters" slot="extra" />
    <svelte:fragment slot="trailing">
      <ModernDropdown
        items={sortItems}
        selected={state.sort}
        icon={IconOptions}
        iconSize="small"
        kind="secondary"
        size="small"
        showDropdownIcon
        on:selected={(e) => {
          selectSort(e.detail)
        }}
      >
        <svelte:fragment slot="content">
          <Label label={sortLabel} />
        </svelte:fragment>
      </ModernDropdown>
    </svelte:fragment>
  </SearchFilterBar>

  {#if state.total != null && count > 0}
    <div class="summary">
      {#if state.totalExact === false}
        <Label label={chunter.string.SearchResultsCountApprox} params={{ count: state.total }} />
      {:else}
        <Label label={tabConfig[tab].count} params={{ count: state.total }} />
      {/if}
    </div>
  {/if}

  <div class="results" aria-busy={state.loading}>
    {#if state.loading && count === 0}
      <BrowserSkeleton kind={tab} />
    {:else if state.failure != null && count === 0}
      <SearchFailureState failure={state.failure} on:retry={retry} />
    {:else if count === 0}
      {#if search === '' && !filtered}
        <BlankView icon={tabConfig[tab].icon} header={tabConfig[tab].empty} label={chunter.string.BrowserEmptyHint} />
      {:else}
        <BlankView
          icon={IconSearch}
          header={chunter.string.SearchNoResultsTitle}
          label={chunter.string.SearchNoResultsHint}
        />
      {/if}
    {:else}
      <Scroller bind:divScroll onScroll={handleScroll}>
        <div class="list">
          <slot {search} />
          {#if state.loadingMore}
            <div class="more"><Loading shrink /></div>
          {:else if state.failure != null}
            <SearchFailureState failure={state.failure} inline on:retry={retry} />
          {:else if !state.done && !state.loading && filledAt === count}
            <!-- The automatic loading gave up on a page that added nothing; the rest is a click away. -->
            <div class="more">
              <Button label={ui.string.ShowMore} kind="ghost" on:click={loadMore} />
            </div>
          {/if}
        </div>
      </Scroller>
    {/if}
  </div>
</div>

<style lang="scss">
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  // One line of fixed height: the skeleton holds the same place until the count arrives.
  .summary {
    padding: 0 1rem 0.5rem;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--theme-darker-color);
  }

  .results {
    position: relative;
    flex-grow: 1;
    min-height: 0;
    overflow: hidden;
  }

  .list {
    display: flex;
    flex-direction: column;
    padding: 0 1rem 1rem;
  }

  .more {
    display: flex;
    justify-content: center;
    padding: 1rem;
  }

  @media (max-width: 480px) {
    .summary {
      padding: 0 0.75rem 0.5rem;
    }

    .list {
      padding: 0 0.5rem 1rem;
    }
  }
</style>
