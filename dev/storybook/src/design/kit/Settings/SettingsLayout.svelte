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
  // Settings page of the main panel: header with a back link, vertical tabs, optional second-level tabs, content in the slot
  import Button from '../Actions/Button.svelte'
  import Switcher from '../Actions/Switcher.svelte'
  import Icon from '../Icon.svelte'
  import type { IconName } from '../types'

  export let title: string
  export let back: string | undefined = undefined
  export let tabsWidth: number = 240
  export let close: boolean = false
  export let tabs: Array<[string, IconName?]> = []
  export let tab: string | undefined = undefined
  export let subtabs: string[] | undefined = undefined
  export let subtab: string | undefined = undefined
</script>

<div class="kit-settings">
  <div class="head">
    <div class="left">
      {#if back !== undefined}
        <Button kind="ghost" size="small" icon="chevronL" label={back} />
        <div class="sep" />
      {/if}
      <span class="title">{title}</span>
    </div>
    <div class="right">
      <slot name="actions" />
      {#if close}<Button kind="ghost" size="small" icon="x" />{/if}
    </div>
  </div>
  <div class="body">
    <div class="tabs" style:width="{tabsWidth}px">
      {#each tabs as [label, icon]}
        <div class="tab" class:selected={label === tab}>
          {#if icon !== undefined}<Icon name={icon} />{/if}
          {label}
        </div>
      {/each}
    </div>
    <div class="main">
      {#if subtabs !== undefined}
        <div class="subtabs">
          <slot name="subLead" />
          <Switcher items={subtabs} selected={subtab} />
        </div>
      {/if}
      <div class="content"><slot /></div>
    </div>
  </div>
</div>

<style lang="scss">
  .kit-settings {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: 3.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .sep {
    width: 1px;
    height: 1.25rem;
    background-color: var(--theme-divider-color);
  }
  .title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-caption-color);
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .tabs {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 1rem 0.75rem;
    border-right: 1px solid var(--theme-divider-color);
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2rem;
    padding: 0 0.5rem 0 0.625rem;
    color: var(--global-primary-TextColor);
    border-radius: 0.375rem;

    &.selected {
      color: var(--global-accent-TextColor);
      background-color: var(--global-ui-highlight-BackgroundColor);
    }
  }
  .main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .subtabs {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-shrink: 0;
    height: 3rem;
    padding: 0 2rem;
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .content {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    flex: 1;
    min-height: 0;
    padding: 1.5rem 2rem;
    overflow: auto;
  }
</style>
