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
  // Header of a space view (ui Header, doubleRow): view switcher, title or custom title, actions, filter row with extra controls and mode tabs
  import ui, { Button as UiButton, SearchInput } from '@hcengineering/ui'

  import Button from '../Actions/Button.svelte'
  import Switcher from '../Actions/Switcher.svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../types'

  export let view: 'list' | 'board' = 'list'
  export let title: string = ''
  export let titleIcon: IconName = 'kit/CheckSquare'
  export let tabs: string[] = ['All', 'Active', 'Backlog']
  export let tab: string = tabs[0]
  // The slot replaces the title and icon
  export let customTitle: boolean = false
</script>

<div class="kit-space-header">
  <div class="row top">
    <div class="before">
      <Switcher
        items={['kit/BulletList', 'kit/Kanban', 'kit/CircleHalfFill']}
        selected={view === 'list' ? 'kit/BulletList' : 'kit/Kanban'}
      />
      <Button size="small" icon="kit/ArrowUpLines" />
      <Button size="small" icon="kit/SlidersHorizontal" />
    </div>
    <div class="title">
      {#if customTitle}
        <slot name="title" />
      {:else}
        <span class="crumb">
          <span class="crumb-icon"><Icon name={titleIcon} color="var(--global-secondary-TextColor)" /></span>
          <span class="crumb-label">{title}</span>
        </span>
      {/if}
    </div>
    <div class="actions">
      <slot name="actions" />
      <Button size="small" icon="kit/DotsHorizontal" />
    </div>
  </div>
  <div class="row bottom">
    <div class="search">
      <UiButton kind="regular" size="medium" icon={ui.icon.Funnel}>
        <svelte:fragment slot="content"
          ><span class="overflow-label label disabled pointer-events-none">Filter</span></svelte:fragment
        >
      </UiButton>
      <SearchInput collapsed />
      <slot name="filters" />
    </div>
    {#if tabs.length > 0}
      <div class="extra"><Switcher items={tabs} selected={tab} /></div>
    {/if}
  </div>
</div>

<style lang="scss">
  .kit-space-header {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    box-sizing: border-box;
    height: 7rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .row {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    height: 3.5rem;

    &.top {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--theme-divider-color);
    }
    &.bottom {
      justify-content: space-between;
      margin-top: -1px;
    }
  }
  .before,
  .actions,
  .title,
  .search {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .before {
    margin-right: 0.5rem;
  }
  .title {
    flex-grow: 1;
    min-width: 0;
  }
  .actions,
  .search {
    gap: 0.5rem;
  }
  .actions {
    margin-left: 1rem;
  }
  .extra {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-right: -0.25rem;
    padding: 0.25rem;
  }
  .crumb {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0 0.5rem;
    color: var(--global-secondary-TextColor);
  }
  .crumb-label {
    padding: 0.25rem 0;
    font-size: 1rem;
    font-weight: 700;
    line-height: normal;
  }
  .crumb-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0.25rem;
    background-color: var(--global-ui-BackgroundColor);
    border-radius: 0.25rem;
  }
</style>
