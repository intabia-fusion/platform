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
  import { BlankView, IconSearch, Loading, Scroller } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import type { ChatSearchState } from '../../../search/types'
  import SearchFailureState from './SearchFailureState.svelte'
  import SearchResultItem from './SearchResultItem.svelte'
  import VirtualRow from './VirtualRow.svelte'

  export let state: ChatSearchState
  export let selection: number = 0
  export let showChannel: boolean = true
  export let maxHeight: number | undefined = undefined
  export let divScroll: HTMLElement | undefined | null = undefined

  // A one line message; `VirtualRow` measures the real height before collapsing a row, so this
  // is only the guess for a row that has never been on screen.
  const ESTIMATED_ROW_HEIGHT = 64

  const dispatch = createEventDispatcher()

  function handleScroll (): void {
    if (divScroll == null || state.done || state.loadingMore) return
    if (divScroll.scrollTop + divScroll.clientHeight >= divScroll.scrollHeight - 400) {
      dispatch('loadMore')
    }
  }
</script>

{#if state.loading && state.results.length === 0}
  <Loading />
{:else if state.failure != null && state.results.length === 0}
  <SearchFailureState failure={state.failure} on:retry={() => dispatch('retry')} />
{:else if state.results.length === 0 && state.search.trim() === ''}
  <BlankView icon={IconSearch} header={chunter.string.SearchHintTitle} label={chunter.string.SearchHintTyping} />
{:else if state.results.length === 0}
  <BlankView
    icon={IconSearch}
    header={chunter.string.SearchNoResultsTitle}
    label={chunter.string.SearchNoResultsHint}
  />
{:else}
  <Scroller bind:divScroll onScroll={handleScroll} {maxHeight}>
    {#each state.results as row, index (row._id)}
      <VirtualRow estimatedHeight={ESTIMATED_ROW_HEIGHT}>
        <div
          class="row"
          class:selected={index === selection}
          tabindex="-1"
          role="button"
          on:click={() => dispatch('select', row)}
          on:keydown={(e) => {
            if (e.key === 'Enter') dispatch('select', row)
          }}
          on:mouseover={() => dispatch('hover', index)}
          on:focus={() => dispatch('hover', index)}
        >
          <SearchResultItem {row} {showChannel} />
        </div>
      </VirtualRow>
    {/each}
    {#if state.loadingMore}
      <div class="more"><Loading shrink /></div>
    {:else if state.failure != null}
      <SearchFailureState failure={state.failure} inline on:retry={() => dispatch('retry')} />
    {/if}
  </Scroller>
{/if}

<style lang="scss">
  .row {
    cursor: pointer;
    border-radius: 0.25rem;

    &:hover,
    &.selected {
      background-color: var(--theme-bg-accent-color);
    }
  }

  .more {
    padding: 1rem;
  }
</style>
