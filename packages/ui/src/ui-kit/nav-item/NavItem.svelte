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
  import { createEventDispatcher } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import IconDown from '../../components/icons/Down.svelte'
  import Label from '../../components/Label.svelte'
  import { tooltip } from '../../tooltips'
  import type { IconComponent } from '../../types'
  import IconBox from '../icon-box/IconBox.svelte'
  import { pointerFocus } from '../utils/pointerFocus'
  import type { NavItemEvents, NavItemKind, NavItemProps } from './types'

  type $$Props = NavItemProps
  type $$Events = NavItemEvents
  interface $$Slots {
    icon: Record<string, never>
    afterLabel: Record<string, never>
    actions: Record<string, never>
    badge: Record<string, never>
    children: Record<string, never>
    collapsed: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let identifier: string | undefined = undefined
  export let description: IntlString | undefined = undefined
  export let descriptionParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let color: string | undefined = undefined
  export let kind: NavItemKind | undefined = undefined
  export let count: number | undefined = undefined
  export let selected: boolean = false
  export let pressed: boolean = false
  export let disabled: boolean = false
  export let level: number = 0
  export let expandable: boolean = false
  export let open: boolean = false
  export let empty: boolean = false
  export let draggable: boolean = false

  const dispatch = createEventDispatcher<{ toggle: boolean }>()
  const uid = `nav-item-${Math.random().toString(36).slice(2, 10)}`
  const labelId = `${uid}-label`
  const identifierId = `${uid}-identifier`
  const countId = `${uid}-count`
  const descriptionId = `${uid}-description`
  const childrenId = `${uid}-children`

  let labelElement: HTMLElement | undefined
  let truncated = false

  $: resolvedKind = kind ?? 'link'
  $: withChevron = expandable && !empty
  $: withMarker = color !== undefined
  $: withIcon = withMarker || icon !== undefined || $$slots.icon

  function toggle (): void {
    open = !open
    dispatch('toggle', open)
  }

  function handleClick (): void {
    if (selected && withChevron) toggle()
  }

  // The chevron is out of the Tab order: arrows on the row open and close the node, as in a tree.
  function handleKeydown (event: KeyboardEvent): void {
    if (!withChevron || disabled) return
    if ((event.key === 'ArrowRight' && !open) || (event.key === 'ArrowLeft' && open)) {
      event.preventDefault()
      toggle()
    }
  }

  $: childrenShown = withChevron && (open || $$slots.collapsed)
  $: labelledBy = [
    identifier !== undefined ? identifierId : '',
    labelId,
    description !== undefined ? descriptionId : '',
    count !== undefined ? countId : ''
  ]
    .filter((id) => id !== '')
    .join(' ')

  // The full label is only worth a tooltip when the row cuts it.
  function measure (): void {
    truncated = labelElement !== undefined && labelElement.scrollWidth > labelElement.clientWidth
  }
</script>

<div
  class="nav-item nav-item--{resolvedKind}"
  class:nav-item--selected={selected}
  class:nav-item--pressed={pressed}
  class:nav-item--disabled={disabled}
  class:nav-item--marker={withMarker}
  style:--_level={level}
>
  <div class="nav-item__row" use:pointerFocus={'nav-item__row--pointer'}>
    <!-- Covers the whole row, so the count and the gaps are clickable too; chevron and actions sit above it. -->
    <button
      class="nav-item__hit"
      type="button"
      aria-labelledby={labelledBy}
      aria-current={selected ? 'page' : undefined}
      aria-expanded={withChevron ? open : undefined}
      aria-controls={withChevron && childrenShown ? childrenId : undefined}
      {disabled}
      {draggable}
      use:tooltip={truncated ? { label, props: labelParams, direction: 'top' } : undefined}
      on:mouseenter={measure}
      on:focus={measure}
      on:click={handleClick}
      on:click
      on:keydown={handleKeydown}
      on:contextmenu
      on:dragstart
      on:dragover
      on:dragend
      on:drop
      {...$$restProps}
    />
    {#if withChevron}
      <button
        class="nav-item__chevron"
        class:nav-item__chevron--open={open}
        type="button"
        tabindex="-1"
        aria-expanded={open}
        aria-controls={childrenShown ? childrenId : undefined}
        aria-labelledby={labelId}
        {disabled}
        on:click={toggle}
      >
        <IconDown size="x-small" />
      </button>
    {:else if expandable}
      <span class="nav-item__chevron nav-item__chevron--empty" aria-hidden="true" />
    {/if}
    {#if withIcon}
      <span class="nav-item__icon" aria-hidden="true">
        {#if $$slots.icon}
          <slot name="icon" />
        {:else if withMarker}
          <span class="nav-item__marker" style:background-color={color} />
        {:else if icon !== undefined && resolvedKind === 'object'}
          <IconBox {icon} {iconProps} size="extra-small" />
        {:else if icon !== undefined}
          <Icon {icon} {iconProps} size="small" />
        {/if}
      </span>
    {/if}
    <span class="nav-item__text">
      {#if identifier !== undefined}
        <span id={identifierId} class="nav-item__identifier">{identifier}</span>
      {/if}
      <span id={labelId} class="nav-item__label" bind:this={labelElement}>
        <Label {label} params={labelParams} />
      </span>
      {#if description !== undefined}
        <span id={descriptionId} class="nav-item__description">
          <Label label={description} params={descriptionParams} />
        </span>
      {/if}
      <slot name="afterLabel" />
    </span>
    {#if $$slots.actions}
      <span class="nav-item__actions"><slot name="actions" /></span>
    {/if}
    {#if count !== undefined}
      <span id={countId} class="nav-item__count">{count}</span>
    {/if}
    {#if $$slots.badge}
      <span class="nav-item__badge"><slot name="badge" /></span>
    {/if}
  </div>
  {#if withChevron}
    {#if open}
      <div id={childrenId} class="nav-item__children" role="group" aria-labelledby={labelId}>
        <slot name="children" />
      </div>
    {:else if $$slots.collapsed}
      <div id={childrenId} class="nav-item__children" role="group" aria-labelledby={labelId}>
        <slot name="collapsed" />
      </div>
    {/if}
  {/if}
</div>

<style lang="scss">
  .nav-item {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-width: 0;

    &__row {
      position: relative;
      display: flex;
      align-items: center;
      padding: 0 var(--spacing-0_5) 0 calc(var(--spacing-1_25) + var(--_level) * 1.25rem);
      min-width: 0;
      min-height: var(--global-small-Size);
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--global-primary-TextColor);
      border-radius: var(--small-BorderRadius);
    }
    // Focused by a click: no ring when a shortcut key follows.
    &__row:global(.nav-item__row--pointer) :focus-visible {
      outline: none;
    }

    &__hit {
      position: absolute;
      inset: 0;
      margin: 0;
      padding: 0;
      background: none;
      border: none;
      border-radius: inherit;
      cursor: pointer;

      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      &:disabled {
        cursor: not-allowed;
      }
    }

    // Everything but the chevron and the actions lets clicks through to the row button below.
    &__icon,
    &__text,
    &__count,
    &__badge {
      position: relative;
      pointer-events: none;
    }

    &__chevron {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      margin: 0 var(--spacing-0_5) 0 0;
      padding: 0;
      width: 1rem;
      height: 1rem;
      color: var(--global-secondary-TextColor);
      background: none;
      border: none;
      border-radius: var(--min-BorderRadius);
      cursor: pointer;

      :global(svg) {
        transform: rotate(-90deg);
        transition: transform 0.15s ease;
      }
      &--open :global(svg) {
        transform: rotate(0deg);
      }
      &--empty {
        cursor: default;
      }
      &:disabled {
        color: var(--global-disabled-TextColor);
        cursor: not-allowed;
      }
      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
    }
    &__row:hover .nav-item__chevron:not(.nav-item__chevron--empty):not(:disabled) {
      color: var(--global-primary-IconColor);
      background-color: var(--button-tertiary-hover-BackgroundColor);
    }

    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      margin-right: var(--spacing-1);
      min-width: var(--global-min-Size);
      height: var(--global-min-Size);
      color: var(--global-primary-TextColor);
    }
    &__marker {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: var(--min-BorderRadius);
    }

    &__text {
      display: flex;
      flex-grow: 1;
      align-items: center;
      gap: var(--spacing-0_5);
      min-width: 0;
    }
    &__label {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    // Stays whole in a narrow row: the title after it gives way.
    &__identifier {
      flex-shrink: 0;
      font-size: 0.75rem;
      font-weight: 500;
    }
    &__description {
      flex-shrink: 0;
      font-size: 0.75rem;
      line-height: 1rem;
      color: var(--global-secondary-TextColor);
    }

    &__actions {
      position: relative;
      display: none;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_25);
    }
    &__row:hover .nav-item__actions,
    &__row:focus-within .nav-item__actions,
    &--pressed > .nav-item__row .nav-item__actions {
      display: flex;
    }

    &__count {
      flex-shrink: 0;
      margin: 0 var(--spacing-1);
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1rem;
      color: var(--global-tertiary-TextColor);
    }
    &__badge {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      margin-left: var(--spacing-0_5);
    }

    &__children {
      display: flex;
      flex-direction: column;
      margin-top: 1px;
      min-width: 0;
    }

    // A paler shade of the selection tint: gray or blue looked foreign next to the selected row.
    &:not(.nav-item--selected):not(.nav-item--disabled) > .nav-item__row:hover,
    &--pressed:not(.nav-item--selected) > .nav-item__row {
      background-color: color-mix(in srgb, var(--button-selected-BackgroundColor) 55%, transparent);
    }
    &--selected > .nav-item__row {
      background-color: var(--button-selected-BackgroundColor);

      .nav-item__hit {
        cursor: default;
      }
      .nav-item__identifier,
      .nav-item__label,
      .nav-item__icon {
        color: var(--button-selected-LabelColor);
      }
      .nav-item__count {
        color: var(--global-secondary-TextColor);
      }
      .nav-item__icon,
      .nav-item__icon :global(.icon-box) {
        color: var(--button-selected-IconColor);
      }
    }
    // A tag color on the label fights the selection tint and loses contrast; the marker already carries it.
    &--selected.nav-item--marker > .nav-item__row .nav-item__label {
      color: var(--global-primary-TextColor);
    }

    &--object > .nav-item__row {
      padding-left: calc(var(--spacing-0_5) + var(--_level) * 1.25rem);

      .nav-item__icon {
        margin-right: var(--spacing-0_75);
        min-width: var(--global-extra-small-Size);
        height: var(--global-extra-small-Size);
      }
      // The legacy object plate: a quiet fill with a subtle border, lighter than a button.
      .nav-item__icon :global(.icon-box) {
        border-color: var(--global-subtle-ui-BorderColor);
        background-color: var(--global-ui-BackgroundColor);
      }
    }

    &--anchor {
      align-self: flex-start;
      max-width: 100%;

      & > .nav-item__row {
        padding-right: var(--spacing-1_5);
        min-height: 1.75rem;
        font-size: 0.75rem;
        line-height: 1rem;

        .nav-item__label {
          font-weight: 500;
        }
        .nav-item__label,
        .nav-item__icon {
          color: var(--global-secondary-TextColor);
        }
      }
    }

    &--disabled > .nav-item__row {
      .nav-item__label,
      .nav-item__icon,
      .nav-item__count,
      .nav-item__icon :global(.icon-box) {
        color: var(--global-disabled-TextColor);
      }
    }
  }
  // Adjacent plates (selected and hovered) need a hairline between them; the neighbour is another instance,
  // bare or wrapped in a navigation link.
  :global(.nav-item) + .nav-item,
  :global(a) + .nav-item,
  :global(:is(a, .nav-item) + a) > .nav-item {
    margin-top: 1px;
  }
</style>
