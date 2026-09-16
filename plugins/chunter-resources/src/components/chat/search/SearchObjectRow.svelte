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
  import contact from '@hcengineering/contact'
  import chunterPlugin from '@hcengineering/chunter'
  import { getClient } from '@hcengineering/presentation'
  import { Icon, IconCheck, type IconSize } from '@hcengineering/ui'
  import { ObjectIcon } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import type { PickedObject } from '../../../search/types'

  export let item: PickedObject
  export let selected: boolean = false

  const dispatch = createEventDispatcher()
  const hierarchy = getClient().getHierarchy()

  let iconSize: IconSize
  $: iconSize =
    hierarchy.isDerived(item._class, chunterPlugin.class.DirectMessage) ||
    hierarchy.isDerived(item._class, contact.class.Person)
      ? 'tiny'
      : 'small'
</script>

<button
  class="hulyPopup-row withKeys"
  class:selected
  on:click={() => {
    dispatch('toggle', item)
  }}
>
  <div class="hulyPopup-row__icon">
    {#if item.doc !== undefined}
      <ObjectIcon value={item.doc} size={iconSize} />
    {:else if item.icon !== undefined}
      <Icon icon={item.icon} size={'small'} />
    {/if}
  </div>
  <span class="hulyPopup-row__label overflow-label">
    {#if item.identifier !== undefined && item.identifier !== ''}
      <span class="identifier">{item.identifier}</span>
    {/if}
    {item.title}
  </span>
  {#if selected}
    <div class="hulyPopup-row__icon"><IconCheck size={'small'} /></div>
  {/if}
</button>

<style lang="scss">
  .identifier {
    color: var(--theme-darker-color);
    margin-right: 0.375rem;
  }
</style>
