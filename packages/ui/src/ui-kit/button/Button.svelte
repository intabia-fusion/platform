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
  import type { IntlString } from '@hcengineering/platform'
  import { translateCB } from '@hcengineering/platform'
  import { languageStore } from '@hcengineering/theme'
  import { onMount } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import Spinner from '../../components/Spinner.svelte'
  import { registerFocus } from '../../focus'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { IconComponent, IconSize, LabelAndProps } from '../../types'
  import type { ButtonEvents, ButtonKind, ButtonProps, ButtonShape, ButtonSize, ButtonType } from './types'

  type $$Props = ButtonProps
  type $$Events = ButtonEvents
  interface $$Slots {
    default: Record<string, never>
  }

  export let kind: ButtonKind | undefined = undefined
  export let size: ButtonSize | undefined = undefined
  export let shape: ButtonShape | undefined = undefined
  export let type: ButtonType | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconSize: IconSize | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let loading: boolean = false
  export let disabled: boolean = false
  export let pressed: boolean | undefined = undefined
  export let hasMenu: boolean = false
  export let inheritColor: boolean = false
  export let inheritFont: boolean = false
  export let noPrint: boolean = false
  export let stopPropagation: boolean | undefined = undefined
  export let tooltip: LabelAndProps | undefined = undefined
  export let autofocus: boolean = false
  export let focusIndex: number | undefined = undefined
  export let element: HTMLButtonElement | undefined = undefined

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedKind = kind ?? 'secondary'
  $: resolvedSize = size ?? 'large'
  $: resolvedShape = shape ?? 'rectangle'
  $: resolvedStopPropagation = stopPropagation ?? true
  $: resolvedType = type ?? 'button'

  export function focus (): void {
    element?.focus()
  }

  $: iconOnly = icon !== undefined && label === undefined && !$$slots.default
  $: actualIconSize = iconSize ?? (iconOnly || hasMenu ? 'small' : 'medium')

  // Primitive dependencies: a tooltip object recreated by the parent or a theme change must not re-translate.
  $: accessibleLabel = iconOnly ? tooltip?.label : undefined
  $: accessibleLabelParams = tooltip?.props
  $: translateAccessibleLabel(
    accessibleLabel,
    accessibleLabelParams,
    $languageStore === '' ? undefined : $languageStore
  )

  let accessibleName: string | undefined

  function translateAccessibleLabel (
    label: IntlString | undefined,
    params: Record<string, any> | undefined,
    language: string | undefined
  ): void {
    if (label === undefined) {
      accessibleName = undefined
      return
    }
    translateCB(label, params ?? {}, language, (text) => {
      accessibleName = text
    })
  }

  const { idx, focusManager } = registerFocus(focusIndex ?? -1, {
    focus: () => {
      if (disabled || element === undefined) return false
      element.focus()
      return true
    },
    isFocus: () => document.activeElement === element
  })
  $: if (idx !== -1) focusManager?.updateFocus(idx, focusIndex ?? -1)

  function handleClick (event: MouseEvent): void {
    if (!resolvedStopPropagation) return
    event.stopPropagation()
    if (resolvedType === 'button') event.preventDefault()
  }

  function handleFocus (): void {
    if (idx !== -1) focusManager?.setFocus(idx)
  }

  onMount(() => {
    if (autofocus) element?.focus()
  })
</script>

<button
  bind:this={element}
  class="button button--{resolvedKind} button--{resolvedSize} button--{resolvedShape}"
  class:button--icon-only={iconOnly}
  class:button--menu={hasMenu}
  class:button--pressed={pressed === true}
  class:button--loading={loading}
  class:button--inherit-color={inheritColor}
  class:button--inherit-font={inheritFont}
  class:button--no-print={noPrint}
  type={resolvedType}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  aria-pressed={hasMenu ? undefined : pressed}
  aria-haspopup={hasMenu ? 'true' : undefined}
  aria-expanded={hasMenu ? pressed === true : undefined}
  aria-label={accessibleName}
  use:tooltipAction={tooltip}
  on:focus={handleFocus}
  on:focus
  on:blur
  on:click={handleClick}
  on:click
  on:keydown
  {...$$restProps}
