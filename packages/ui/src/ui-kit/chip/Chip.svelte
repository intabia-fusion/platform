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
  import { createEventDispatcher } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import { tooltip as tooltipAction } from '../../tooltips'
  import type { IconComponent, LabelAndProps, TooltipWithLabel } from '../../types'
  import IconButton from '../button/IconButton.svelte'
  import type { ChipEvents, ChipKind, ChipProps, ChipSize, ChipTone } from './types'

  type $$Props = ChipProps
  type $$Events = ChipEvents

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let size: ChipSize | undefined = undefined
  export let kind: ChipKind | undefined = undefined
  export let color: string | undefined = undefined
  export let tone: ChipTone | undefined = undefined
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let removable: boolean = false
  export let tooltip: LabelAndProps | undefined = undefined

  const dispatch = createEventDispatcher<{ remove: null }>()
  const removeTooltip: TooltipWithLabel = { label: ui.string.Remove }

  let removeButton: IconButton | undefined

  // Several removable chips sit side by side: each remove button is named after its own value.
  $: translateRemoveName(removable ? label : undefined, labelParams, $languageStore === '' ? undefined : $languageStore)

  let removeName: string | undefined
  let translation = 0

  function translateRemoveName (
    label: IntlString | undefined,
    params: Record<string, any> | undefined,
    language: string | undefined
  ): void {
    const request = ++translation
    if (label === undefined) {
      removeName = undefined
      return
    }
    translateCB(label, params ?? {}, language, (text) => {
      // A slower answer for a previous label must not overwrite the current one.
      if (request !== translation) return
      translateCB(ui.string.RemoveItem, { label: text }, language, (name) => {
        if (request === translation) removeName = name
      })
    })
  }

  export function focus (): void {
    removeButton?.focus()
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    event.preventDefault()
    dispatch('remove', null)
  }
</script>

<span
  class="chip chip--{tone !== undefined ? `tone-${tone}` : (kind ?? 'tint')} chip--{size ?? 'small'}"
  class:chip--removable={removable}
  style:--_color={color}
  use:tooltipAction={tooltip}
>
  {#if icon !== undefined}
    <span class="chip__icon"><Icon {icon} size={size === 'extra-small' ? 'x-small' : 'small'} {iconProps} /></span>
  {/if}
  <span class="chip__label"><Label {label} params={labelParams} /></span>
  {#if removable}
    <IconButton
      bind:this={removeButton}
      kind="ghost"
      size="min"
      icon={ui.icon.Cross}
      iconSize={size === 'extra-small' ? 'x-small' : 'smaller'}
      inheritColor
      tooltip={removeTooltip}
      aria-label={removeName}
      on:click={() => {
        dispatch('remove', null)
      }}
      on:keydown={handleKeydown}
    />
  {/if}
</span>

<style lang="scss">
  .chip {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-0_5);
    max-width: 100%;
    min-width: 0;
    --_accent: var(--_color, var(--kit-button-primary-BackgroundColor));
    background-color: var(--_bg);
    box-shadow: inset 0 0 0 1px var(--_border, transparent);
    font-weight: 500;
    line-height: 1rem;
    color: var(--_text);

    &__icon {
      display: flex;
      flex-shrink: 0;
    }
    &__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    // 60% of the accent keeps the text at 4.5:1 on its tint in both themes.
    &--tint {
      --_bg: color-mix(in srgb, var(--_accent) 14%, transparent);
      --_text: color-mix(in srgb, var(--_accent) 60%, var(--global-primary-TextColor));
    }
    &--solid {
      --_bg: var(--_accent);
      --_text: var(--button-accent-LabelColor);
    }
    &--outline {
      --_bg: transparent;
      --_border: color-mix(in srgb, var(--_accent) 50%, transparent);
      --_text: color-mix(in srgb, var(--_accent) 60%, var(--global-primary-TextColor));
    }
    // Flat like the breadcrumbs badge: a bordered plate would read as a secondary button.
    &--neutral {
      --_bg: var(--global-ui-hover-BackgroundColor);
      --_text: var(--global-secondary-TextColor);
    }
    // State chips keep the saturated theme state colors: the mixed tint looked muddy next to them.
    &--tone-positive {
      --_bg: var(--theme-state-positive-background-color);
      --_border: var(--theme-state-positive-border-color);
      --_text: var(--theme-state-positive-color);
    }
    &--tone-negative {
      --_bg: var(--theme-state-negative-background-color);
      --_border: var(--theme-state-negative-border-color);
      --_text: var(--theme-state-negative-color);
    }
    &--tone-regular {
      --_bg: var(--theme-state-regular-background-color);
      --_border: var(--theme-state-regular-border-color);
      --_text: var(--theme-state-regular-color);
    }
    // Lighter than regular, but opaque: a translucent label reads as disabled.
    &--tone-ghost {
      --_bg: var(--theme-state-ghost-background-color);
      --_border: var(--theme-state-regular-border-color);
      --_text: var(--global-tertiary-TextColor);
    }

    &--small {
      height: var(--global-small-Size);
      padding: 0 var(--spacing-1);
      border-radius: var(--small-BorderRadius);
      font-size: 0.875rem;
    }
    &--extra-small {
      gap: var(--spacing-0_25);
      height: var(--global-extra-small-Size);
      padding: 0 var(--spacing-0_75);
      border-radius: var(--extra-small-BorderRadius);
      font-size: 0.75rem;
    }
    // A grey ghost hover looks foreign on a coloured chip: tint it with the chip text.
    & > :global(.button.button--ghost) {
      --_bg-hover: color-mix(in srgb, var(--_text) 16%, transparent);
      --_bg-active: color-mix(in srgb, var(--_text) 24%, transparent);
    }
    & > :global(.button.button--ghost:not(:disabled):is(:hover, :active, .button--pressed)) {
      --_icon: currentColor;
    }
    // The ring of the remove button stays inside the chip: the edge padding is narrower than the usual offset.
    & > :global(.button:focus-visible) {
      outline-offset: 0;
    }
    &--extra-small > :global(.button:focus-visible) {
      outline-offset: -2px;
    }
    // The remove button sits close to the edge: the chip padding would leave a gap wider than at the label.
    &--removable.chip--small {
      padding-right: var(--spacing-0_5);
    }
    &--removable.chip--extra-small {
      padding-right: var(--spacing-0_25);
    }
  }
</style>
