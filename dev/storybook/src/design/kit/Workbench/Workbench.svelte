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
  // Visual workbench frame: status bar with the open tab, application rail, navigator, content panel, optional side panel and widget bar
  import type { AppEntry, IconName, Person } from '../types'
  import AppRail from './AppRail.svelte'
  import Sidebar from './Sidebar.svelte'
  import TopBar from './TopBar.svelte'

  export let workspace: string
  export let tab: { label: string, icon: IconName }
  export let apps: AppEntry[] = []
  export let widgets: AppEntry[] = []
  export let account: Person
  // A side panel next to the content, filled through the panel slot
  export let panel: boolean = false
</script>

<div class="mock-root">
  <TopBar {tab} />
  <div class="app">
    <div class="workbench-container apps-vertical">
      <AppRail {workspace} {apps} {account} />
      <div class="flex-row-center w-full h-full">
        <div class="workbench-container inner">
          <div class="antiPanel-navigator no-print landscape border-left">
            <div class="antiPanel-wrap__content hulyNavPanel-container">
              <slot name="navigator" />
            </div>
          </div>
          <div class="hulyComponent main overflow-hidden" data-id="contentPanel">
            <slot />
          </div>
        </div>
        {#if panel}
          <div class="side-panel">
            <slot name="panel" />
          </div>
        {/if}
        <Sidebar {widgets} />
      </div>
    </div>
  </div>
</div>

<style lang="scss">
  .mock-root {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;

    .app {
      display: flex;
      height: calc(100% - var(--status-bar-height));
    }
  }
  .main {
    flex: 1 1 0;
    min-width: 0;
  }
  // As the product sidebar-wrap__content: flush with the content panel, square, divider before the widget bar
  .side-panel {
    flex: none;
    width: 25rem;
    height: 100%;
    overflow: hidden;
    background-color: var(--theme-panel-color);
    border-right: 1px solid var(--theme-divider-color);
  }

  .workbench-container {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    background-color: var(--theme-panel-color);

    &.inner {
      background-color: var(--theme-navpanel-color);
    }
    &:not(.inner)::after {
      position: absolute;
      content: '';
      inset: 0;
      border: 1px solid var(--theme-divider-color);
      border-radius: var(--medium-BorderRadius);
      pointer-events: none;
    }
  }
</style>
