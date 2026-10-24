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
  import { IconFile, IconMoreH } from '@hcengineering/ui'
  import { IconButton, NavItem, type NavItemProps } from '@hcengineering/ui/kit'

  // Storybook adds event_* args for the actions panel: they are not component props.
  export let props: Partial<NavItemProps> = {}
  $: own = Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('event_')))
  export let label: NavItemProps['label'] = getEmbeddedLabel('Documents')
  export let width: string = '15rem'
  export let withActions: boolean = false
  export let withBadge: boolean = false
  export let children: number = 2
</script>

<div class="nav-item-example" style:width>
  <NavItem {label} {...own} {...$$restProps} on:click on:toggle>
    <svelte:fragment slot="actions">
      {#if withActions}
        <IconButton
          icon={IconMoreH}
          kind="ghost"
          size="extra-small"
          tooltip={{ label: getEmbeddedLabel('More actions') }}
        />
      {/if}
    </svelte:fragment>
    <svelte:fragment slot="badge">
      {#if withBadge}<span class="nav-item-example__badge" />{/if}
    </svelte:fragment>
    <svelte:fragment slot="children">
      {#each Array.from({ length: children }, (_, i) => i + 1) as child}
        <NavItem
          label={getEmbeddedLabel(`Page ${child}`)}
          icon={IconFile}
          level={($$restProps.level ?? props.level ?? 0) + 1}
          expandable
          empty
        />
      {/each}
    </svelte:fragment>
  </NavItem>
</div>

<style lang="scss">
  .nav-item-example {
    padding: var(--spacing-0_5);
    background-color: var(--theme-navpanel-color);
    border-radius: var(--small-BorderRadius);

    &__badge {
      width: 0.5rem;
      height: 0.5rem;
      background-color: var(--button-negative-BackgroundColor);
      border-radius: 50%;
    }
  }
</style>
