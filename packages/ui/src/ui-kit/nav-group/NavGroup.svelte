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
  import OpenedArrow from '../../components/icons/OpenedArrow.svelte'
  import Label from '../../components/Label.svelte'
  import type { IconComponent } from '../../types'
  import { pointerFocus } from '../utils/pointerFocus'
  import type { NavGroupEvents, NavGroupKind, NavGroupProps } from './types'

  type $$Props = NavGroupProps
  type $$Events = NavGroupEvents
  interface $$Slots {
    default: Record<string, never>
    collapsed: Record<string, never>
    afterLabel: Record<string, never>
    extra: Record<string, never>
    tools: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> = {}
  export let kind: NavGroupKind | undefined = undefined
  export let divider: boolean = true
  export let expandable: boolean = false
  export let open: boolean = true
  export let empty: boolean = false
  export let selected: boolean | undefined = undefined
  export let highlighted: boolean = false
  export let pressed: boolean = false
  export let draggable: boolean = false

  const dispatch = createEventDispatcher<{ toggle: boolean, select: null }>()
  const uid = `nav-group-${Math.random().toString(36).slice(2, 10)}`
  const labelId = `${uid}-label`
  const contentId = `${uid}-content`

  $: resolvedKind = kind ?? 'section'
  $: selectable = selected !== undefined
  $: withChevron = expandable && !empty
  $: shown = open && !empty

  function toggle (): void {
    open = !open
    dispatch('toggle', open)
  }

  // The chevron of a selectable header is out of the Tab order: arrows on the header open and close the group.
  function handleKeydown (event: KeyboardEvent): void {
    if (!withChevron) return
    if ((event.key === 'ArrowRight' && !open) || (event.key === 'ArrowLeft' && open)) {
      event.preventDefault()
      toggle()
    }
  }

  // Without a header button the id and data attributes go to the group itself.
  $: ownAttributes = selectable || withChevron ? {} : $$restProps
</script>

<section
  class="nav-group nav-group--{resolvedKind}"
  class:nav-group--divider={divider && resolvedKind === 'section' && !selectable}
  class:nav-group--selectable={selectable}
  class:nav-group--open={shown}
  class:nav-group--with-icon={icon !== undefined}
  {...ownAttributes}
>
  <div
    class="nav-group__header"
    role="presentation"
    use:pointerFocus={'nav-group__header--pointer'}
    class:nav-group__header--selected={selected === true}
    class:nav-group__header--marked={highlighted || pressed || selected === true}
    class:nav-group__header--pressed={pressed}
    on:contextmenu
  >
    {#if selectable}
      <!-- Covers the whole header; the chevron and the slots sit above it. -->
      <button
        class="nav-group__hit"
        type="button"
        aria-labelledby={labelId}
        aria-current={selected === true ? 'page' : undefined}
        aria-expanded={withChevron ? open : undefined}
        aria-controls={withChevron ? contentId : undefined}
        {draggable}
        on:click={() => dispatch('select', null)}
        on:keydown={handleKeydown}
        on:dragstart
        on:dragover
        on:dragend
        on:drop
        {...$$restProps}
      />
    {:else if withChevron}
      <button
        class="nav-group__hit"
        type="button"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={contentId}
        {draggable}
        on:click={toggle}
        on:keydown={handleKeydown}
        on:dragstart
        on:dragover
        on:dragend
        on:drop
        {...$$restProps}
      />
    {/if}
    {#if withChevron}
      {#if selectable}
        <button
          class="nav-group__chevron nav-group__chevron--button"
          class:nav-group__chevron--closed={!open}
          type="button"
          tabindex="-1"
          aria-expanded={open}
          aria-controls={contentId}
          aria-labelledby={labelId}
          on:click={toggle}
        >
          <IconDown size="small" />
        </button>
      {:else}
        <span class="nav-group__chevron" class:nav-group__chevron--closed={!open} aria-hidden="true">
          <IconDown size="small" />
        </span>
      {/if}
    {/if}
    <span class="nav-group__caption">
      {#if icon !== undefined}
        <span class="nav-group__icon" aria-hidden="true"><Icon {icon} {iconProps} size="small" /></span>
      {/if}
      <span id={labelId} class="nav-group__label"><Label {label} params={labelParams} /></span>
      <slot name="afterLabel" />
    </span>
    <span class="nav-group__space" />
    {#if $$slots.extra}<span class="nav-group__extra"><slot name="extra" /></span>{/if}
    {#if $$slots.tools}<span class="nav-group__tools"><slot name="tools" /></span>{/if}
    {#if selected === true && resolvedKind === 'nested'}
      <span class="nav-group__arrow" aria-hidden="true"><OpenedArrow size="small" /></span>
    {/if}
  </div>
  {#if !empty}
    <div id={contentId} class="nav-group__content" role="group" aria-labelledby={labelId} hidden={!open}>
      <slot />
    </div>
    {#if !open && $$slots.collapsed}
      <div class="nav-group__content" role="group" aria-labelledby={labelId}>
        <slot name="collapsed" />
      </div>
    {/if}
  {/if}
</section>

<style lang="scss">
  .nav-group {
    // Visible on the dark panel too, unlike the general UI background.
    --_plate: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, transparent);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    width: 100%;
    min-width: 0;

    &--divider {
      border-top: 1px solid var(--theme-navpanel-divider);
    }

    &__header {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--spacing-0_25);
      padding: var(--spacing-1) var(--spacing-2_25) var(--spacing-1) var(--spacing-2);
      min-width: 0;
      min-height: var(--global-medium-Size);
    }
    // Focused by a click: no ring when a shortcut key follows.
    &__header:global(.nav-group__header--pointer) :focus-visible {
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
    }

    // Decoration lets clicks through to the header button below; the controls stay clickable.
    &__caption,
    &__space,
    &__arrow {
      position: relative;
      pointer-events: none;
    }
    &__chevron:not(.nav-group__chevron--button) {
      pointer-events: none;
    }

    &__chevron {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      margin: 0 var(--spacing-0_25);
      padding: 0;
      width: 1.25rem;
      height: 1.25rem;
      color: var(--global-disabled-TextColor);
      background: none;
      border: none;
      border-radius: var(--extra-small-BorderRadius);

      :global(svg) {
        transition: transform 0.15s ease;
      }
      &--closed :global(svg) {
        transform: rotate(-90deg);
      }
      &--button {
        cursor: pointer;

        &:focus-visible {
          outline: 2px solid var(--global-focus-BorderColor);
          outline-offset: 2px;
        }
      }
    }

    &__caption {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-0_5);
      padding: var(--spacing-0_25) var(--spacing-0_5);
      min-width: 0;
      font-size: 0.75rem;
      font-weight: 500;
      line-height: 1rem;
      text-transform: uppercase;
      color: var(--global-tertiary-TextColor);
      border-radius: var(--extra-small-BorderRadius);
    }
    &__icon {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      width: 1.5rem;
      height: 1.5rem;
      color: var(--global-primary-TextColor);
      background-color: var(--kit-button-secondary-BackgroundColor);
      border: 1px solid var(--kit-button-secondary-BorderColor);
      border-radius: var(--extra-small-BorderRadius);
    }
    &__label {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    &__space {
      flex-grow: 1;
    }

    &__extra,
    &__tools {
      position: relative;
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-0_5);
      margin-left: var(--spacing-1);
      min-width: 0;
      max-width: 50%;
    }
    &__tools {
      display: none;
    }
    &__header:hover &__tools,
    &__header:focus-within &__tools,
    &__header--marked &__tools {
      display: flex;
    }

    &__arrow {
      display: inline-flex;
      flex-shrink: 0;
      margin-left: var(--spacing-0_5);
      color: var(--button-selected-IconColor);
    }

    // A marked or hovered header lifts its caption onto a plate; the text stays secondary, as in the rest of the panel.
    &__header--marked &__caption,
    &__header:hover &__caption {
      color: var(--global-secondary-TextColor);
      background-color: var(--_plate);
    }
    &__header--marked &__chevron {
      color: var(--global-tertiary-TextColor);
    }
    &__header:hover &__chevron {
      color: var(--global-primary-IconColor);
      background-color: var(--button-tertiary-hover-BackgroundColor);
    }

    &__content {
      display: flex;
      flex-direction: column;
      min-width: 0;

      &[hidden] {
        display: none;
      }
    }
    &--section.nav-group--open > &__content {
      margin-bottom: var(--spacing-1_5);
    }

    // A space inside a section: the caption wraps the icon, its plate shows while open.
    &--nested > .nav-group__header,
    &--selectable > .nav-group__header {
      .nav-group__icon {
        margin-right: var(--spacing-0_25);
      }
    }
    &--with-icon.nav-group--nested > .nav-group__header,
    &--with-icon.nav-group--selectable > .nav-group__header {
      .nav-group__caption {
        padding: 0 var(--spacing-0_75) 0 0;
      }
    }
    &--nested.nav-group--open > .nav-group__header .nav-group__caption {
      background-color: var(--_plate);
    }
    &--nested.nav-group--open > .nav-group__content {
      margin-bottom: 0;
    }

    // A header that is a row of its own: it selects the group, as an item does.
    &--selectable > &__header {
      margin: 0 var(--spacing-1_5) var(--spacing-1_5);
      padding: var(--spacing-0_5) var(--spacing-0_75) var(--spacing-0_5) var(--spacing-0_5);
      min-height: var(--global-small-Size);
      border-radius: var(--small-BorderRadius);
    }
    &--selectable.nav-group--open > &__header {
      margin-bottom: 0;
    }
    &--selectable > &__header--selected {
      --_selected-plate: color-mix(in srgb, var(--button-selected-BackgroundColor) 50%, transparent);
      background-color: var(--button-selected-BackgroundColor);

      .nav-group__hit {
        cursor: default;
      }
      // Gray plates look foreign on the selection tint, full-tint plates and text too loud: half the tint, neutral text.
      .nav-group__caption {
        color: var(--global-secondary-TextColor);
        background-color: var(--_selected-plate);
      }
      .nav-group__icon {
        background-color: var(--_selected-plate);
        border-color: transparent;
      }
      .nav-group__chevron {
        color: var(--global-tertiary-TextColor);
      }
    }
    // An open space keeps its plate, but in the selection tint.
    &--nested.nav-group--selectable > &__header--selected .nav-group__caption {
      background-color: var(--_selected-plate);
    }
  }
</style>
