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
  import { IntlString, Asset } from '@hcengineering/platform'
  import { createEventDispatcher, ComponentType } from 'svelte'

  import type { AnySvelteComponent, DropdownTextItem, IconSize, TooltipAlignment } from '../types'
  import ui from '../plugin'
  import { showPopup } from '../popups'
  import { getFocusManager } from '../focus'
  import ModernButton from './ModernButton.svelte'
  import ButtonIcon from './ButtonIcon.svelte'
  import ModernPopupLabels from './ModernPopupLabels.svelte'
  import Label from './Label.svelte'
  import Icon from './Icon.svelte'
  import DropdownIcon from './icons/Dropdown.svelte'

  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let placeholder: IntlString | undefined = ui.string.SearchDots
  export let items: DropdownTextItem[]
  export let multiselect = false
  export let wrap = false
  export let selected: DropdownTextItem['id'] | Array<DropdownTextItem['id']> | undefined = multiselect ? [] : undefined
  export let allowDeselect: boolean = false
  export let showDropdownIcon: boolean = false
  export let showContent: boolean = true

  export let dataId: string | undefined = undefined
  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let size: 'small' | 'medium' | 'large' = 'large'
  export let iconSize: IconSize | undefined = undefined
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let labelDirection: TooltipAlignment | undefined = undefined
  export let focusIndex = -1
  export let autoSelect: boolean = true
  export let useFlexGrow = false
  export let minW0 = true
  export let disabled: boolean = false
  export let loading: boolean = false
  export let enableSearch: boolean = true

  let container: HTMLElement
  let opened: boolean = false

  $: selectedItem = multiselect
    ? (items ?? []).filter((p) => selected?.includes(p.id))
    : (items ?? []).find((x) => x.id === selected)
  $: if (autoSelect && selected === undefined && items?.[0] !== undefined) {
    selected = multiselect ? [items?.[0]?.id] : items?.[0]?.id
  }

  const dispatch = createEventDispatcher()
  const mgr = getFocusManager()

  function handleClick (): void {
    if (!opened) {
      opened = true
      showPopup(
        ModernPopupLabels,
        { placeholder: ui.string.SearchDots, items, multiselect, selected, enableSearch },
        container,
        (result) => {
          if (result != null) {
            if (allowDeselect && selected === result) {
              selected = undefined
              dispatch('selected', undefined)
            } else {
              selected = result
              dispatch('selected', result)
            }
          }
          opened = false
          mgr?.setFocusPos(focusIndex)
        },
        (result) => {
          if (result != null) {
            selected = result
            dispatch('selected', result)
          }
        }
      )
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  bind:this={container}
  class="modern-dropdown-labels-container"
  class:min-w-0={minW0}
  class:flex-grow={useFlexGrow}
  class:multiselect-wrap={wrap}
  class:icon-only={!showContent}
  style:width={width ?? (wrap ? '100%' : 'min-content')}
>
  {#if showContent}
    <ModernButton
      {focusIndex}
      {icon}
      {size}
      {iconSize}
      {kind}
      {disabled}
      pressed={opened}
      {dataId}
      {loading}
      tooltip={label !== undefined ? { label, direction: labelDirection } : undefined}
      on:click={handleClick}
    >
      <div class="dropdown-content-wrapper flex-row-center w-full min-w-0" class:justify-left={justify === 'left'}>
        <span
          class="content overflow-label grow min-w-0"
          class:mr-2={showDropdownIcon}
          class:content-color={selectedItem === undefined}
        >
          {#if $$slots.content}
            <slot name="content" />
          {:else if Array.isArray(selectedItem)}
            {#if selectedItem.length > 0}
              {#each selectedItem as seleceted}
                <span class="step-row flex-row-center flex-gap-1">
                  {#if seleceted.icon}
                    <Icon icon={seleceted.icon} size="small" iconProps={seleceted.iconProps} />
                  {/if}
                  {seleceted.label}
                </span>
              {/each}
            {:else}
              <span class="placeholder-text">
                <Label label={label ?? placeholder ?? ui.string.NotSelected} />
              </span>
            {/if}
          {:else if selectedItem}
            <span class="flex-row-center flex-gap-1">
              {#if selectedItem.icon}
                <Icon icon={selectedItem.icon} size="small" iconProps={selectedItem.iconProps} />
              {/if}
              {selectedItem.label}
            </span>
          {:else}
            <span class="placeholder-text">
              <Label label={label ?? placeholder ?? ui.string.NotSelected} />
            </span>
          {/if}
        </span>
        {#if showDropdownIcon}
          <div class="dropdown-arrow-icon ml-2 flex-row-center">
            <DropdownIcon
              size="small"
              fill={kind === 'primary' && !disabled ? 'var(--primary-button-content-color)' : 'var(--theme-dark-color)'}
            />
          </div>
        {/if}
      </div>
    </ModernButton>
  {:else if icon}
    <ButtonIcon
      {focusIndex}
      {icon}
      {size}
      {iconSize}
      {kind}
      {disabled}
      pressed={opened}
      {dataId}
      {loading}
      tooltip={label !== undefined ? { label, direction: labelDirection } : undefined}
      on:click={handleClick}
    />
  {/if}
</div>

<style lang="scss">
  .modern-dropdown-labels-container {
    display: inline-flex;
    min-width: 0;

    &:not(.icon-only) {
      :global(.hulyButton) {
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        min-width: 0;
      }
    }
  }

  .dropdown-content-wrapper {
    display: flex;
    align-items: center;
    min-width: 0;
    width: 100%;
    padding: 0.25rem 0;

    &.justify-left {
      text-align: left;
      justify-content: flex-start;
    }
  }

  .content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    row-gap: 0.75rem;
    flex-wrap: wrap;
  }

  .placeholder-text {
    color: var(--input-PlaceholderColor);
  }

  .step-row + .step-row {
    position: relative;
    margin-left: 0.75rem;

    &::before {
      position: absolute;
      content: '';
      top: 50%;
      left: -0.5rem;
      width: 0.25rem;
      height: 0.25rem;
      background-color: var(--dark-color);
      border-radius: 50%;
      transform: translateY(-50%);
    }
  }

  .multiselect-wrap {
    :global(.hulyButton) {
      height: auto !important;
      min-height: 2.25rem;
      padding-top: 0.25rem !important;
      padding-bottom: 0.25rem !important;
    }
    :global(.overflow-label) {
      white-space: normal !important;
      overflow: visible !important;
      text-overflow: unset !important;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.5rem;
    }
    .step-row + .step-row {
      margin-left: 0;
      &::before {
        display: none;
      }
    }
  }
</style>
