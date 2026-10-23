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
  // Widget bar at the right edge of the workbench
  import type { AppEntry } from '../types'
  import AppItem from './AppItem.svelte'

  export let widgets: AppEntry[] = []
</script>

<div class="widgets-root">
  <div class="widgets-block">
    {#each widgets as widget}
      <AppItem icon={widget.icon} label={widget.label ?? widget.icon} selected={widget.selected} size="small" />
    {/each}
  </div>
</div>

<style lang="scss">
  .widgets-root {
    display: flex;
    flex-direction: column;
    padding-block: var(--spacing-2);
    height: 100%;
    width: 3.5rem;
    min-width: 3.5rem;
    max-width: 3.5rem;
    background-color: var(--theme-navpanel-color);
    border-radius: 0 var(--medium-BorderRadius) var(--medium-BorderRadius) 0;
    overflow-y: auto;
  }
  .widgets-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
</style>
