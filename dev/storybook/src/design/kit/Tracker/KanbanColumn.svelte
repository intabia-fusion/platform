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
  import { Scroller } from '@hcengineering/ui'
  import StatusChip from '../Status/StatusChip.svelte'
  import ColumnHeader from './ColumnHeader.svelte'
  import IssueCard from './IssueCard.svelte'
  import type { Column, Density } from '../types'

  export let column: Column
  export let density: Density = 'detailed'
</script>

<div class="kit-kanban-column" data-id="kanban-column">
  <div class="header"><ColumnHeader {column} /></div>
  {#if column.statuses !== undefined}
    <div class="statuses">
      {#each column.statuses as { status, count }}
        <StatusChip {status} {count} />
      {/each}
    </div>
  {/if}
  <Scroller padding="0 13px">
    {#if (column.issues ?? []).length > 0}
      <div class="cards">
        {#each column.issues ?? [] as issue (issue.id)}
          <div class="flex-no-shrink clear-mins" data-id="kanban-card">
            <IssueCard {issue} {density} />
          </div>
        {/each}
      </div>
    {/if}
  </Scroller>
</div>

<style>
  .kit-kanban-column {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 20rem;
    min-height: 0;
    border: 1px solid transparent;
  }
  .header {
    margin: 0 13px 17px;
  }
  .statuses {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0 13px 8px;
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    width: 100%;
    padding: 8px;
    background-color: var(--theme-kanban-card-bg-color);
    border-radius: 8px;
  }
</style>
