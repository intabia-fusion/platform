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
  // Fixed-size box for parts that fill their parent (rail, sidebar, navigator, headers)
  import type { ComponentType } from 'svelte'

  export let component: ComponentType
  export let width: number
  export let height: number
  export let props: Record<string, unknown> = {}
  // Navigator panel parents, as the workbench gives them
  export let nav: boolean = false
</script>

<div class="box" class:nav style:width="{width}px" style:height="{height}px">
  {#if nav}
    <div class="antiPanel-navigator no-print landscape border-left">
      <div class="antiPanel-wrap__content hulyNavPanel-container">
        <svelte:component this={component} {...props} />
      </div>
    </div>
  {:else}
    <svelte:component this={component} {...props} />
  {/if}
</div>

<style lang="scss">
  .box {
    display: flex;
    overflow: hidden;
    background-color: var(--theme-panel-color);
    border: 1px solid var(--theme-divider-color);

    &.nav {
      background-color: var(--theme-navpanel-color);
    }
  }
</style>
