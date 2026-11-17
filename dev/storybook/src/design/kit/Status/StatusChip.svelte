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
  import Icon from '../Icon.svelte'
  import type { Status } from '../types'
  import StatusIcon from './StatusIcon.svelte'

  export let status: Status
  export let count: number | undefined = undefined
  // Drag handle before the icon, for the column editor
  export let draggable: boolean = false
  // Fills the row and sits on a popup surface instead of the tinted chip
  export let block: boolean = false
  // Rounded chip on a popup surface, as in the statuses tooltip of a board column
  export let pill: boolean = false
  // px; the content width when absent
  export let width: number | undefined = undefined
</script>

<div class="kit-status-chip" class:block class:pill style:width={width !== undefined ? `${width}px` : undefined}>
  {#if draggable}<Icon name="drag" size={14} color="var(--theme-darker-color)" />{/if}
  <StatusIcon {status} size="x-small" />
  <span class="name">{status.name}</span>
  {#if count !== undefined}<span class="count">{count}</span>{/if}
</div>

<style lang="scss">
  .kit-status-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    box-sizing: border-box;
    height: 1.25rem;
    padding: 0 0.375rem 0 0.25rem;
    font-size: 0.6875rem;
    color: var(--theme-content-color);
    background-color: var(--theme-button-hovered);
    border-radius: 0.25rem;

    &.block {
      display: flex;
      height: 2rem;
      font-size: 0.8125rem;
      background-color: var(--theme-popup-color);
      border: 1px solid var(--theme-button-border);
    }
    &.pill {
      height: 1.5rem;
      padding: 0 0.5rem 0 0.375rem;
      font-size: 0.75rem;
      background-color: var(--theme-popup-color);
      border: 1px solid var(--theme-button-border);
      border-radius: 0.75rem;
    }
    .count {
      color: var(--theme-darker-color);
    }
  }
  .kit-status-chip:not(.pill) .name + .count {
    margin-left: 0.25rem;
  }
</style>
