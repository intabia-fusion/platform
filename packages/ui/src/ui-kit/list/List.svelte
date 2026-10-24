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
<script lang="ts" generics="Item = unknown">
  import { afterUpdate, createEventDispatcher, tick } from 'svelte'

  import Lazy from '../../components/Lazy.svelte'
  import { resizeObserver } from '../../resize'
  import { mouseAttractor } from '../../utils'
  import type { ListEvents, ListProps, ListTone } from './types'

  type $$Props = ListProps<Item>
  type $$Events = ListEvents

  export let count: number
  export let items: Item[] = []
  export let selection: number = 0
  export let highlighted: number | undefined = undefined
  export let inset: boolean = true
  export let tone: ListTone = 'neutral'
  export let scroll: boolean = true
  export let hoverSelects: boolean = true
  export let lazy: boolean = false
  export let rowMinHeight: string | undefined = undefined
  export let getKey: (index: number) => string = (index) => index.toString()

  const dispatch = createEventDispatcher<{ select: number, activate: number, resize: null }>()
  const uid = `list-${Math.random().toString(36).slice(2, 10)}`
  let root: HTMLElement | undefined

  // A wheel scroll moves rows under a still pointer; a burst of hovers must not walk the selection.
  let lastMove = 0

  $: values = items.length > 0 ? items : (Array(count) as Array<Item | undefined>)

  function moveTo (index: number): boolean {
    const now = Date.now()
    if (now - lastMove < 25) return false
    lastMove = now
    selection = index
    dispatch('select', index)
    return true
  }

  /** Makes `pos` (clamped to the rows) the current row and scrolls it into view. */
  export function select (pos: number): void {
    if (count <= 0) return
    const index = Math.max(0, Math.min(pos, count - 1))
    lastMove = 0
    moveTo(index)
    // The slot around the row: a lazy row may not be mounted yet.
    root?.querySelector(`:scope > [data-index="${index}"]`)?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
  }

  /**
   * Keys of the place's field that keeps the focus (a search above the list), or of the focused list itself:
   * arrows, Home / End, PageUp / PageDown move the current row, Enter activates it. `true` when the key was used.
   */
  export function onKeydown (event: KeyboardEvent): boolean {
    if (count <= 0) return false
    const rowHeight = root?.querySelector('.list__row')?.clientHeight ?? 0
    const page = rowHeight > 0 ? Math.max(1, Math.floor((root?.clientHeight ?? 0) / rowHeight)) : 10
    if (event.key === 'ArrowDown') select(selection + 1)
    else if (event.key === 'ArrowUp') select(selection - 1)
    else if (event.key === 'Home') select(0)
    else if (event.key === 'End') select(count - 1)
    else if (event.key === 'PageDown') select(selection + page)
    else if (event.key === 'PageUp') select(selection - page)
    else if (event.key === 'Enter') dispatch('activate', selection)
    else return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  function handleKeydown (event: KeyboardEvent): void {
    // Keys inside the row markup (a button, a field) belong to it.
    if (event.target !== root) return
    onKeydown(event)
  }

  function indexOf (event: Event): number | undefined {
    const slot = (event.target as HTMLElement | null)?.closest<HTMLElement>('.list__slot')
    if (slot == null || slot.parentElement !== root) return undefined
    const index = Number(slot.dataset.index)
    return Number.isNaN(index) ? undefined : index
  }

  let hovered: number | undefined
  // One listener for all rows instead of a pair per row.
  const attract = mouseAttractor(() => {
    if (hovered !== undefined && hoverSelects && hovered !== selection) moveTo(hovered)
  })

  function handlePointer (event: MouseEvent): void {
    hovered = indexOf(event)
    if (hovered !== undefined) attract(event)
  }

  // Pointer tracking is an extra for the mouse (the keyboard has its own keys), so it is no focus-less handler on the list.
  function trackPointer (node: HTMLElement): { destroy: () => void } {
    node.addEventListener('mouseover', handlePointer)
    node.addEventListener('mousemove', handlePointer)
    return {
      destroy: () => {
        node.removeEventListener('mouseover', handlePointer)
        node.removeEventListener('mousemove', handlePointer)
      }
    }
  }

  $: currentId = selection >= 0 && selection < count ? `${uid}-${selection}` : undefined
  // A lazy row is not in the page until scrolled to: pointing at a missing id would name nothing.
  let mountedId: string | undefined
  $: activeId = lazy ? mountedId : currentId

  function syncMounted (): void {
    const next = currentId !== undefined && root?.querySelector(`[id="${currentId}"]`) != null ? currentId : undefined
    if (next !== mountedId) mountedId = next
  }

  function onRowVisible (): void {
    void tick().then(syncMounted)
  }

  afterUpdate(() => {
    if (lazy) syncMounted()
  })

  function handleClick (event: MouseEvent): void {
    const index = indexOf(event)
    if (index !== undefined && (event.target as HTMLElement).closest('.list__row') !== null) dispatch('activate', index)
  }
</script>

{#if count > 0}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-tabindex -->
  <div
    bind:this={root}
    class="list"
    class:list--inset={inset}
    class:list--tint={tone === 'tint'}
    class:list--scroll={scroll}
    role="listbox"
    tabindex="0"
    aria-activedescendant={activeId}
    use:resizeObserver={() => {
      dispatch('resize', null)
    }}
    {...$$restProps}
    on:keydown={handleKeydown}
    use:trackPointer
    on:click={handleClick}
  >
    {#each values as value, index (getKey(index))}
      <slot name="category" {index} {value} />
      <div class="list__slot" data-index={index} style:min-height={lazy ? rowMinHeight : undefined}>
        {#if lazy}
          <Lazy on:visible={onRowVisible}>
            <div
              id={`${uid}-${index}`}
              class="list__row"
              class:list__row--current={index === selection}
              class:list__row--highlighted={index === highlighted}
              role="option"
              aria-selected={index === selection}
            >
              <slot name="item" {index} {value} selected={index === selection} />
            </div>
          </Lazy>
        {:else}
          <div
            id={`${uid}-${index}`}
            class="list__row"
            class:list__row--current={index === selection}
            class:list__row--highlighted={index === highlighted}
            role="option"
            aria-selected={index === selection}
          >
            <slot name="item" {index} {value} selected={index === selection} />
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style lang="scss">
  .list {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
    overflow: visible;

    &--scroll {
      overflow: auto;
    }
    &:focus {
      outline: none;
    }
    &:focus-visible {
      outline: 2px solid var(--global-focus-BorderColor);
      outline-offset: -2px;
    }

    &__slot {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    &__row {
      min-width: 0;
      outline: none;
    }
    &--inset &__row {
      margin: 0 var(--spacing-1);
      border-radius: var(--extra-small-BorderRadius);
    }

    // One neutral plate in a popup and on a panel; the popup hover token is lost on the dark popup.
    &__row--current {
      background-color: var(--button-tertiary-hover-BackgroundColor);
    }
    // A paler shade of the selection tint, as in NavItem: for lists that sit beside an open object.
    &--tint &__row--current {
      background-color: color-mix(in srgb, var(--button-selected-BackgroundColor) 55%, transparent);
    }
    // The open object wins over the current row (declared after it, same weight as the tint rule): the pointer does not change it.
    &__row--highlighted,
    &--tint &__row--highlighted {
      background-color: var(--button-selected-BackgroundColor);
    }
  }
</style>
