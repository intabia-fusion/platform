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
  import type { Asset } from '@hcengineering/platform'
  import { IconWithEmoji } from '@hcengineering/presentation'
  import { Icon, getPaletteColorDef, getPlatformColorForTextDef, themeStore } from '@hcengineering/ui'
  import type { Project } from '@hcengineering/tracker'
  import view from '@hcengineering/view'

  // The project icon in its color; the place opens the picker on click
  export let icon: Asset
  export let color: Project['color']
  export let name: string
  export let id: string | undefined = undefined
  // Shown, not chosen: no picker on click
  export let readonly: boolean = false
  // Only the icon, without the tile: a project inline in text
  export let plain: boolean = false

  $: emoji = icon === view.ids.IconWithEmoji
  $: iconProps = emoji
    ? { icon: color, size: 'small' }
    : {
        fill:
          getPaletteColorDef(color, $themeStore.dark)?.icon ?? getPlatformColorForTextDef(name, $themeStore.dark).icon
      }
</script>

{#if plain}
  <Icon icon={emoji ? IconWithEmoji : icon} {iconProps} size="small" />
{:else if readonly}
  <div {id} class="icon-tile readonly">
    <Icon icon={emoji ? IconWithEmoji : icon} {iconProps} size="small" />
  </div>
{:else}
  <button {id} type="button" class="icon-tile" on:click>
    <Icon icon={emoji ? IconWithEmoji : icon} {iconProps} size="small" />
  </button>
{/if}

<style lang="scss">
  .icon-tile {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 2rem;
    height: 2rem;
    padding: 0;
    background-color: var(--theme-button-hovered);
    border: 1px solid var(--primary-button-default);
    border-radius: 0.375rem;
    cursor: pointer;

    &.readonly {
      cursor: default;
    }
    &:focus-visible {
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
    }
  }
</style>