>
  {#if loading}
    <span class="button__icon"><Spinner size="small" /></span>
  {:else if icon !== undefined}
    <span class="button__icon"><Icon {icon} {iconProps} size={actualIconSize} /></span>
  {/if}
  {#if label !== undefined}
    <span class="button__label"><Label {label} params={labelParams} /></span>
  {/if}
  <slot />
</button>

<style lang="scss">
  .button {
    display: inline-flex;
    flex-shrink: 0;
    justify-content: center;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
    border: 1px solid var(--_border);
    background-color: var(--_bg);
    font-family: var(--font-family);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1rem;
    white-space: nowrap;
    color: var(--_label);
    cursor: pointer;

    // Clicks always target the button itself, whatever the icon or slot renders.
    & > :global(*) {
      pointer-events: none;
    }

    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: 2px;
    }
    &:not(:disabled) {
      &:hover {
        background-color: var(--_bg-hover);
      }
      &:active,
      &.button--pressed {
        background-color: var(--_bg-active);
      }
    }

    &__icon {
      display: flex;
      justify-content: center;
      align-items: center;
      min-width: var(--spacing-2_5);
      min-height: var(--spacing-2_5);
      color: var(--_icon);
      // The spinner stands in for the icon: icon color unless the kind sets its own.
      --spinner-color: var(--_spinner, var(--_icon));
    }

    // Kinds
    &--primary {
      --_border: var(--button-primary-BorderColor, transparent);
      --_bg: var(--button-primary-BackgroundColor);
      --_bg-hover: var(--button-primary-hover-BackgroundColor);
      --_bg-active: var(--button-primary-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-accent-IconColor);
      --_label: var(--button-accent-LabelColor);
      --_loading-label: var(--button-primary-loading-LabelColor);
      --_spinner: var(--button-primary-loading-IconColor);
    }
    &--secondary {
      --_border: var(--button-secondary-BorderColor, transparent);
      --_bg: var(--button-secondary-BackgroundColor);
      --_bg-hover: var(--button-secondary-hover-BackgroundColor);
      --_bg-active: var(--button-secondary-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-subtle-IconColor);
      --_label: var(--button-subtle-LabelColor);
      --_loading-label: var(--button-disabled-LabelColor);
    }
    &--tertiary {
      --_border: transparent;
      --_bg: transparent;
      --_bg-hover: var(--button-tertiary-hover-BackgroundColor);
      --_bg-active: var(--button-tertiary-active-BackgroundColor);
      --_disabled-bg: transparent;
      --_icon: var(--button-tertiary-icon-IconColor, var(--button-tertiary-IconColor, var(--button-subtle-IconColor)));
      --_label: var(--button-tertiary-LabelColor, var(--button-subtle-LabelColor));
      --_loading-label: var(--button-disabled-LabelColor);
    }
    &--negative {
      --_border: var(--button-negative-BorderColor, transparent);
      --_bg: var(--button-negative-BackgroundColor);
      --_bg-hover: var(--button-negative-hover-BackgroundColor);
      --_bg-active: var(--button-negative-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-negative-IconColor);
      --_label: var(--button-negative-LabelColor);
      --_loading-label: var(--button-negative-loading-LabelColor);
    }

    // Sizes
    &--large,
    &--medium {
      padding: 0 var(--spacing-2);
      border-radius: var(--medium-BorderRadius);
    }
    &--small,
    &--extra-small {
      gap: var(--spacing-0_5);
      padding: 0 var(--spacing-1);
    }
    &--large {
      height: var(--global-large-Size);
    }
    &--medium {
      height: var(--global-medium-Size);
    }
    &--small {
      height: var(--global-small-Size);
      border-radius: var(--small-BorderRadius);
    }
    &--extra-small {
      height: var(--global-extra-small-Size);
      border-radius: var(--extra-small-BorderRadius);
    }
    &--min {
      width: var(--global-min-Size);
      height: var(--global-min-Size);
      padding: 0;
      border-width: 0;
      border-radius: var(--min-BorderRadius);
    }
    &--round:not(.button--min) {
      border-radius: var(--large-BorderRadius);
    }

    // Content
    &--icon-only {
      padding: 0;
      aspect-ratio: 1;
    }

    // States: after kinds, so they override the kind tokens
    &--loading {
      --_label: var(--_loading-label);
      background-color: var(--_bg-active);
      cursor: default;
    }
    &:disabled:not(.button--loading) {
      --_border: transparent;
      --_icon: var(--button-disabled-IconColor);
      --_label: var(--button-disabled-LabelColor);
      background-color: var(--_disabled-bg);
      cursor: not-allowed;
    }
    &--inherit-color {
      --_icon: currentColor;
      color: inherit;
    }
    &--inherit-font {
      font: inherit;
    }
    &--no-print {
      @media print {
        display: none;
      }
    }
  }
</style>
