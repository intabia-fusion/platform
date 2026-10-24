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
<script lang="ts" context="module">
  // Headers that close on Esc, in the order they appeared: only the latest one takes the key.
  const escapeStack: symbol[] = []
</script>

<script lang="ts">
  import { afterUpdate, createEventDispatcher, onDestroy } from 'svelte'

  import IconClose from '../../components/icons/Close.svelte'
  import IconMaximize from '../../components/icons/Maximize.svelte'
  import IconMinimize from '../../components/icons/Minimize.svelte'
  import { deviceOptionsStore as deviceInfo } from '../../index'
  import ui from '../../plugin'
  import { popupstore } from '../../popups'
  import { resizeObserver } from '../../resize'
  import IconButton from '../button/IconButton.svelte'
  import Kbd from '../kbd/Kbd.svelte'
  import type { PanelHeaderAdaptive, PanelHeaderEvents, PanelHeaderProps, PanelHeaderSize } from './types'

  type $$Props = PanelHeaderProps
  type $$Events = PanelHeaderEvents
  interface $$Slots {
    default: { narrow: boolean }
    before: { narrow: boolean }
    description: Record<string, never>
    presence: { narrow: boolean }
    search: { narrow: boolean }
    extra: { narrow: boolean }
    actions: { narrow: boolean }
  }

  export let adaptive: PanelHeaderAdaptive = 'disabled'
  export let breakpoint: number = 768
  export let pinActions: boolean = false
  export let scrollExtra: boolean = false
  export let divider: boolean = true
  export let closable: boolean = false
  export let closeOnEscape: boolean = true
  export let navigatorToggle: boolean = false
  export let noPrint: boolean = false

  const dispatch = createEventDispatcher<{ close: null, resize: PanelHeaderSize }>()

  let narrow = false
  let extraCrowded = false
  const size: PanelHeaderSize = { width: 0, titleWidth: 0, titleOverflow: false, extraWidth: 0, extraOverflow: false }

  $: double =
    adaptive === 'double' || (adaptive === 'auto' && narrow) || (adaptive === 'extra' && (narrow || extraCrowded))
  $: actionsFirst = pinActions || adaptive === 'double' || adaptive === 'extra'
  $: withDescription = $$slots.description
  $: escape = closable && closeOnEscape

  const token = Symbol('panel-header')
  $: if (escape) {
    if (!escapeStack.includes(token)) escapeStack.push(token)
  } else leaveStack()

  function leaveStack (): void {
    const index = escapeStack.indexOf(token)
    if (index !== -1) escapeStack.splice(index, 1)
  }

  onDestroy(leaveStack)

  // Inputs that type text; a checkbox, a radio or a range has nothing to edit, so Esc closes from it.
  const textInputs = new Set([
    'text',
    'email',
    'number',
    'password',
    'tel',
    'url',
    'date',
    'datetime-local',
    'month',
    'time',
    'week'
  ])

  // A search field settles Esc itself (clears, else lets it through); a text field keeps Esc for its own editing.
  function isEditing (target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement) return textInputs.has(target.type)
    return target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (!escape || event.key !== 'Escape') return
    // A popup above the header, or a field inside it, takes Esc first; of two headers only the latest closes.
    if (event.defaultPrevented || $popupstore.length > 0 || isEditing(event.target)) return
    if (escapeStack[escapeStack.length - 1] !== token) return
    event.preventDefault()
    event.stopPropagation()
    dispatch('close', null)
  }

  function measureHeader (element: Element): void {
    size.width = element.clientWidth
    narrow = element.clientWidth <= breakpoint
    report()
  }

  function measureTitle (element: Element): void {
    size.titleWidth = element.clientWidth
    size.titleOverflow = element.scrollWidth > element.clientWidth
    report()
  }

  function measureExtra (element: Element): void {
    size.extraOverflow = element.scrollWidth > element.clientWidth
    if (!double) size.extraWidth = element.clientWidth
    report()
  }

  let reported: PanelHeaderSize | undefined

  // Only a real change: the observers fire on every layout pass and a panel re-lays its title on each event.
  function report (): void {
    if (
      reported !== undefined &&
      (Object.keys(size) as Array<keyof PanelHeaderSize>).every((key) => reported?.[key] === size[key])
    ) {
      return
    }
    reported = { ...size }
    dispatch('resize', reported)
  }

  // The free space next to the title decides when `extra` moves to its own row and back.
  function measureSpace (element: Element): void {
    if (!double && element.clientWidth <= 16) extraCrowded = true
    else if (double && element.clientWidth > size.extraWidth + 42) extraCrowded = false
  }

  // The layout changed (narrow, double): report what the observers have measured.
  afterUpdate(report)
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- One markup for both layouts: a slot rendered twice would lose its focus and typed text on the switch. -->
<div
  class="panel-header"
  class:panel-header--double={double}
  class:panel-header--divider={divider}
  class:no-print={noPrint}
  use:resizeObserver={measureHeader}
