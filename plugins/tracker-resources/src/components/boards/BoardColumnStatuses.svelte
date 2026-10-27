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
  import type { Status } from '@hcengineering/core'
  import { Label } from '@hcengineering/ui'
  import tracker from '../../plugin'
  import IssueStatusIcon from '../issues/IssueStatusIcon.svelte'

  export let statuses: { status: Status, count: number }[]
</script>

<div class="column-statuses" data-id="boardColumnStatuses">
  <span class="title"><Label label={tracker.string.ColumnStatuses} /></span>
  <div class="chips">
    {#each statuses as { status, count } (status._id)}
      <div class="chip">
        <IssueStatusIcon value={status} size="x-small" />
        <span class="name">{status.name}</span>
        <span class="count">{count}</span>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .column-statuses {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-sizing: border-box;
    max-width: 22rem;
    padding: var(--spacing-1_5);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-popup-divider);
    border-radius: var(--medium-BorderRadius);
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.15);
  }
  .title {
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.25;
    color: var(--theme-darker-color);
  }
  // As many chips as fit a line, the rest wrap to the next lines
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    max-width: 100%;
    height: 1.5rem;
    padding: 0 0.5rem 0 0.375rem;
    font-size: 0.75rem;
    color: var(--theme-content-color);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.75rem;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--theme-darker-color);
  }
</style>
