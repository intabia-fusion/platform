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
  import { createEventDispatcher, onMount } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import ui from '../../plugin'
  import { tooltip } from '../../tooltips'
  import type { IconComponent, IconSize } from '../../types'
  import IconButton from '../button/IconButton.svelte'
  import type { WorkbenchTabEvents, WorkbenchTabKind, WorkbenchTabOrientation, WorkbenchTabProps } from './types'

  type $$Props = WorkbenchTabProps
  type $$Events = WorkbenchTabEvents
  interface $$Slots {
    prefix: Record<string, never>
    suffix: Record<string, never>
  }

  export let label: IntlString
  export let labelParams: Record<string, any> = {}
  export let icon: IconComponent | undefined = undefined
  export let iconProps: Record<string, any> | undefined = undefined
  export let iconSize: IconSize = 'x-small'
  export let selected: boolean = false
  export let closable: boolean = false
  export let preview: boolean = false
  export let kind: WorkbenchTabKind = 'secondary'
  export let orientation: WorkbenchTabOrientation = 'horizontal'
  export let tabindex: number | undefined = undefined

  const dispatch = createEventDispatcher<{ close: null, menu: MouseEvent }>()
  let element: HTMLDivElement
  // Roving focus needs a strip: a tab on its own would otherwise be out of the Tab order.
  let standalone = false

  onMount(() => {
    standalone = element.closest('[role="tablist"]') === null
  })

  function close (): void {
    dispatch('close', null)
  }

  // A middle click closes a closable tab, as in the tab strips of the browser.
  function handleAuxClick (event: MouseEvent): void {
    if (event.button !== 1 || !closable) return
    event.preventDefault()
    close()
  }

  function handleContextMenu (event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    dispatch('menu', event)
  }

  // Arrows move along the strip the place owns, so the tab finds its siblings in the nearest tablist.
  function moveFocus (key: string): boolean {
    const strip = element.closest('[role="tablist"]')
    if (strip === null) return false
    const all = Array.from(strip.querySelectorAll<HTMLElement>('[role="tab"]'))
    const index = all.indexOf(element)
    const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
    const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
    let target: HTMLElement | undefined
    if (key === next) target = all[(index + 1) % all.length]
    else if (key === prev) target = all[(index - 1 + all.length) % all.length]
    else if (key === 'Home') target = all[0]
    else if (key === 'End') target = all[all.length - 1]
    if (target === undefined) return false
    target.focus()
    target.click()
    return true
  }

  function handleKeydown (event: KeyboardEvent): void {
    if (event.target !== element) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      element.click()
    } else if (event.key === 'Delete' && closable) {
      event.preventDefault()
      close()
    } else if (moveFocus(event.key)) {
      event.preventDefault()
    }
  }
</script>

<div
  bind:this={element}
  class="tab tab--{kind} tab--{orientation}"
  class:tab--selected={selected}
  class:tab--preview={preview}
  class:tab--closable={closable}
  role="tab"
  aria-selected={selected}
  tabindex={tabindex ?? (selected || standalone ? 0 : -1)}
  use:tooltip={{ label, props: labelParams, direction: orientation === 'vertical' ? 'left' : 'bottom', timeout: 500 }}
  {...$$restProps}
  on:click
  on:dblclick
  on:contextmenu={handleContextMenu}
  on:auxclick={handleAuxClick}
  on:keydown={handleKeydown}
>
  <slot name="prefix" />
  {#if icon !== undefined}
    <span class="tab__icon"><Icon {icon} size={iconSize} {iconProps} /></span>
  {/if}
  <span class="tab__label"><Label {label} params={labelParams} /></span>
  <slot name="suffix" />
  {#if closable}
    <span class="tab__close">
      <!-- Out of the Tab order: Delete closes the focused tab. -->
      <IconButton
        icon={ui.icon.Cross}
        kind="ghost"
        size="min"
        iconSize="x-small"
        tabindex={-1}
        tooltip={{ label: ui.string.Close }}
        on:click={close}
      />
    </span>
  {/if}
</div>

<style lang="scss">
  .tab {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
    max-width: 100%;
    border: 1px solid var(--_border);
    border-radius: var(--extra-small-BorderRadius);
    background-color: var(--_bg);
    font-family: var(--font-family);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1rem;
    color: var(--global-primary-TextColor);
    cursor: pointer;
    user-select: none;

    // Tabs live in scrolling strips that clip anything outside: the ring is drawn over the tab's own edge.
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: -1px;
    }
    &:hover {
      --_bg: var(--_bg-hover);
    }

    &--secondary {
      --_border: transparent;
      --_bg: var(--kit-button-secondary-BackgroundColor);
      --_bg-hover: var(--kit-button-secondary-hover-BackgroundColor);
    }
    &--outline {
      --_border: var(--kit-button-secondary-BorderColor);
      --_bg: transparent;
      --_bg-hover: var(--button-tertiary-hover-BackgroundColor);
    }
    &--selected {
      --_bg: var(--button-selected-BackgroundColor);
      --_bg-hover: var(--button-selected-BackgroundColor);
      color: var(--button-selected-LabelColor);
      cursor: default;

      .tab__icon {
        color: var(--button-selected-IconColor);
      }
    }
    &--preview .tab__label {
      font-style: italic;
    }

    &--horizontal {
      height: var(--spacing-3_5);
      min-width: var(--global-max-Size);
      padding: 0 var(--spacing-0_5) 0 var(--spacing-1);
    }
    &--vertical {
      width: var(--spacing-3_5);
      min-height: var(--global-max-Size);
      max-height: 100%;
      padding: var(--spacing-1) 0 var(--spacing-0_5);
      writing-mode: vertical-rl;
    }
    // The close button brings its own room: without it the end takes the same inset as the start.
    &--horizontal:not(.tab--closable) {
      padding-right: var(--spacing-1);
    }
    &--vertical:not(.tab--closable) {
      padding-bottom: var(--spacing-1);
    }

    &__icon {
      display: flex;
      flex-shrink: 0;
      color: var(--global-secondary-TextColor);
    }
    &--vertical &__icon,
    &--vertical &__close {
      writing-mode: horizontal-tb;
    }
    &__label {
      flex-grow: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &__close {
      display: flex;
      flex-shrink: 0;
    }
  }
</style>
