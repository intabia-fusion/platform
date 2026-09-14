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
  import { Button, Label, Loading, Scroller } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import chunter from '../../../plugin'
  import type { ChatSearchState } from '../../../search/types'
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
{:else if state.failure !== undefined}
  <div class="state">
    <span class="title"><Label label={chunter.string.SearchFailed} /></span>
    {#if state.failure.kind === 'unavailable'}
      <span class="hint"><Label label={chunter.string.SearchUnavailable} /></span>
    {:else}
      <span class="hint">{state.failure.message}</span>
    {/if}
    <div class="mt-2">
      <Button label={chunter.string.SearchRetry} kind={'regular'} on:click={() => dispatch('retry')} />
    </div>
  </div>
{:else if state.results.length === 0 && state.search.trim() === ''}
  <div class="state">
    <span class="title"><Label label={chunter.string.SearchHintTitle} /></span>
    <span class="hint"><Label label={chunter.string.SearchHintTyping} /></span>
  </div>
{:else if state.results.length === 0}
  <div class="state">
    <span class="title"><Label label={chunter.string.SearchNoResultsTitle} /></span>
    <span class="hint"><Label label={chunter.string.SearchNoResultsHint} /></span>
  </div>
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
    {/if}
  </Scroller>
{/if}

<style lang="scss">
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    height: 100%;
    padding: 2rem;
    text-align: center;
  }

  .title {
    font-weight: 500;
    color: var(--theme-caption-color);
    margin-bottom: 0.25rem;
  }

  .hint {
    font-size: 0.8125rem;
    color: var(--theme-darker-color);
  }

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
