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
  import { languageStore } from '@hcengineering/theme'
  import { createEventDispatcher } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import ChevronRight from '../../components/icons/ChevronRight.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import { formatDuration } from '../../utils'
  import type { AccordionItemEvents, AccordionItemProps, AccordionItemSize } from './types'

  type $$Props = AccordionItemProps
  type $$Events = AccordionItemEvents
  interface $$Slots {
    default: Record<string, never>
    meta: Record<string, never>
    actions: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let size: AccordionItemSize | undefined = undefined
  export let open: boolean = false
  export let disabled: boolean = false
  export let selected: boolean | undefined = undefined
  export let counter: number | undefined = undefined
  export let duration: number | undefined = undefined
  export let sticky: boolean = false
  export let filled: boolean = false
  export let lazy: boolean = false

  const dispatch = createEventDispatcher<{ toggle: boolean, select: null }>()
  const uid = `accordion-${Math.random().toString(36).slice(2, 10)}`
  const titleId = `${uid}-title`
  const contentId = `${uid}-content`

  $: resolvedSize = size ?? 'large'
  $: selectable = selected !== undefined
  // A medium header shows its state by the caption plate, but a selectable one needs a separate toggle to click.
  $: withChevron = (!disabled && (resolvedSize === 'large' || selectable)) || resolvedSize === 'small'
  // Small disclosures stand in lists where some rows cannot open: the empty chevron place keeps titles aligned.
  $: chevronSpacer = disabled && resolvedSize === 'small'
  // Small disclosures come in long lists and trees: a landmark per row would flood the landmarks list.
  $: landmark = resolvedSize !== 'small'

  let wasOpen = open
  $: if (open) wasOpen = true

  let durationLabel = ''
  let durationRequest = 0
  $: formatDurationLabel(duration, $languageStore)

  function formatDurationLabel (value: number | undefined, language: string): void {
    const request = ++durationRequest
    if (value === undefined) {
      durationLabel = ''
      return
    }
    void formatDuration(value, language === '' ? 'en' : language).then((text) => {
      // The latest request wins, also when only the language changed.
      if (request === durationRequest) durationLabel = text.trim()
    })
  }

  function toggle (): void {
    if (disabled) return
    open = !open
    dispatch('toggle', open)
  }
</script>

<section
  class="accordion-item accordion-item--{resolvedSize}"
  class:accordion-item--open={open}
  class:accordion-item--filled={filled}
>
  <div class="accordion-item__header" class:accordion-item__header--sticky={sticky}>
    {#if selectable}
      <button
        class="accordion-item__chevron accordion-item__chevron--button"
        type="button"
        {disabled}
        aria-expanded={open}
        aria-controls={contentId}
        aria-labelledby={titleId}
        on:click={toggle}
      >
        <ChevronRight size="small" />
      </button>
      <button
        id={titleId}
        class="accordion-item__title accordion-item__title--select"
        class:accordion-item__title--selected={selected}
        class:accordion-item__title--disabled={disabled}
        type="button"
        aria-current={selected === true ? 'true' : undefined}
        on:click={() => dispatch('select', null)}
      >
        {#if icon !== undefined}
          <span class="accordion-item__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
        {/if}
        <span class="accordion-item__label"><Label {label} params={labelParams} /></span>
      </button>
      <span class="accordion-item__meta">
        {#if counter !== undefined}<span class="accordion-item__counter">{counter}</span>{/if}
        <span class="accordion-item__duration">{durationLabel}<slot name="meta" /></span>
      </span>
    {:else}
      <button
        id={titleId}
        class="accordion-item__toggle"
        type="button"
        {disabled}
        aria-expanded={open}
        aria-controls={contentId}
        on:click={toggle}
      >
        {#if withChevron}
          <span class="accordion-item__chevron" class:accordion-item__chevron--spacer={chevronSpacer} aria-hidden="true"
            ><ChevronRight size="small" /></span
          >
        {/if}
        <span class="accordion-item__title" class:accordion-item__title--with-icon={icon !== undefined}>
          {#if icon !== undefined}
            <span class="accordion-item__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
          {/if}
          <span class="accordion-item__label"><Label {label} params={labelParams} /></span>
          {#if counter !== undefined}<span class="accordion-item__counter">{counter}</span>{/if}
          <span class="accordion-item__duration">{durationLabel}<slot name="meta" /></span>
        </span>
      </button>
    {/if}
    <div class="accordion-item__actions"><slot name="actions" /></div>
  </div>
  <div
    id={contentId}
    class="accordion-item__content"
    role={landmark ? 'region' : undefined}
    aria-labelledby={landmark ? titleId : undefined}
    hidden={!open}
  >
    {#if !lazy || wasOpen}<slot />{/if}
  </div>
</section>

<style lang="scss">
  .accordion-item {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;

    &__header {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_5);
      min-width: 0;

      &--sticky {
        position: sticky;
        top: 0;
        z-index: 2;
        background-color: var(--accordion-header-BackgroundColor, var(--theme-panel-color));
      }
    }

    &__toggle,
    &__chevron--button,
    &__title--select {
      margin: 0;
      padding: 0;
      font: inherit;
      color: inherit;
      text-align: start;
      background: none;
      border: none;
      border-radius: var(--extra-small-BorderRadius);
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      &:disabled {
        cursor: not-allowed;
      }
    }
    &__toggle {
      display: flex;
      flex-grow: 1;
      justify-content: flex-start;
      align-items: center;
      gap: var(--spacing-1);
      align-self: stretch;
      min-width: 0;
    }

    &__chevron {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      width: var(--global-extra-small-Size);
      height: var(--global-extra-small-Size);
      color: var(--global-secondary-TextColor);
      border-radius: var(--extra-small-BorderRadius);

      :global(svg) {
        transition: transform 0.15s ease;
      }
    }
    // Only its own header: a closed item nested in an open one keeps its chevron closed.
    &--open > &__header &__chevron :global(svg) {
      transform: rotate(90deg);
    }
    &__chevron--spacer {
      visibility: hidden;
    }
    &__toggle:disabled &__chevron,
    &__chevron--button:disabled {
      color: var(--global-disabled-TextColor);
    }
    // As in the legacy header: the chevron lights up while the pointer is anywhere on the header but its actions.
    &__toggle:enabled:hover &__chevron,
    &__header:hover:not(:has(.accordion-item__actions:hover)) &__chevron--button:enabled {
      color: var(--global-primary-IconColor);
      background-color: var(--button-tertiary-hover-BackgroundColor);
    }
    &__toggle:enabled:active &__chevron,
    &__chevron--button:enabled:active {
      background-color: var(--button-tertiary-active-BackgroundColor);
    }

    &__title {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_75);
      min-width: 0;
      color: var(--global-primary-TextColor);
    }
    &__toggle:disabled &__title,
    &__toggle:disabled &__icon,
    &__title--disabled,
    &__title--disabled &__icon {
      color: var(--global-disabled-TextColor);
    }
    &__title--select {
      padding: var(--spacing-0_5) var(--spacing-1);
      border-radius: var(--extra-small-BorderRadius);

      &:hover {
        background-color: var(--button-tertiary-hover-BackgroundColor);
      }
      &:active {
        background-color: var(--button-tertiary-active-BackgroundColor);
      }
    }
    // As in the legacy accordion: a neutral plate, the text keeps its color.
    &__title--selected,
    &__title--selected:hover,
    &__title--selected:active {
      background-color: var(--global-ui-hover-BackgroundColor);
    }
    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      color: var(--global-primary-TextColor);
    }
    &__label {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    &__meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-0_75);
      min-width: 0;
    }
    &__counter,
    &__duration {
      flex-shrink: 0;
      font-weight: 400;
      color: var(--global-tertiary-TextColor);

      // A separator that is not read out; an empty duration (no value, nothing in the slot) disappears with it.
      &::before {
        content: '•' / '';
        margin-right: var(--spacing-0_75);
        color: var(--global-tertiary-TextColor);
      }
    }
    &__duration:empty,
    &__actions:empty {
      display: none;
    }

    // A 32px action spills into the header padding, like the selectable title: the header keeps its size height.
    &__actions {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      margin-block: calc(-1 * var(--spacing-0_5));
      margin-left: auto;
      gap: var(--spacing-0_5);
      max-width: 50%;
      min-width: 0;
    }

    &__content {
      display: flex;
      flex-direction: column;
      min-width: 0;

      &[hidden] {
        display: none;
      }
    }

    // A section: a 16px title between solid dividers.
    &--large {
      border-bottom: 1px solid var(--theme-navpanel-divider);

      .accordion-item__header {
        padding: var(--spacing-2) var(--spacing-1_5) var(--spacing-2) var(--spacing-2);
        min-height: var(--global-extra-large-Size);
      }
      .accordion-item__title {
        font-size: 1rem;
        font-weight: 500;
        line-height: 1.5rem;
      }
      // The plate of a selectable title spills into the header padding: the header keeps its 56px.
      .accordion-item__title--select {
        margin-block: calc(-1 * var(--spacing-0_5));
      }
      &.accordion-item--open .accordion-item__header {
        .accordion-item__counter,
        .accordion-item__duration {
          color: var(--global-secondary-TextColor);
        }
      }
    }

    // A subgroup inside a section: uppercase caption on a plate while open, dashed dividers between siblings.
    &--medium {
      // Half of the hover plate: the legacy 5% in the light theme, and still visible in the dark one.
      --_plate: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, transparent);

      &:not(:last-child) {
        border-bottom: 1px dashed var(--theme-navpanel-divider);
      }
      .accordion-item__header {
        padding: var(--spacing-1) var(--spacing-2);
        min-height: var(--global-medium-Size);
      }
      .accordion-item__toggle {
        flex-grow: 0;
      }
      .accordion-item__title {
        padding: var(--spacing-0_5) var(--spacing-1);
        font-size: 0.75rem;
        font-weight: 500;
        line-height: 1rem;
        text-transform: uppercase;
        border-radius: var(--extra-small-BorderRadius);
      }
      .accordion-item__title--with-icon {
        padding: 0 var(--spacing-1) 0 0;
      }
      // Caption colors match the breadcrumbs: secondary text, a blue-gray plate, a step darker on hover.
      .accordion-item__title,
      .accordion-item__icon {
        color: var(--global-secondary-TextColor);
      }
      .accordion-item__icon {
        width: var(--global-extra-small-Size);
        height: var(--global-extra-small-Size);
        background-color: var(--_plate);
        border-radius: var(--extra-small-BorderRadius);
      }
      // Without a chevron the plate is the only sign of an open subgroup, so the closed one has none.
      &.accordion-item--open .accordion-item__title:not(.accordion-item__title--selected) {
        background-color: var(--_plate);
      }
      .accordion-item__toggle:enabled:hover .accordion-item__title,
      .accordion-item__title--select:not(.accordion-item__title--selected):not(.accordion-item__title--disabled):hover {
        color: color-mix(in srgb, var(--global-secondary-TextColor) 45%, var(--global-primary-TextColor));
        background-color: var(--global-ui-hover-BackgroundColor);
      }
      .accordion-item__toggle:disabled .accordion-item__title,
      .accordion-item__toggle:disabled .accordion-item__icon,
      .accordion-item__title--disabled,
      .accordion-item__title--disabled .accordion-item__icon {
        color: var(--global-disabled-TextColor);
      }
      .accordion-item__content {
        margin: 0 var(--spacing-2);
      }
    }

    // A compact disclosure: the title follows the chevron, content right below without dividers.
    &--small {
      .accordion-item__header {
        min-height: var(--global-small-Size);
      }
      .accordion-item__title {
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.25rem;
      }
      // Rows of statistics put long values into meta: they give way before the title does.
      .accordion-item__label {
        flex-shrink: 0;
        max-width: 100%;
      }
      .accordion-item__duration {
        flex-shrink: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      &.accordion-item--open .accordion-item__content {
        padding-top: var(--spacing-1_5);
      }
    }

    // The border eats into the padding: a filled row stays as tall as its size.
    &--filled .accordion-item__header {
      padding: calc(var(--spacing-0_5) - 1px) var(--spacing-1) calc(var(--spacing-0_5) - 1px) var(--spacing-0_5);
      background-color: var(--kit-button-secondary-BackgroundColor);
      border: 1px solid var(--kit-button-secondary-BorderColor);
      border-radius: var(--small-BorderRadius);
    }
  }
</style>
