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
<script lang="ts" generics="Id extends DropdownIntlItem['id'] = DropdownIntlItem['id']">
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import ModernPopup from '../../components/ModernPopup.svelte'
  import ui from '../../plugin'
  import { showPopup, type PopupResult } from '../../popups'
  import { closeTooltip } from '../../tooltips'
  import type { DropdownIntlItem, IconComponent, IconSize, LabelAndProps } from '../../types'
  import Button from '../button/Button.svelte'
  import IconButton from '../button/IconButton.svelte'
  import type { SplitButtonEvents, SplitButtonKind, SplitButtonProps, SplitButtonSize } from './types'

  type $$Props = SplitButtonProps<Id>
  type $$Events = SplitButtonEvents<Id>

  export let kind: SplitButtonKind | undefined = undefined
  export let size: SplitButtonSize | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let tooltip: LabelAndProps | undefined = undefined
  export let loading: boolean = false
  export let disabled: boolean = false
  export let hasMenu: boolean = true
  export let items: Array<DropdownIntlItem<Id>> | undefined = undefined
  export let menuPressed: boolean = false
  export let menuTooltip: LabelAndProps | undefined = undefined
  export let menuIcon: IconComponent = ui.icon.ChevronDown
  export let fill: boolean = false
  export let alignStart: boolean = false
  export let focusIndex: number | undefined = undefined
  export let element: HTMLButtonElement | undefined = undefined

  const dispatch = createEventDispatcher<{ menu: MouseEvent, selected: Id }>()

  let menuElement: HTMLButtonElement | undefined
  let popup: PopupResult | undefined

  // Items are the only dependency: opening the popup must not echo an update right away.
  $: syncItems(items)

  function syncItems (list: Array<DropdownIntlItem<Id>> | undefined): void {
    popup?.update({ items: list ?? [] })
  }

  function openMenu (ev: MouseEvent): void {
    if (items === undefined) {
      dispatch('menu', ev)
      return
    }
    if (popup !== undefined) return
    closeTooltip()
    popup = showPopup(ModernPopup, { items }, menuElement, (result: Id | undefined) => {
      popup = undefined
      if (result !== undefined) dispatch('selected', result)
    })
  }

  onDestroy(() => {
    popup?.close()
  })

  $: menuLabel = { ...menuTooltip, label: menuTooltip?.label ?? ui.string.MoreOptions }
  // An icon-only main button gets the compact look: one contour, so two squares do not read as two buttons.
  $: compact = hasMenu && icon !== undefined && label === undefined && !$$slots.default
</script>

<!-- One control: the halves share the kind and size; an icon-only one also shares the contour. -->
<div
  class="split-button"
  class:split-button--fill={fill}
  class:split-button--start={alignStart}
  class:split-button--joined={hasMenu}
  class:split-button--loading={loading}
  class:split-button--compact={compact}
  class:split-button--ghost={kind === 'ghost'}
>
  <!-- Two branches: passing <slot /> down would always count as content and break an icon-only main button. -->
  {#if $$slots.default}
    <Button
      bind:element
      kind={kind ?? 'secondary'}
      size={size ?? 'large'}
      {label}
      {labelParams}
      {icon}
      {iconSize}
      {iconProps}
      {tooltip}
      {loading}
      {disabled}
      {focusIndex}
      {...$$restProps}
      on:click
    >
      <slot />
    </Button>
  {:else}
    <Button
      bind:element
      kind={kind ?? 'secondary'}
      size={size ?? 'large'}
      {label}
      {labelParams}
      {icon}
      {iconSize}
      {iconProps}
      {tooltip}
      {loading}
      {disabled}
      {focusIndex}
      {...$$restProps}
      on:click
    />
  {/if}
  {#if hasMenu}
    <IconButton
      icon={menuIcon}
      kind={kind ?? 'secondary'}
      size={size ?? 'large'}
      tooltip={menuLabel}
      disabled={disabled && !loading}
      aria-disabled={loading || undefined}
      hasMenu
      bind:element={menuElement}
      pressed={(menuPressed || popup !== undefined) && !loading}
      on:click={(ev) => {
        if (!loading) openMenu(ev)
      }}
    />
  {/if}
</div>

<style lang="scss">
  .split-button {
    display: inline-flex;
    align-items: stretch;
    min-width: 0;
    max-width: 100%;

    &--fill {
      display: flex;
      width: 100%;

      & > :global(.button:first-child) {
        flex: 1 1 auto;
      }
    }
    &--start > :global(.button:first-child) {
      justify-content: flex-start;
    }

    // The ring of a half crosses the seam: above the neighbour it stays whole instead of being cut at the join.
    & > :global(.button:focus-visible) {
      position: relative;
      z-index: 1;
    }

    // With a label the halves keep their own fill and a hairline between; the menu half is a square.
    &--joined {
      gap: 1px;
    }
    &--joined > :global(.button:first-child) {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }
    &--joined > :global(.button:last-child) {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
    // An outline would cross the seam onto the other half: the ring is drawn up to the seam instead.
    &--joined > :global(.button:focus-visible) {
      outline: none;
    }
    &--joined > :global(.button:focus-visible)::after {
      content: '';
      position: absolute;
      inset: -4px;
      border: 2px solid var(--global-focus-BorderColor);
      border-radius: inherit;
      pointer-events: none;
    }
    &--joined > :global(.button:first-child:focus-visible)::after {
      right: 0;
    }
    &--joined > :global(.button:last-child:focus-visible)::after {
      left: 0;
    }

    // Compact: one contour, a short divider in the label color, the menu half narrower than a square.
    &--compact {
      gap: 0;
    }
    &--compact > :global(.button:first-child) {
      border-right-width: 0;
    }
    &--compact > :global(.button:last-child) {
      position: relative;
      border-left-width: 0;
      aspect-ratio: auto;
      width: var(--_menu-width);

      &::before {
        content: '';
        position: absolute;
        top: 25%;
        bottom: 25%;
        left: 0;
        width: 1px;
        background-color: currentColor;
        opacity: 0.25;
      }
    }
    &--compact > :global(.button--extra-large:last-child) {
      --_menu-width: 2.25rem;
    }
    &--compact > :global(.button--large:last-child) {
      --_menu-width: 2rem;
    }
    &--compact > :global(.button--medium:last-child) {
      --_menu-width: 1.75rem;
    }
    &--compact > :global(.button--small:last-child) {
      --_menu-width: 1.5rem;
    }
    &--compact > :global(.button--extra-small:last-child) {
      --_menu-width: 1.25rem;
    }

    // Ghost: no fill to separate the halves, so a short divider does.
    &--ghost {
      gap: 0;
    }
    &--ghost > :global(.button:not(:first-child)) {
      position: relative;

      &::before {
        content: '';
        position: absolute;
        top: 25%;
        bottom: 25%;
        left: 0;
        width: 1px;
        background-color: var(--kit-button-secondary-BorderColor);
      }
    }

    // Dims the menu half like the loading main one; a disabled button would turn grey instead.
    &--loading > :global(.button:last-child:not(:disabled)) {
      --_icon: var(--_loading-label);
      background-color: var(--_bg-active);
      cursor: default;
    }
  }
</style>
