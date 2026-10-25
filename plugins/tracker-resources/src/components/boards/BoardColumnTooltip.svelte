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
  {#each statuses as { status, count } (status._id)}
    <div class="row">
      <IssueStatusIcon value={status} size="x-small" />
      <span class="name">{status.name}</span>
      <span class="count">{count}</span>
    </div>
  {/each}
</div>

<style lang="scss">
  .column-statuses {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.5rem;
  }
  .title {
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.25;
    color: var(--theme-darker-color);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    width: 14.25rem;
    height: 2rem;
    padding: 0 0.375rem 0 0.25rem;
    font-size: 0.8125rem;
    color: var(--theme-content-color);
    background-color: var(--theme-popup-color);
    border: 1px solid var(--theme-button-border);
    border-radius: 0.25rem;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    margin-left: 0.25rem;
    color: var(--theme-darker-color);
  }
</style>
