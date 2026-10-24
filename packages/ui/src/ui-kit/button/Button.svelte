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
  import { onMount, tick } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import { registerFocus } from '../../focus'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { IconComponent, IconSize, LabelAndProps } from '../../types'
  import Spinner from '../spinner/Spinner.svelte'
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
  export let selected: boolean | undefined = undefined
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
  // A hint shows after a short pause, so moving the pointer across a toolbar does not flash tooltips.
  $: tooltipOptions = tooltip !== undefined ? { timeout: 500, ...tooltip } : undefined

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
  let translation = 0

  function translateAccessibleLabel (
    label: IntlString | undefined,
    params: Record<string, any> | undefined,
    language: string | undefined
  ): void {
    const request = ++translation
    if (label === undefined) {
      accessibleName = undefined
      return
    }
    translateCB(label, params ?? {}, language, (text) => {
      // A slower answer for a previous label must not overwrite the current one.
      if (request === translation) accessibleName = text
    })
  }

  const { idx, focusManager } = registerFocus(focusIndex ?? -1, {
    focus: () => {
      if (disabled || loading || element === undefined) return false
      element.focus()
      return true
    },
    isFocus: () => document.activeElement === element
  })
  $: if (idx !== -1) focusManager?.updateFocus(idx, focusIndex ?? -1)

  // A disabled button drops the focus to the page; give it back once the action finishes, unless it moved on.
  let refocusAfterLoading = false
  $: trackLoading(loading)

  function trackLoading (busy: boolean): void {
    if (busy) {
      if (element !== undefined && document.activeElement === element) refocusAfterLoading = true
      return
    }
    if (!refocusAfterLoading) return
    refocusAfterLoading = false
    void tick().then(() => {
      const active = document.activeElement
      if (active === null || active === document.body) element?.focus({ preventScroll: true })
    })
  }

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
  class:button--selected={selected === true}
  class:button--loading={loading}
  class:button--inherit-color={inheritColor}
  class:button--inherit-font={inheritFont}
  class:button--no-print={noPrint}
  type={resolvedType}
  disabled={disabled || loading}
  aria-busy={loading || undefined}
  aria-pressed={selected}
  aria-haspopup={hasMenu ? 'true' : undefined}
  aria-expanded={hasMenu ? pressed === true : undefined}
  use:tooltipAction={tooltipOptions}
  on:focus={handleFocus}
  on:focus
  on:blur
  on:click={handleClick}
  on:click
  on:keydown
  {...$$restProps}
  aria-label={$$restProps['aria-label'] ?? accessibleName}
