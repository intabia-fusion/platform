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
<script lang="ts" generics="Id extends string | number = string">
  import { createEventDispatcher, onMount } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import { tooltip } from '../../tooltips'
  import type {
    SegmentedControlEvents,
    SegmentedControlItem,
    SegmentedControlProps,
    SegmentedControlSize
  } from './types'

  type $$Props = SegmentedControlProps<Id>
  type $$Events = SegmentedControlEvents<Id>

  export let items: Array<SegmentedControlItem<Id>>
  export let selected: Id | undefined = undefined
  export let size: SegmentedControlSize | undefined = undefined
  export let iconOnly: boolean = false

  const dispatch = createEventDispatcher<{ select: Id }>()
  const segments: HTMLButtonElement[] = []

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedSize = size ?? 'small'

  // One tab stop: the selected segment, or the first enabled one while nothing is selected.
  $: focusId =
    items.find((it) => it.id === selected && it.disabled !== true)?.id ?? items.find((it) => it.disabled !== true)?.id

  function select (item: SegmentedControlItem<Id>): void {
    if (item.disabled === true || item.id === selected) return
    selected = item.id
    dispatch('select', item.id)
    reveal(items.indexOf(item))
  }

  let track: HTMLDivElement | undefined

  // Scrolls only the track: scrollIntoView would also scroll the page to a control below the fold.
  function reveal (index: number): void {
    const segment = segments[index]
    if (track === undefined || segment === undefined) return
    const start = segment.offsetLeft - track.offsetLeft
    const end = start + segment.offsetWidth
    if (start < track.scrollLeft) track.scrollLeft = start
    else if (end > track.scrollLeft + track.clientWidth) track.scrollLeft = end - track.clientWidth
  }

  onMount(() => {
    reveal(items.findIndex((it) => it.id === selected))
  })

  function handleKeydown (event: KeyboardEvent, index: number): void {
    const enabled = items.map((it, i) => ({ it, i })).filter(({ it }) => it.disabled !== true)
    const pos = enabled.findIndex(({ i }) => i === index)
    if (pos === -1) return
    let next: number | undefined
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = enabled[(pos + 1) % enabled.length].i
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = enabled[(pos - 1 + enabled.length) % enabled.length].i
        break
      case 'Home':
        next = enabled[0].i
        break
      case 'End':
        next = enabled[enabled.length - 1].i
        break
      default:
        return
    }
    event.preventDefault()
    select(items[next])
    segments[next]?.focus()
  }
</script>

<!-- The scroller keeps room for the focus ring around the track, so no place has to make room for it. -->
<div bind:this={track} class="segmented-control-scroll">
  <div class="segmented-control segmented-control--{resolvedSize}" role="radiogroup" {...$$restProps}>
    {#each items as item, i (item.id)}
      {@const labelHidden = iconOnly && item.icon !== undefined}
      <button
        bind:this={segments[i]}
        type="button"
        role="radio"
        class="segmented-control__segment"
        class:segmented-control__segment--icon-only={labelHidden}
        aria-checked={item.id === selected}
        tabindex={item.id === focusId ? 0 : -1}
        disabled={item.disabled}
        data-id={`tab-${item.id}`}
        use:tooltip={labelHidden ? { label: item.label, props: item.labelParams, timeout: 500 } : undefined}
        on:click={() => {
          select(item)
        }}
        on:keydown={(event) => {
          handleKeydown(event, i)
        }}
      >
        {#if item.icon !== undefined}
          <span class="segmented-control__icon"><Icon icon={item.icon} size="small" /></span>
        {/if}
        <span class="segmented-control__label" class:segmented-control__label--hidden={labelHidden}>
          <Label label={item.label} params={item.labelParams} />
        </span>
        {#if item.badge !== undefined && !labelHidden}
          <span class="segmented-control__badge"><Label label={item.badge} params={item.badgeParams} /></span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style lang="scss">
  // Too many segments for the place scroll; the negative margin hides the ring room from the layout.
  .segmented-control-scroll {
    --_ring: var(--spacing-0_5);
    display: inline-flex;
    margin: calc(-1 * var(--_ring));
    padding: var(--_ring);
    min-width: 0;
    max-width: calc(100% + 2 * var(--_ring));
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .segmented-control {
    display: inline-flex;
    flex-shrink: 0;
    align-items: stretch;
    gap: var(--spacing-0_25);
    padding: var(--spacing-0_25);
    // The blue-gray plate of the breadcrumbs: the selector token matched the page, a text tint looked too dark.
    background-color: color-mix(in srgb, var(--global-ui-hover-BackgroundColor) 50%, transparent);
    border-radius: var(--small-BorderRadius);

    &__segment {
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      gap: var(--spacing-0_75);
      margin: 0;
      padding: 0 var(--spacing-1_5);
      border: none;
      border-radius: calc(var(--small-BorderRadius) - var(--spacing-0_25));
      background-color: transparent;
      font-family: var(--font-family);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1rem;
      white-space: nowrap;
      color: var(--global-secondary-TextColor);
      cursor: pointer;
      user-select: none;

      &--icon-only {
        padding: 0;
        aspect-ratio: 1;
      }
      &:focus-visible {
        outline: 2px solid var(--global-focus-BorderColor);
        outline-offset: 2px;
      }
      // Half the button hover: a full gray plate competed with the selected segment.
      &:not(:disabled):hover {
        color: var(--global-primary-TextColor);
        background-color: color-mix(in srgb, var(--button-tertiary-hover-BackgroundColor) 50%, transparent);

        .segmented-control__icon {
          color: var(--global-primary-IconColor);
        }
      }
      &[aria-checked='true'] {
        color: var(--button-selected-LabelColor);
        background-color: var(--button-selected-BackgroundColor);
        cursor: default;

        &:not(:disabled):hover {
          color: var(--button-selected-LabelColor);
          background-color: var(--button-selected-BackgroundColor);
        }
        .segmented-control__icon {
          color: var(--button-selected-IconColor);
        }
      }
      &:disabled {
        color: var(--button-disabled-LabelColor);
        cursor: not-allowed;

        .segmented-control__icon {
          color: var(--button-disabled-IconColor);
        }
      }
    }
    &__icon {
      display: flex;
      color: var(--global-secondary-TextColor);
    }
    &__label--hidden {
      position: absolute;
      overflow: hidden;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    &__badge {
      padding: var(--spacing-0_25) var(--spacing-0_5);
      font-size: 0.625rem;
      line-height: 0.75rem;
      color: var(--theme-state-positive-color);
      background-color: var(--theme-state-positive-background-color);
      border-radius: var(--min-BorderRadius);
    }

    // The control keeps the height of the size; segments sit inside its padding.
    &--medium {
      height: var(--global-medium-Size);
      border-radius: var(--medium-BorderRadius);
    }
    &--small {
      height: var(--global-small-Size);
    }
    &--extra-small {
      height: var(--global-extra-small-Size);
      border-radius: var(--extra-small-BorderRadius);

      .segmented-control__segment {
        gap: var(--spacing-0_5);
        padding: 0 var(--spacing-1);
        border-radius: calc(var(--extra-small-BorderRadius) - var(--spacing-0_25));
        font-size: 0.75rem;

        &--icon-only {
          padding: 0;
        }
      }
    }
    &--medium .segmented-control__segment {
      padding: 0 var(--spacing-2);
      border-radius: calc(var(--medium-BorderRadius) - var(--spacing-0_25));

      &--icon-only {
        padding: 0;
      }
    }
  }
</style>
