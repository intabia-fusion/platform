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
  import { getPlatformColorDef, themeStore, type IconSize } from '@hcengineering/ui'
  import AvatarInstance from '../../../../../../plugins/contact-resources/src/components/AvatarInstance.svelte'
  import { paletteIndex } from '../palette'
  import type { Person } from '../types'

  // No person draws the empty assignee avatar
  export let person: Person | undefined = undefined
  // px, one of 20 | 24 | 32 | 40
  export let size: number = 20
  export let status: boolean = false
  export let round: boolean = false

  let element: HTMLElement

  const sizes: Record<number, IconSize> = { 20: 'card', 24: 'x-small', 32: 'small', 40: 'medium' }
  $: colorDef = person === undefined ? undefined : getPlatformColorDef(paletteIndex(person.color), $themeStore.dark)
</script>

<div class="flex-presenter no-pointer">
  <AvatarInstance
    bind:element
    url={undefined}
    srcset={undefined}
    displayName={person?.initials ?? ''}
    size={sizes[size] ?? 'card'}
    variant={round ? 'circle' : 'roundedRect'}
    color={colorDef}
    withStatus={status}
  />
  {#if status}
    <div class="hulyAvatar-statusMarker {sizes[size] ?? 'card'} online" />
  {/if}
</div>
