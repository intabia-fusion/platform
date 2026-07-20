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
  import type { Asset, IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, ComponentType } from 'svelte'
  import { getFocusManager } from '../focus'
  import { showPopup } from '../popups'
  import type { AnySvelteComponent, ListItem, TooltipAlignment } from '../types'
  import ModernButton from './ModernButton.svelte'
  import DropdownPopup from './DropdownPopup.svelte'
  import Label from './Label.svelte'
  import Icon from './Icon.svelte'

  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let placeholder: IntlString
  export let items: ListItem[] = []
  export let selected: ListItem | undefined = undefined
  export let disabled: boolean = false

  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let size: 'small' | 'medium' | 'large' = 'large'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let stretchWidth: boolean | undefined = undefined
  export let labelDirection: TooltipAlignment | undefined = undefined
  export let focusIndex = -1
  export let withSearch: boolean = true
  export let showCheckmark = false

  let container: HTMLElement
  let opened: boolean = false

  const dispatch = createEventDispatcher()
  const mgr = getFocusManager()
</script>

<div
  bind:this={container}
  class="modern-dropdown-container"
  class:stretch-width={stretchWidth}
  style:width={stretchWidth ? '100%' : (width ?? 'min-content')}
>
  <ModernButton
    {focusIndex}
    {size}
    {kind}
    {disabled}
    tooltip={label !== undefined ? { label, direction: labelDirection } : undefined}
    on:click={() => {
      if (!opened && !disabled) {
        opened = true
        showPopup(
          DropdownPopup,
          { title: label, items, icon, withSearch, selectedId: showCheckmark ? selected?._id : undefined },
          container,
          (result) => {
            if (result) {
              selected = result
              dispatch('selected', result)
            }
            opened = false
            mgr?.setFocusPos(focusIndex)
          }
        )
      }
    }}
  >
    <div class="dropdown-content-wrapper flex-row-center w-full min-w-0" class:justify-left={justify === 'left'}>
      <span class="overflow-label grow min-w-0">
        {#if selected}
          <span class="flex-row-center flex-gap-1">
            {#if selected.icon}
              <Icon icon={selected.icon} size={'small'} iconProps={selected.iconProps} />
            {/if}
            {selected.label}
          </span>
        {:else}
          <span class="placeholder">
            <Label label={placeholder} />
          </span>
        {/if}
      </span>
    </div>
  </ModernButton>
</div>

<style lang="scss">
  .modern-dropdown-container {
    display: inline-flex;
    min-width: 0;

    &.stretch-width {
      flex: 1;
    }

    :global(.hulyButton) {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      min-width: 0;
      height: 2.25rem;
    }
  }

  .dropdown-content-wrapper {
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;

    &.justify-left {
      text-align: left;
      justify-content: flex-start;
    }
  }

  .placeholder {
    color: var(--input-PlaceholderColor) !important;
  }
</style>
