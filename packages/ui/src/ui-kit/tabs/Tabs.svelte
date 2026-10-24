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
  import { createEventDispatcher } from 'svelte'

  import Icon from '../../components/Icon.svelte'
  import Label from '../../components/Label.svelte'
  import type { TabsEvents, TabsItem, TabsProps, TabsSize } from './types'

  type $$Props = TabsProps<Id>
  type $$Events = TabsEvents<Id>

  export let items: Array<TabsItem<Id>>
  export let selected: Id | undefined = undefined
  export let size: TabsSize | undefined = undefined

  const dispatch = createEventDispatcher<{ select: Id }>()
  const tabs: HTMLButtonElement[] = []

  // Defaults resolve here: a declaration default applies only at mount, a prop later set to undefined stays undefined.
  $: resolvedSize = size ?? 'medium'

  // One tab stop: the selected tab, or the first enabled one while nothing is selected.
  $: focusId =
    items.find((it) => it.id === selected && it.disabled !== true)?.id ?? items.find((it) => it.disabled !== true)?.id

  function select (item: TabsItem<Id>): void {
    if (item.disabled === true || item.id === selected) return
    selected = item.id
    dispatch('select', item.id)
  }

  function reveal (index: number): void {
    // The row scrolls when the tabs do not fit; jsdom has no scrollIntoView.
    tabs[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }

  function handleKeydown (event: KeyboardEvent, index: number): void {
    const enabled = items.map((it, i) => ({ it, i })).filter(({ it }) => it.disabled !== true)
    const pos = enabled.findIndex(({ i }) => i === index)
    if (pos === -1) return
    let next: number | undefined
    switch (event.key) {
      case 'ArrowRight':
        next = enabled[(pos + 1) % enabled.length].i
        break
      case 'ArrowLeft':
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
    tabs[next]?.focus()
    reveal(next)
  }
</script>

<div class="tabs tabs--{resolvedSize}" role="tablist" aria-orientation="horizontal" {...$$restProps}>
  {#each items as item, i (item.id)}
    <button
      bind:this={tabs[i]}
      type="button"
      role="tab"
      class="tabs__tab"
      id={item.tabId}
      aria-controls={item.controls}
      aria-selected={item.id === selected}
      tabindex={item.id === focusId ? 0 : -1}
      disabled={item.disabled}
      data-id={`tab-${item.id}`}
      on:click={() => {
        select(item)
        reveal(i)
      }}
      on:keydown={(event) => {
        handleKeydown(event, i)
      }}
    >
      {#if item.icon !== undefined}
        <span class="tabs__icon"><Icon icon={item.icon} size="small" /></span>
      {/if}
      <span class="tabs__label"><Label label={item.label} params={item.labelParams} /></span>
    </button>
  {/each}
</div>

<style lang="scss">
  .tabs {
    // Air between the label and its focus ring; at the row ends the ring stops at the edge, which the scroll would clip.
    --_ring: var(--spacing-0_75);

    display: flex;
    // The row fills the height of the place (a header), never lower than the size.
    align-self: stretch;
    align-items: stretch;
    gap: var(--spacing-3);
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    &__tab {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
      justify-content: center;
      align-items: center;
      gap: var(--spacing-0_75);
      margin: 0;
      padding: 0;
      border: none;
      background-color: transparent;
      font-family: var(--font-family);
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1rem;
      white-space: nowrap;
      color: var(--global-secondary-TextColor);
      cursor: pointer;
      user-select: none;

      &:focus-visible {
        outline: none;
      }
      // A ring around the label with air on every side, inside the row height that the scroll would clip.
      &:focus-visible::before {
        position: absolute;
        content: '';
        inset: var(--spacing-0_5) calc(-1 * var(--_ring));
        border: 2px solid var(--global-focus-BorderColor);
        border-radius: var(--extra-small-BorderRadius);
        pointer-events: none;
      }
      &:first-child:focus-visible::before {
        left: 0;
      }
      &:last-child:focus-visible::before {
        right: 0;
      }
      &:not(:disabled):hover {
        color: var(--global-primary-TextColor);

        .tabs__icon {
          color: var(--global-primary-IconColor);
        }
      }
      &[aria-selected='true'] {
        color: var(--global-primary-TextColor);
        cursor: default;

        .tabs__icon {
          color: var(--global-primary-IconColor);
        }
      }
      &:disabled {
        color: var(--button-disabled-LabelColor);
        cursor: not-allowed;

        .tabs__icon {
          color: var(--button-disabled-IconColor);
        }
      }
    }
    &__icon {
      display: flex;
      color: var(--global-secondary-TextColor);
    }
    &__label {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tabs__tab::after {
      position: absolute;
      content: '';
      right: 0;
      bottom: 0;
      left: 0;
      height: 2px;
      border-radius: 1px 1px 0 0;
    }
    .tabs__tab[aria-selected='true']::after {
      background-color: var(--kit-button-primary-BackgroundColor);
    }
    &--medium {
      min-height: var(--global-large-Size);
    }
    &--small {
      gap: var(--spacing-2);
      min-height: var(--global-medium-Size);
    }
  }
</style>
