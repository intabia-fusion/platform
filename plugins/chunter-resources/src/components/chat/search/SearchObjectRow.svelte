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
  import { Icon, IconCheck } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'

  import { isAvatarObject } from '../../../search/classes'
  import type { PickedObject } from '../../../search/types'
  import SearchObjectIcon from './SearchObjectIcon.svelte'

  export let item: PickedObject
  export let selected: boolean = false

  const dispatch = createEventDispatcher()

  $: isAvatar = isAvatarObject(item._class, item.doc)

  $: identifier = item.identifier !== undefined && item.identifier !== item.title ? item.identifier : ''
</script>

<button
  class="hulyPopup-row withKeys"
  class:selected
  on:click={() => {
    dispatch('toggle', item)
  }}
>
  <div class="hulyPopup-row__icon" class:avatar={isAvatar}>
    {#if item.doc !== undefined}
      <SearchObjectIcon doc={item.doc} avatarSize={'smaller'} />
    {:else if item.icon !== undefined}
      <Icon icon={item.icon} size={'small'} />
    {/if}
  </div>
  <span class="hulyPopup-row__label overflow-label">
    {#if identifier !== ''}
      <span class="identifier">{identifier}</span>
    {/if}
    {item.title}
  </span>
  {#if selected}
    <div class="hulyPopup-row__icon"><IconCheck size={'small'} /></div>
  {/if}
</button>

<style lang="scss">
  // The row sizes its icon slot for a small icon, which an avatar would overflow onto the label.
  .hulyPopup-row__icon.avatar {
    width: auto;
    height: auto;
  }

  .identifier {
    color: var(--theme-darker-color);
    margin-right: 0.375rem;
  }
</style>
