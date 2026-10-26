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

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import type { IconComponent, IconSize, LabelAndProps } from '../../types'
  import Button from '../button/Button.svelte'
  import type { ButtonEvents } from '../button/types'
  import type {
    SelectButtonChevron,
    SelectButtonJustify,
    SelectButtonKind,
    SelectButtonProps,
    SelectButtonSize
  } from './types'

  type $$Props = SelectButtonProps
  type $$Events = ButtonEvents

  export let kind: SelectButtonKind | undefined = undefined
  export let size: SelectButtonSize | undefined = undefined
  export let label: IntlString | undefined = undefined
  export let labelParams: Record<string, any> = {}
  export let placeholder: IntlString | undefined = undefined
  export let empty: boolean | undefined = undefined
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let iconSize: IconSize | undefined = undefined
  export let chevron: SelectButtonChevron = false
  export let pressed: boolean = false
  export let fullWidth: boolean = false
  export let justify: SelectButtonJustify = 'start'
  export let wrap: boolean = false
  export let disabled: boolean = false
  export let loading: boolean = false
  export let element: HTMLButtonElement | undefined = undefined

  export function focus (): void {
    element?.focus()
  }

  $: isEmpty = empty ?? (label === undefined && !$$slots.default)
  // Nothing to show but the icon: a square button, in the placeholder color while empty.
  $: iconOnly =
    icon !== undefined &&
    chevron === false &&
    placeholder === undefined &&
    (isEmpty || (label === undefined && !$$slots.default))
  // On a colored fill the secondary text color is unreadable: the placeholder keeps the button's own color.
  $: accent = kind === 'primary' || kind === 'brand'
  const notSelectedTooltip: LabelAndProps = { label: ui.string.NotSelected }

  // No text on screen while empty: the name falls back to the tooltip, then to "Not selected".
  $: tooltip = $$restProps.tooltip as LabelAndProps | undefined
  $: unnamed =
    isEmpty &&
    placeholder === undefined &&
    tooltip?.label === undefined &&
    $$restProps['aria-label'] === undefined &&
    $$restProps['aria-labelledby'] === undefined
</script>

<!-- The icon is rendered here, not by Button: its color follows the placeholder. -->
<span
  class="select-button"
  class:select-button--placeholder={isEmpty && !disabled && !accent}
  class:select-button--chevron-hover={chevron === 'hover'}
  class:select-button--pressed={pressed}
  class:select-button--loading={loading}
  class:select-button--full-width={fullWidth}
  class:select-button--center={justify === 'center'}
  class:select-button--wrap={wrap}
>
  {#if iconOnly}
    <Button
      bind:element
      kind={kind ?? 'secondary'}
      size={size ?? 'small'}
      {icon}
      {iconProps}
      {iconSize}
      {disabled}
      {loading}
      hasMenu
      {pressed}
      {...$$restProps}
      tooltip={unnamed ? notSelectedTooltip : tooltip}
      on:click
      on:keydown
      on:focus
      on:blur
    />
  {:else}
    <Button
      bind:element
      kind={kind ?? 'secondary'}
      size={size ?? 'small'}
      {disabled}
      {loading}
      hasMenu
      {pressed}
      {...$$restProps}
      on:click
      on:keydown
      on:focus
      on:blur
    >
      {#if icon !== undefined && !loading}
        <span class="select-button__icon"><Icon {icon} {iconProps} size={iconSize ?? 'small'} /></span>
      {/if}
      {#if !isEmpty && $$slots.default}
        <span class="select-button__value select-button__value--content"><slot /></span>
      {:else}
        <span class="select-button__value">
          {#if isEmpty}
            {#if placeholder !== undefined}
              <Label label={placeholder} />
            {:else}
              <span class="select-button__name">
                <Label label={tooltip?.label ?? ui.string.NotSelected} params={tooltip?.props} />
              </span>
            {/if}
          {:else if label !== undefined}
            <Label {label} params={labelParams} />
          {/if}
        </span>
      {/if}
      {#if chevron !== false}
        <span class="select-button__chevron"><Icon icon={ui.icon.ChevronDown} size="small" /></span>
      {/if}
    </Button>
  {/if}
</span>

<style lang="scss">
  // A grid, so the place stretches or narrows it from a grid wrapper and the value gets the ellipsis.
  .select-button {
    display: inline-grid;
    flex-shrink: 0;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    max-width: 100%;

    &__icon,
    &__chevron {
      display: flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      min-width: var(--spacing-2_5);
      min-height: var(--spacing-2_5);
      // Button's own icon color, inherited by its content
      color: var(--_icon);
    }
    &__value {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      font-weight: 400;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;

      // Markup (avatar and name) truncates its own text.
      &--content {
        display: flex;
        align-items: center;
        gap: var(--spacing-0_75);
        // Room for the avatar status dot, which sits 2px outside the avatar, without moving the content.
        margin: calc(-1 * var(--spacing-0_5));
        padding: var(--spacing-0_5);
      }
    }
    &__chevron {
      margin-left: auto;
    }
    &__name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    // The menu cannot open while loading: the chevron dims with the label, as the menu half of a split button.
    &--loading .select-button__chevron {
      color: var(--_loading-label);
    }

    // By content it keeps its width in a flex row, like Button; the full-width one yields to its neighbours.
    &--full-width {
      display: grid;
      flex-shrink: 1;
      width: 100%;
    }
    // The size keeps the least height; the button grows with the lines.
    &--wrap {
      :global(.button) {
        height: auto;
        padding-top: var(--spacing-0_5);
        padding-bottom: var(--spacing-0_5);
        white-space: normal;
      }
      :global(.button--large) {
        min-height: var(--global-large-Size);
      }
      :global(.button--medium) {
        min-height: var(--global-medium-Size);
      }
      :global(.button--small) {
        min-height: var(--global-small-Size);
      }
      :global(.button--extra-small) {
        min-height: var(--global-extra-small-Size);
      }
      .select-button__value {
        white-space: normal;
      }
    }
    // Only the text moves: the icon stays at the start, the chevron at the end.
    &--center {
      .select-button__value {
        text-align: center;
      }
      .select-button__value--content {
        justify-content: center;
      }
    }
    &--placeholder {
      :global(.button__icon),
      .select-button__icon,
      .select-button__value,
      .select-button__chevron {
        color: var(--global-secondary-TextColor);
      }
    }
    &--chevron-hover {
      .select-button__chevron {
        opacity: 0;
      }
      &:hover,
      &:focus-within,
      &.select-button--pressed {
        .select-button__chevron {
          opacity: 1;
        }
      }
    }
  }
</style>
