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
  import { themeStore } from '@hcengineering/ui'
  import Button from '../Actions/Button.svelte'
  import { categoryColor, paletteDef } from '../palette'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import type { Column } from '../types'

  export let column: Column

  $: def = paletteDef(column.status.color ?? categoryColor[column.status.category], $themeStore.dark)
</script>

<div class="kit-column-header" class:over={column.over} style:background={def.background}>
  <div class="title">
    <StatusIcon status={column.status} />
    <span class="name" style:color={def.title}>{column.name}</span>
    <span class="counter">{column.count}</span>
    {#if column.limit !== undefined}<span class="limit">/ {column.limit}</span>{/if}
  </div>
  {#if column.action !== undefined}
    <Button size="extra-small" icon={column.action.icon} label={column.action.label} />
  {/if}
  {#if column.tools === true}
    <div class="tools">
      <Button kind="ghost" size="small" icon="chevronR" />
      <Button kind="ghost" size="small" icon="merge" />
      <Button kind="ghost" size="small" icon="plus" />
    </div>
  {/if}
</div>

<style lang="scss">
  .kit-column-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    width: 100%;
    height: 2.5rem;
    padding: 0 0.5rem 0 1.25rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;

    &.over .limit {
      color: var(--theme-state-negative-color);
    }
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .name {
    font-weight: 500;
  }
  .counter {
    color: var(--theme-dark-color);
  }
  .limit {
    color: var(--theme-darker-color);
  }
  .tools {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    display: flex;
    gap: 0.25rem;
    background-color: inherit;
    border-radius: 0.25rem;
  }
</style>
