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
<script lang="ts">
  import { type Doc, type Ref, type SearchSortOrder, type Space } from '@hcengineering/core'
  import { IconOptions, Label, ModernDropdown, type DropdownIntlItem } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte'
  import { get } from 'svelte/store'

  import chunter from '../../../plugin'
  import { createChatSearchStore, keepSearchSnapshot, searchKey, takeSearchSnapshot } from '../../../search/store'
  import type { ChatSearchFilters, SearchResultRow } from '../../../search/types'
  import SearchFilterBar from './SearchFilterBar.svelte'
  import SearchResultsList from './SearchResultsList.svelte'

  export let space: Ref<Space> | undefined = undefined
  export let attachedTo: Ref<Doc> | undefined = undefined
  export let value: string = ''
  export let filters: ChatSearchFilters = {}
  export let sort: SearchSortOrder = 'relevance'

  const dispatch = createEventDispatcher()
  const store = createChatSearchStore({ space, attachedTo })

  let divScroll: HTMLElement | undefined | null = undefined
  let scrolledFor: string | undefined

  $: inChannel = space !== undefined || attachedTo !== undefined
  $: visible = !inChannel || $store.results.length > 0 || $store.failure !== undefined

  let selection = 0

  const sortItems: DropdownIntlItem[] = [
    { id: 'relevance', label: chunter.string.SortByRelevance },
    { id: 'date-desc', label: chunter.string.SortByNewest },
    { id: 'date-asc', label: chunter.string.SortByOldest }
  ]

  $: sortLabel = (sortItems.find((i) => i.id === $store.sort) ?? sortItems[0]).label

  onMount(() => {
    if (value === '') return

    const key = searchKey(value, filters, sort)
    const restored = inChannel ? undefined : takeSearchSnapshot(key)
    if (restored !== undefined) {
      scrolledFor = key
      store.setSearchSilently(value)
      store.restore(restored)
      void tick().then(() => {
        if (divScroll != null) divScroll.scrollTop = restored.scrollTop
      })
      return
    }

    store.setSearch(value)
  })

  onDestroy(() => {
    if (!inChannel) {
      const state = get(store)
      if (state.results.length > 0) {
        keepSearchSnapshot({
          key: searchKey(state.search, state.filters, state.sort),
          search: state.search,
          filters: state.filters,
          sort: state.sort,
          results: state.results,
          cursor: store.getCursor(),
          total: state.total,
          totalExact: state.totalExact,
          done: state.done,
          scrollTop: divScroll?.scrollTop ?? 0
        })
      }
    }
    store.destroy()
  })

  $: store.setSearch(value)
  $: store.setFilters(filters)
  $: store.setSort(sort)

  $: if ($store.results.length > 0) {
    const key = searchKey($store.search, $store.filters, $store.sort)
    if (scrolledFor !== undefined && scrolledFor !== key && divScroll != null) {
      divScroll.scrollTop = 0
    }
    scrolledFor = key
  }
  $: if (selection >= $store.results.length) selection = 0

  function handleSortSelected (id: unknown): void {
    sort = id as SearchSortOrder
  }

  function handleFiltersChanged (next: ChatSearchFilters): void {
    filters = next
  }

  function open (row: SearchResultRow | undefined): void {
    if (row === undefined) return
    dispatch('select', row)
  }

  function onWindowKeydown (e: KeyboardEvent): void {
    if (e.defaultPrevented) return

    const target = e.target as HTMLElement | null
    if (target?.tagName !== 'INPUT') return
    if (target.closest('.header-search') === null) return

    const count = $store.results.length

    if (e.key === 'ArrowDown' && count > 0) {
      e.preventDefault()
      selection = Math.min(selection + 1, count - 1)
    } else if (e.key === 'ArrowUp' && count > 0) {
      e.preventDefault()
      selection = Math.max(selection - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (count > 0) {
        open($store.results[selection])
      } else {
        store.submit()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (value !== '') {
        value = ''
        store.clear()
      } else {
        dispatch('close')
      }
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

{#if visible}
  <div class="panel" class:in-channel={inChannel}>
    {#if !inChannel}
      <SearchFilterBar
        filters={$store.filters}
        on:change={(e) => {
          handleFiltersChanged(e.detail)
        }}
      >
        <svelte:fragment slot="trailing">
          <ModernDropdown
            items={sortItems}
            selected={$store.sort}
            icon={IconOptions}
            iconSize="small"
            kind={'secondary'}
            size={'small'}
            showDropdownIcon
            on:selected={(e) => {
              handleSortSelected(e.detail)
            }}
          >
            <svelte:fragment slot="content">
              <Label label={sortLabel} />
            </svelte:fragment>
          </ModernDropdown>
        </svelte:fragment>
      </SearchFilterBar>
    {/if}

    {#if $store.total !== undefined && $store.results.length > 0}
      <div class="summary">
        {#if $store.totalExact === false}
          <Label label={chunter.string.SearchResultsCountApprox} params={{ count: $store.total }} />
        {:else}
          <Label label={chunter.string.SearchResultsCount} params={{ count: $store.total }} />
        {/if}
      </div>
    {/if}

    <div class="results">
      <SearchResultsList
        bind:divScroll
        state={$store}
        {selection}
        showChannel={!inChannel}
        maxHeight={inChannel ? 24 : undefined}
        on:select={(e) => {
          open(e.detail)
        }}
        on:hover={(e) => (selection = e.detail)}
        on:loadMore={() => {
          store.loadMore()
        }}
        on:retry={() => {
          store.submit()
        }}
      />
    </div>
  </div>
{/if}

<style lang="scss">
  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .panel.in-channel {
    position: absolute;
    top: 0.75rem;
    left: 1rem;
    right: 1rem;
    height: auto;
    z-index: 11;
    overflow: hidden;
    background-color: color-mix(in srgb, var(--theme-popup-color) 97%, transparent);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--large-BorderRadius);
    box-shadow: var(--theme-popup-shadow);
  }

  .summary {
    padding: 0 1rem 0.5rem;
    font-size: 0.75rem;
    color: var(--theme-darker-color);
  }

  .panel.in-channel .summary {
    padding: 0.75rem 1rem 0.5rem;
  }

  .results {
    flex-grow: 1;
    min-height: 0;
    overflow: hidden;
  }

  .panel.in-channel .results {
    flex: 0 1 auto;
  }

  @media (max-width: 480px) {
    .summary {
      padding: 0 0.75rem 0.5rem;
    }

    .panel.in-channel {
      top: 0;
      left: 0;
      right: 0;
      border-left: none;
      border-right: none;
      border-radius: 0 0 var(--medium-BorderRadius) var(--medium-BorderRadius);
    }

    .panel.in-channel .summary {
      padding: 0.5rem 0.75rem 0.5rem;
    }
  }
</style>