>
  <div class="panel-header__row">
    {#if navigatorToggle}
      <span class="panel-header__group no-print">
        <IconButton
          icon={$deviceInfo.navigator.visible ? IconMaximize : IconMinimize}
          kind="ghost"
          size="small"
          tooltip={{ label: $deviceInfo.navigator.visible ? ui.string.HideNavigator : ui.string.ShowNavigator }}
          on:click={() => ($deviceInfo.navigator.visible = !$deviceInfo.navigator.visible)}
        />
      </span>
      <span class="panel-header__divider no-print" />
    {/if}
    {#if $$slots.before}
      <span class="panel-header__group panel-header__before no-print"><slot name="before" {narrow} /></span>
    {/if}
    <div
      class="panel-header__title"
      class:panel-header__title--description={withDescription}
      class:panel-header__title--shrink={adaptive === 'extra'}
      use:resizeObserver={measureTitle}
    >
      <slot {narrow} />
      {#if withDescription}<slot name="description" />{/if}
    </div>
    {#if adaptive === 'extra'}
      <span class="panel-header__space" use:resizeObserver={measureSpace} />
    {/if}
    {#if $$slots.presence}
      <span class="panel-header__group no-print" class:panel-header__side={!double} class:panel-header__second={double}
        ><slot name="presence" {narrow} /></span
      >
    {/if}
    {#if $$slots.search}
      <span
        class="panel-header__group no-print"
        class:panel-header__side={!double}
        class:panel-header__second={double}
        class:panel-header__search={double}><slot name="search" {narrow} /></span
      >
      {#if $$slots.actions}<span class="panel-header__divider panel-header__search-divider no-print" />{/if}
    {/if}
    {#if $$slots.extra}
      <span
        class="panel-header__group panel-header__extra"
        class:panel-header__side={!double}
        class:panel-header__second={double}
        class:panel-header__extra--scroll={scrollExtra}
        class:no-print={double}
        use:resizeObserver={measureExtra}><slot name="extra" {narrow} /></span
      >
    {/if}
    {#if $$slots.actions}
      <span
        class="panel-header__group panel-header__actions no-print"
        class:panel-header__side={!double}
        class:panel-header__second={double && !actionsFirst}><slot name="actions" {narrow} /></span
      >
    {/if}
    {#if closable}
      <span class="panel-header__divider no-print" />
      {#if escape}<span class="panel-header__hotkey no-print" aria-hidden="true"><Kbd keys={['Esc']} /></span>{/if}
      <span class="panel-header__group no-print">
        <IconButton
          id="btnHeaderClose"
          icon={IconClose}
          kind="ghost"
          size="small"
          tooltip={{ label: ui.string.Close }}
          on:click={() => dispatch('close', null)}
        />
      </span>
    {/if}
    {#if double}
      <span class="panel-header__break no-print" />
      <span class="panel-header__space panel-header__space--second no-print" />
    {/if}
  </div>
</div>

<style lang="scss">
  .panel-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    padding: 0 var(--spacing-2);
    width: 100%;
    min-width: 0;
    min-height: var(--spacing-6_5);
    overflow: hidden;

    &--divider {
      border-bottom: 1px solid var(--theme-divider-color);
    }

    &__row {
      display: flex;
      flex-grow: 1;
      align-items: center;
      padding: var(--spacing-1_5) 0;
      min-width: 0;
      min-height: var(--spacing-6_5);
    }

    &__group {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: var(--spacing-1);
      min-width: 0;
    }
    // An empty group (a slot filled conditionally): no gap, no divider; after the base rule of the same weight.
    &__group:not(:has(*)),
    &__group:not(:has(*)) + &__divider {
      display: none;
    }
    &__before {
      gap: var(--spacing-0_5);
      margin-right: var(--spacing-1);
    }
    &__side {
      margin-left: var(--spacing-2);
    }
    &__divider + &__side,
    &__divider + &__group:not(:has(*)) + &__side {
      margin-left: 0;
    }
    &--double &__actions {
      margin-left: var(--spacing-2);
    }

    // Two rows: the break line wraps the groups marked second onto a row of their own.
    &--double &__row {
      flex-wrap: wrap;
    }
    // Holds the first row at the height of a button, as the second one is held by its space.
    &--double &__row::before {
      content: '';
      height: var(--spacing-4);
    }
    &__break {
      flex-basis: 100%;
      order: 1;
      margin: var(--spacing-1_5) 0;
      border-top: 1px solid var(--theme-divider-color);
    }
    &__second {
      order: 2;
    }
    &__space--second {
      order: 3;
      min-height: var(--spacing-4);
    }
    &__second.panel-header__extra,
    &__second.panel-header__actions {
      order: 4;
    }
    &--double &__search-divider {
      display: none;
    }
    // The actions slot passed but empty: nothing for the search divider to part from (one :has, a nested one voids the rule).
    &__row:not(:has(> .panel-header__actions > *)) > &__search-divider {
      display: none;
    }
    // Nothing left for the second row: the first one stands alone.
    &__row:not(:has(> .panel-header__second *)) > &__break,
    &__row:not(:has(> .panel-header__second *)) > &__space--second {
      display: none;
    }

    &__title {
      display: flex;
      flex-grow: 1;
      align-items: center;
      gap: var(--spacing-0_5);
      min-width: 0;
      user-select: text;

      &--description {
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
      }
      &--shrink {
        flex-grow: 0;
      }
    }
    &__space {
      flex: 1 1;
    }

    &__extra {
      flex-shrink: 1;

      &--scroll {
        overflow-x: auto;
        margin: 0 calc(-1 * var(--spacing-0_5)) 0 var(--spacing-2);
        padding: var(--spacing-0_5);
      }
    }
    &__search {
      flex-direction: row-reverse;
    }

    // Wrapping counts natural widths: what one row shrinks starts from zero here and grows up to its content first.
    &--double &__title {
      flex-basis: 0;
    }
    &--double &__title--shrink,
    &--double &__extra {
      flex: 1000 1 0;
      max-width: max-content;
    }

    &__divider {
      flex-shrink: 0;
      margin: 0 var(--spacing-2);
      width: 1px;
      height: var(--spacing-4);
      background-color: var(--theme-divider-color);
    }

    &__hotkey {
      display: flex;
      flex-shrink: 0;
      margin-right: var(--spacing-1);
    }
  }
</style>
