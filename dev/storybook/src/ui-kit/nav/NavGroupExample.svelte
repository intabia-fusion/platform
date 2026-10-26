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
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import ui from '@hcengineering/ui'
  import { IconButton, NavGroup, NavItem, type NavGroupProps } from '@hcengineering/ui/kit'

  // Storybook adds event_* args for the actions panel: they are not component props.
  export let props: Partial<NavGroupProps> = {}
  $: own = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('event_')))
  export let label: NavGroupProps['label'] = getEmbeddedLabel('Spaces')
  export let width: string = '15rem'
  export let withTools: boolean = false
  export let rows: number = 2
  export let selectedRow: number | undefined = undefined
</script>

<div class="nav-group-example" style:width>
  <NavGroup {label} {...own} {...$$restProps} on:toggle on:select>
    <svelte:fragment slot="tools">
      {#if withTools}
        <IconButton
          icon={ui.icon.Plus}
          kind="ghost"
          size="extra-small"
          tooltip={{ label: getEmbeddedLabel('Create') }}
        />
      {/if}
    </svelte:fragment>
    {#each Array.from({ length: rows }, (_, i) => i + 1) as row}
      <div class="nav-group-example__item">
        <NavItem label={getEmbeddedLabel(`Page ${row}`)} icon={ui.icon.File} selected={row === selectedRow} />
      </div>
    {/each}
  </NavGroup>
</div>

<style lang="scss">
  .nav-group-example {
    padding: var(--spacing-0_5) 0;
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);

    &__item {
      display: flex;
      flex-direction: column;
      margin: 0 var(--spacing-1_5);
    }
  }
</style>
