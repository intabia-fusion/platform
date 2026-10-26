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
  // Icon by name, shared by every kit component: hand-drawn kit icon, product sprite, ui kit sprite or ui icon.
  import { getMetadata, type Asset } from '@hcengineering/platform'
  import ui from '@hcengineering/ui'

  import { spriteAssets } from '../setup'
  import { kitIcons } from './icons'
  import type { IconName } from './types'

  export let name: IconName
  export let size: number = 16
  // CSS color; the text color when absent
  export let color: string | undefined = undefined

  // 'ui/<File>' is a Svelte icon of packages/ui, as the Penpot kit names them
  const uiIcons = import.meta.glob<any>('../../../../../packages/ui/src/components/icons/*.svelte', {
    eager: true,
    import: 'default'
  })

  // 'kit/<Key>' is a symbol of the ui kit sprite
  $: asset = name.startsWith('kit/')
    ? (ui.icon as Record<string, Asset>)[name.slice(4)]
    : spriteAssets.get(name.toLowerCase())
  $: href = asset !== undefined ? getMetadata<string>(asset as any) : undefined
  $: component = name.startsWith('ui/')
    ? uiIcons[`../../../../../packages/ui/src/components/icons/${name.slice(3)}.svelte`]
    : undefined
</script>

{#if kitIcons[name] !== undefined}
  <svg
    class="kit-icon"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={color ?? 'currentColor'}
    stroke-width="1.3"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup of kitIcons, no user input -->
    {@html kitIcons[name]}
  </svg>
{:else if component !== undefined}
  <span class="kit-icon" style:width="{size}px" style:height="{size}px" style:color>
    <svelte:component this={component} size="small" />
  </span>
{:else if href !== undefined}
  <svg class="kit-icon" width={size} height={size} style:color fill="currentColor"><use {href} /></svg>
{:else}
  <svg class="kit-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color ?? 'currentColor'}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke-dasharray="2 2" />
  </svg>
{/if}

<style>
  .kit-icon {
    display: inline-flex;
    flex-shrink: 0;
  }
</style>
