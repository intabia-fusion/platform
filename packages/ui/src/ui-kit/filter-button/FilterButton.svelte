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
  import { createEventDispatcher, onDestroy } from 'svelte'

  import FilterCategoryPopup from '../../components/FilterCategoryPopup.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import { eventToHTMLElement, showPopup, type PopupResult } from '../../popups'
  import IconButton from '../button/IconButton.svelte'
  import SelectButton from '../select-button/SelectButton.svelte'
  import type {
    FilterButtonActiveFilter,
    FilterButtonCategory,
    FilterButtonEvents,
    FilterButtonIndicator,
    FilterButtonKind,
    FilterButtonProps,
    FilterButtonSize
  } from './types'

  type $$Props = FilterButtonProps
  type $$Events = FilterButtonEvents

  export let categories: FilterButtonCategory[]
  export let activeFilters: FilterButtonActiveFilter[] = []
  export let kind: FilterButtonKind | undefined = undefined
  export let size: FilterButtonSize | undefined = undefined
  export let indicator: FilterButtonIndicator = 'count'
  export let disabled: boolean = false

  const dispatch = createEventDispatcher<{ change: FilterButtonActiveFilter[] }>()

  let popup: PopupResult | undefined
  let opened = false
  let trigger: HTMLButtonElement | undefined

  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'small'
  $: count = activeFilters.length

  function setFilter (filter: FilterButtonActiveFilter): void {
    dispatch('change', [...activeFilters.filter((it) => it.categoryId !== filter.categoryId), filter])
  }

  function clearCategory (categoryId: string): void {
    dispatch(
      'change',
      activeFilters.filter((it) => it.categoryId !== categoryId)
    )
  }

  function reset (): void {
    dispatch('change', [])
    // The reset disappears with the filters: the focus stays on the button instead of falling to the page.
    trigger?.focus()
  }

  function open (event: MouseEvent): void {
    if (opened) return
    opened = true
    popup = showPopup(
      FilterCategoryPopup,
      {
        categories,
        activeFilters,
        onFilterChange: setFilter,
        onFilterRemove: clearCategory
      },
      eventToHTMLElement(event),
      () => {
        popup = undefined
        opened = false
      }
    )
  }

  onDestroy(() => {
    popup?.close()
  })
</script>

<span
  class="filter-button filter-button--{resolvedSize}"
  class:filter-button--active={count > 0}
  class:filter-button--dot={count > 0 && indicator === 'dot'}
  role="group"
>
  <SelectButton
    bind:element={trigger}
    kind={resolvedKind}
    size={resolvedSize}
    icon={ui.icon.Funnel}
    pressed={opened}
    {disabled}
    on:click={open}
  >
    <span class="filter-button__label">
      <Label label={ui.string.Filter} />
      {#if count > 0 && indicator === 'count'}
        <span class="filter-button__count">{count}</span>
      {:else if count > 0}
        <!-- The dot is drawn in CSS: the number stays in the button's name for assistive technology. -->
        <span class="filter-button__hidden-count">{count}</span>
      {/if}
    </span>
  </SelectButton>
  {#if count > 0}
    <span class="filter-button__reset">
      <IconButton
        kind="ghost"
        size="min"
        icon={ui.icon.Cross}
        iconSize="x-small"
        tooltip={{ label: ui.string.ClearFilters }}
        {disabled}
        on:click={reset}
      />
    </span>
  {/if}
</span>

<style lang="scss">
  .filter-button {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;
    align-items: stretch;
    // The button's own side padding for its size; the reset keeps it from the edge.
    --_edge: var(--spacing-1);
    // The count and reset plates grow with the button, but softer than its height: the label keeps one size.
    --_plate: 1rem;
    --_plate-font: 0.6875rem;
    --_plate-gap: var(--spacing-0_5);

    // The label is short and fixed: SelectButton may shrink its value to nothing in a narrow cell.
    & > :global(.select-button) {
      min-width: max-content;
    }

    &__label {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
    }

    // The button stays as grey as the rest of the toolbar: only the indicator takes the accent.
    &__count {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-width: var(--_plate);
      height: var(--_plate);
      padding: 0 var(--spacing-0_5);
      border-radius: var(--extra-small-BorderRadius);
      background-color: color-mix(in srgb, var(--kit-button-primary-BackgroundColor) 16%, transparent);
      font-size: var(--_plate-font);
      font-weight: 500;
      line-height: var(--_plate);
      // Text of the theme mixed in, as in a tint Chip: the digit stays readable on the light plate in both themes.
      color: color-mix(in srgb, var(--kit-button-primary-BackgroundColor) 65%, var(--global-primary-TextColor));
    }

    &__hidden-count {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    :global(.button:disabled) &__count {
      background-color: color-mix(in srgb, currentColor 12%, transparent);
      color: inherit;
    }

    // The ring takes the current fill of the button, so it stays invisible on hover and press.
    &--dot :global(.select-button__icon) {
      position: relative;
      --_ring: var(--_bg);

      &::after {
        content: '';
        position: absolute;
        top: 0.0625rem;
        right: 0.0625rem;
        width: 0.5rem;
        height: 0.5rem;
        border: 1.5px solid var(--_ring);
        border-radius: 50%;
        background-color: var(--kit-button-primary-BackgroundColor);
      }
    }
    &--dot :global(.button:not(:disabled):hover .select-button__icon) {
      --_ring: var(--_bg-hover);
    }
    &--dot :global(.button:not(:disabled):is(:active, .button--pressed) .select-button__icon) {
      --_ring: var(--_bg-active);
    }
    &--dot :global(.button:disabled .select-button__icon) {
      --_ring: var(--_disabled-bg);

      &::after {
        background-color: currentColor;
      }
    }

    // Filters on: the reset sits inside the button, after the count, its plate the size and shape of the count.
    &--large,
    &--medium {
      --_edge: var(--spacing-2);
      --_plate-gap: var(--spacing-0_75);
    }
    &--large {
      --_plate: 1.25rem;
      --_plate-font: 0.75rem;
    }
    &--medium {
      --_plate: 1.125rem;
      --_plate-font: 0.75rem;
    }
    &--extra-small {
      --_plate: 0.875rem;
      --_plate-font: 0.625rem;
    }
    &--active > :global(.select-button .button) {
      padding-right: calc(var(--_edge) + var(--_plate) + var(--_plate-gap));
    }
    &__reset {
      position: absolute;
      top: 50%;
      right: var(--_edge);
      display: inline-flex;
      transform: translateY(-50%);

      & > :global(.button) {
        position: relative;
        width: var(--_plate);
        height: var(--_plate);
        border-radius: var(--extra-small-BorderRadius);
        color: var(--global-secondary-TextColor);
      }
      // The hit area reaches a quarter of a rem beyond the plate.
      & > :global(.button::after) {
        content: '';
        position: absolute;
        inset: calc(-1 * var(--spacing-0_5));
      }
      // Hover and keyboard focus fill only the plate: the click resets, it does not open the popup.
      & > :global(.button:not(:disabled):is(:hover, :focus-visible)) {
        background-color: var(--kit-button-secondary-active-BackgroundColor);
        color: var(--global-primary-TextColor);
      }
      // No offset on the small plate: the kit's 2px offset would stick out of the button.
      & > :global(.button:focus-visible) {
        outline-offset: 0;
      }
    }
  }
</style>
