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
  import ui, { Icon as UiIcon, themeStore } from '@hcengineering/ui'

  import { categoryColor, paletteDef } from '../palette'
  import StatusIcon from '../Status/StatusIcon.svelte'
  import type { Issue, Status } from '../types'
  import IssueRow from './IssueRow.svelte'
  import { fixedColumns } from './fixedColumns'

  export let name: string
  export let status: Status
  // Total estimation of the group, e.g. "13h"
  export let estimation: string = '0h'
  export let issues: Issue[] = []
  export let collapsed: boolean = false

  fixedColumns()

  $: empty = issues.length === 0
  $: def = paletteDef(status.color ?? categoryColor[status.category], $themeStore.dark)
</script>

<div class="category-container listGrid-container">
  <div
    class="categoryHeader flex-between row noDivide"
    class:collapsed={collapsed || empty}
    style:--header-bg-color={def.background}
  >
    <div class="flex-row-center flex-grow" style:color={def.title}>
      <div class="chevron" class:empty>
        {#if !empty}<UiIcon icon={ui.icon.CaretRightFill} size="small" />{/if}
      </div>
      <div class="flex-presenter"><StatusIcon {status} /><span class="name ml-2">{name}</span></div>
      <span class="antiSection-header__counter ml-2">{issues.length}</span>
      <div class="flex-row-center flex-reverse flex-grow mr-2 gap-2 reverse">
        <span class="estimation">{estimation}</span>
      </div>
    </div>
    <div class="tools" />
  </div>
  {#if !collapsed}
    {#each issues as issue, i (issue.id)}
      <IssueRow {issue} last={i === issues.length - 1} lastCat={i === issues.length - 1} />
    {/each}
  {/if}
</div>

<style lang="scss">
  .categoryHeader {
    position: relative;
    z-index: 10;
    padding: 0 2.5rem 0 0.75rem;
    height: 2.75rem;
    min-height: 2.75rem;
    min-width: 0;
    background: var(--theme-bg-color);
    border-top-left-radius: 0.25rem;
    border-top-right-radius: 0.25rem;

    .chevron {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;
      min-width: 1rem;
      min-height: 1rem;
      margin-right: 0.75rem;
      color: var(--theme-caption-color);
      transform: rotate(90deg);
    }
    .chevron.empty {
      position: relative;

      &::after {
        content: '';
        position: absolute;
        top: 0.375rem;
        left: 0.375rem;
        width: 0.25rem;
        height: 0.25rem;
        background-color: var(--theme-dark-color);
        border-radius: 50%;
      }
    }
    .name {
      font-weight: 500;
    }
    .estimation {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      box-sizing: border-box;
      width: 3rem;
      height: 1.5rem;
      padding-left: 0.5rem;
    }
    .tools {
      flex-shrink: 0;
      width: 4rem;
    }
    &::before,
    &::after {
      position: absolute;
      content: '';
      inset: 0;
      border-top-left-radius: 0.25rem;
      border-top-right-radius: 0.25rem;
      pointer-events: none;
    }
    &::after {
      border: 1px solid var(--theme-list-border-color);
      border-bottom-color: transparent;
    }
    &::before {
      background: var(--header-bg-color);
      z-index: -1;
    }
    &.collapsed {
      border-radius: 0.25rem;
      .chevron {
        transform: rotate(0deg);
      }
      &::before,
      &::after {
        border-radius: 0.25rem;
      }
      &::after {
        border-bottom-color: var(--theme-list-border-color);
      }
    }
  }
</style>
