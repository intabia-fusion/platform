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
  import type { SearchSortOrder } from '@hcengineering/core'

  import { BrowserTab, createLinkSearchStore, placeFilters, type LinkRow } from '../../../../search/attachments'
  import { groupByMonth, shownOrder } from '../../../../search/browser'
  import type { ChatSearchFilters } from '../../../../search/types'
  import { openMessage } from '../../../../search/viewer'
  import BrowserList from './BrowserList.svelte'
  import LinkCard from './LinkCard.svelte'
  import MonthHeader from './MonthHeader.svelte'

  export let value: string = ''
  export let filters: ChatSearchFilters = {}
  export let sort: SearchSortOrder = 'date-desc'

  // Created with what is already chosen, so the first page is the only request on opening.
  const store = createLinkSearchStore({ search: value, filters, sort })

  $: store.setFilters(filters)

  // Assigned only when the results change: a loading flag alone must not group the list again.
  let rows: LinkRow[] = []
  $: if ($store.results !== rows) rows = $store.results
  $: groups = groupByMonth(rows, shownOrder($store.sort, $store.searched.trim()))
  // The same rules the request goes by: a filter that changes nothing does not count.
  $: filtered = Object.keys(placeFilters(filters)).length > 0
</script>

<BrowserList {store} tab={BrowserTab.Links} bind:value bind:filters bind:sort {filtered}>
  {#each groups as group (group.key)}
    <section class="group">
      <MonthHeader month={group.month} />
      <div class="cards">
        {#each group.rows as { row } (row._id)}
          <LinkCard {row} on:message={() => openMessage(row)} />
        {/each}
      </div>
    </section>
  {/each}
</BrowserList>

<style lang="scss">
  .group {
    display: flex;
    flex-direction: column;
  }

  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.875rem;
    padding-bottom: 0.5rem;
  }

  // A link card needs the width for its text.
  @media (max-width: 480px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
    }
  }
</style>
