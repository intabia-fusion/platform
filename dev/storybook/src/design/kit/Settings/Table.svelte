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
  import type { TableColumn } from '../types'

  export let columns: TableColumn[]
  // Cells are plain text or custom content; the cell slot draws the custom ones
  export let rows: Array<Array<string | object>>
</script>

<div class="kit-table" style:width="{columns.reduce((sum, c) => sum + c.width, 0)}px">
  <div class="row head">
    {#each columns as column}
      <div class="cell" style:width="{column.width}px">{column.title}</div>
    {/each}
  </div>
  {#each rows as row}
    <div class="row">
      {#each row as cell, i}
        <div class="cell body" style:width="{columns[i].width}px">
          {#if typeof cell === 'string'}{cell}{:else}<slot name="cell" {cell} />{/if}
        </div>
      {/each}
    </div>
  {/each}
</div>

<style lang="scss">
  .kit-table {
    box-sizing: border-box;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.5rem;
    overflow: hidden;
  }
  .row {
    display: flex;
    align-items: center;
    border-top: 1px solid var(--theme-divider-color);

    &.head {
      height: 2.25rem;
      border-top: none;
      background-color: var(--theme-list-row-color);
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-dark-color);
    }
  }
  .cell {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
    box-sizing: border-box;
    padding: 0 0.75rem;
    flex-shrink: 0;

    &.body {
      min-height: 2.75rem;
      padding-block: 0.375rem;
    }
  }
</style>