>
  {#if loading}
    <span class="button__icon button__icon--spinner"><Spinner size="small" inheritColor /></span>
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
      outline: 0.125rem solid var(--global-focus-BorderColor);
      outline-offset: 0.125rem;
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
    }

    // Kinds
    &--primary {
      --_border: var(--button-primary-BorderColor, transparent);
      --_bg: var(--kit-button-primary-BackgroundColor);
      --_bg-hover: var(--kit-button-primary-hover-BackgroundColor);
      --_bg-active: var(--kit-button-primary-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-accent-IconColor);
      --_label: var(--button-accent-LabelColor);
      // The theme's loading label is blue: on an accent fill it read as a stray link color.
      --_loading-label: color-mix(in srgb, var(--button-accent-LabelColor) 70%, transparent);
    }
    &--brand {
      --_border: var(--button-brand-BorderColor, transparent);
      --_bg: var(--button-brand-BackgroundColor);
      --_bg-hover: var(--button-brand-hover-BackgroundColor);
      --_bg-active: var(--button-brand-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-accent-IconColor);
      --_label: var(--button-accent-LabelColor);
      --_loading-label: color-mix(in srgb, var(--button-accent-LabelColor) 70%, transparent);
    }
    &--secondary {
      --_border: var(--kit-button-secondary-BorderColor, transparent);
      --_bg: var(--kit-button-secondary-BackgroundColor);
      --_bg-hover: var(--kit-button-secondary-hover-BackgroundColor);
      --_bg-active: var(--kit-button-secondary-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--kit-button-subtle-IconColor);
      --_label: var(--kit-button-subtle-LabelColor);
      --_loading-label: var(--button-disabled-LabelColor);
    }
    &--tertiary {
      --_border: transparent;
      --_bg: transparent;
      --_bg-hover: var(--button-tertiary-hover-BackgroundColor);
      --_bg-active: var(--button-tertiary-active-BackgroundColor);
      --_disabled-bg: transparent;
      --_icon: var(
        --button-tertiary-icon-IconColor,
        var(--kit-button-tertiary-IconColor, var(--kit-button-subtle-IconColor))
      );
      --_label: var(--kit-button-tertiary-LabelColor, var(--kit-button-subtle-LabelColor));
      --_loading-label: var(--button-disabled-LabelColor);
    }
    &--ghost {
      --_border: transparent;
      --_bg: transparent;
      --_bg-hover: var(--button-tertiary-hover-BackgroundColor);
      --_bg-active: var(--button-tertiary-active-BackgroundColor);
      --_disabled-bg: transparent;
      // A third darker than the secondary gray: plain gray read as disabled; dark on hover so the target reads.
      // The label follows the icon, so a labelled ghost reads as quiet as the icon-only ones next to it.
      --_icon: color-mix(in srgb, var(--global-secondary-TextColor) 70%, var(--global-primary-TextColor));
      --_label: var(--_icon);
      --_loading-label: var(--button-disabled-LabelColor);

      &:not(:disabled):is(:hover, :active, .button--pressed) {
        --_icon: var(--global-primary-IconColor);
      }
    }
    // The legacy status bar look: a state color on a transparent button, its tint under the pointer.
    &--positive-ghost,
    &--negative-ghost {
      --_border: transparent;
      --_bg: transparent;
      --_disabled-bg: transparent;
      --_label: var(--_icon);
      --_loading-label: var(--button-disabled-LabelColor);
    }
    &--positive-ghost {
      --_bg-hover: var(--theme-state-positive-background-color);
      --_bg-active: var(--theme-state-positive-background-hover);
      --_icon: var(--theme-state-positive-color);

      &:not(:disabled):is(:hover, :active, .button--pressed) {
        --_icon: var(--theme-state-positive-hover);
      }
    }
    &--negative-ghost {
      --_bg-hover: var(--theme-state-negative-background-color);
      --_bg-active: color-mix(in srgb, var(--theme-state-negative-color) 25%, transparent);
      --_icon: var(--theme-state-negative-color);

      &:not(:disabled):is(:hover, :active, .button--pressed) {
        --_icon: var(--theme-state-negative-hover);
      }
    }
    &--positive {
      --_border: var(--button-positive-BorderColor, transparent);
      --_bg: var(--button-positive-BackgroundColor);
      --_bg-hover: var(--button-positive-hover-BackgroundColor);
      --_bg-active: var(--button-positive-active-BackgroundColor);
      --_disabled-bg: var(--button-disabled-BackgroundColor);
      --_icon: var(--button-positive-IconColor);
      --_label: var(--button-positive-LabelColor);
      --_loading-label: var(--button-positive-loading-LabelColor);
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
    // The legacy colors of the list labels next to it; the pill does not change under the pointer, as they do not.
    &--chip {
      --_border: var(--theme-button-border);
      --_bg: var(--theme-list-button-color);
      --_bg-hover: var(--_bg);
      --_bg-active: var(--_bg);
      --_disabled-bg: var(--_bg);
      --_icon: var(--theme-halfcontent-color);
      --_label: var(--theme-content-color);
      --_loading-label: var(--theme-halfcontent-color);
    }
    &--light,
    &--dark {
      --_disabled-icon: var(--_disabled-label);
    }
    &--light {
      --_border: var(--button-light-BorderColor);
      --_bg: var(--button-light-BackgroundColor);
      --_bg-hover: var(--button-light-hover-BackgroundColor);
      --_bg-active: var(--button-light-active-BackgroundColor);
      --_disabled-bg: var(--button-light-disabled-BackgroundColor);
      --_disabled-label: var(--button-light-disabled-LabelColor);
      --_icon: var(--button-light-IconColor);
      --_label: var(--button-light-LabelColor);
      --_loading-label: var(--button-light-loading-LabelColor);
    }
    &--dark {
      --_border: var(--button-dark-BorderColor);
      --_bg: var(--button-dark-BackgroundColor);
      --_bg-hover: var(--button-dark-hover-BackgroundColor);
      --_bg-active: var(--button-dark-active-BackgroundColor);
      --_disabled-bg: var(--button-dark-disabled-BackgroundColor);
      --_disabled-label: var(--button-dark-disabled-LabelColor);
      --_icon: var(--button-dark-IconColor);
      --_label: var(--button-dark-LabelColor);
      --_loading-label: var(--button-dark-loading-LabelColor);
    }

    // Sizes
    // The main action of the login and onboarding screens: bolder, as the legacy form button there.
    &--extra-large {
      height: var(--global-extra-large-Size);
      padding: 0 var(--spacing-3);
      border-radius: var(--medium-BorderRadius);
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.25rem;
    }
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
    // The xs label matches xs fields and chips next to it in a toolbar.
    &--extra-small {
      height: var(--global-extra-small-Size);
      border-radius: var(--extra-small-BorderRadius);
      font-size: 0.75rem;
      line-height: 1rem;
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
    // The pill keeps its own geometry whatever the size: the list row height of the labels.
    &--chip:not(.button--min) {
      gap: 0.375rem;
      height: 1.75rem;
      padding: 0 0.5rem;
      // In a compressed row the pills stack, the next covering the last, as the labels do: a pill never narrows itself.
      min-width: max-content;
      border-radius: 1.5rem;
      font-size: 0.8125rem;
      font-weight: 400;
    }

    // Content
    &--icon-only {
      padding: 0;
      aspect-ratio: 1;
    }

    // States: after kinds, so they override the kind tokens
    // A toggle that is on reads as on, unlike the gray pressed of an open menu; filled kinds keep their fill.
    &--selected:not(:disabled):is(.button--secondary, .button--tertiary, .button--ghost) {
      --_icon: var(--button-selected-IconColor);
      --_label: var(--button-selected-LabelColor);
      background-color: var(--button-selected-BackgroundColor);

      &:hover {
        background-color: var(--button-selected-hover-BackgroundColor);
      }
    }
    &--loading {
      --_label: var(--_loading-label);
      background-color: var(--_bg-active);
      cursor: default;
    }
    &:disabled:not(.button--loading) {
      --_border: transparent;
      // Fixed-color kinds keep a readable label on their own surface whatever the theme.
      --_icon: var(--_disabled-icon, var(--button-disabled-IconColor));
      --_label: var(--_disabled-label, var(--button-disabled-LabelColor));
      background-color: var(--_disabled-bg);
      cursor: not-allowed;
    }
    // A read-only value in a list row stays a readable pill.
    &--chip:disabled:not(.button--loading) {
      --_border: var(--theme-button-border);
      --_icon: var(--theme-halfcontent-color);
      --_label: var(--theme-content-color);
      cursor: default;
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
