<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import {
    CategoryType,
    Class,
    Doc,
    DocumentQuery,
    FindOptions,
    IdMap,
    RateLimiter,
    Ref,
    Space,
    toIdMap
  } from '@hcengineering/core'
  import ui, { Button, IconMoreH, Lazy, mouseAttractor } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { CardDragEvent, DocWithRank, Item } from '../types'
  import { createQuery } from '@hcengineering/presentation'

  export let stateObjects: Item[]
  export let isDragging: boolean
  export let dragCard: Item | undefined
  export let objects: Item[]
  export let selection: number | undefined = undefined
  export let checkedSet: Set<Ref<Doc>>
  export let state: CategoryType

  export let _class: Ref<Class<DocWithRank>>
  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<DocWithRank> = {}
  export let options: FindOptions<DocWithRank> | undefined = undefined
  export let groupByKey: any
  export let limiter: RateLimiter
  export let swimLaneQuery: DocumentQuery<DocWithRank> | undefined = undefined
  export let initialLimit: number = 50
  export let limitStep: number = 20

  export let cardDragOver: (evt: CardDragEvent, object: Item) => void
  export let cardDrop: (evt: CardDragEvent, object: Item) => void
  export let onDragStart: (object: Item, state: CategoryType) => void
  export let showMenu: (evt: MouseEvent, object: Item) => void

  const dispatch = createEventDispatcher()

  function toAny (object: any): any {
    return object
  }

  const stateRefs: HTMLElement[] = []

  $: stateRefs.length = stateObjects.length
  export function scroll (item: Item): void {
    const pos = stateObjects.findIndex((it) => it._id === item._id)
    if (pos >= 0) {
      stateRefs[pos]?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  }

  let limit = initialLimit
  let previousInitialLimit = initialLimit

  $: if (initialLimit !== previousInitialLimit) {
    if (limit === previousInitialLimit) {
      limit = initialLimit
    } else {
      limit = Math.max(limit, initialLimit)
    }
    previousInitialLimit = initialLimit
  }

  let limitedObjects: IdMap<DocWithRank> = new Map()

  const docQuery = createQuery()

  // Avoid re-running docQuery.query on every reactive tick: rebuild the query
  // only when its real inputs change. dragCard reordering re-runs the parent
  // reactivity chain — without this guard we'd fire a server query per swap.
  let queryKey = ''
  let lastQueryKey = ''
  $: queryKey = JSON.stringify({
    q: query,
    sl: swimLaneQuery ?? null,
    gk: groupByKey,
    s: typeof state === 'object' ? (state.name ?? state.values.flatMap((x) => x._id)) : state,
    o: options,
    l: limit
  })

  $: if (queryKey !== lastQueryKey) {
    lastQueryKey = queryKey
    const groupQuery = {
      ...query,
      ...(swimLaneQuery ?? {}),
      [groupByKey]:
        typeof state === 'object'
          ? state.name !== undefined
            ? { $in: state.values.flatMap((x) => x._id) }
            : undefined
          : state
    }
    docQuery.query(
      _class,
      groupQuery,
      (res) => {
        limitedObjects = toIdMap(res)
      },
      { ...options, limit }
    )
  }

  function getObject (_id: Ref<DocWithRank>, limitedObjects: IdMap<DocWithRank>): DocWithRank | undefined {
    return limitedObjects.get(_id) ?? (_id === dragCard?._id ? dragCard : undefined)
  }

  $: hasMoreToShow = stateObjects.some((o) => !limitedObjects.has(o._id) && o._id !== dragCard?._id)

  // Force native HTML5 drag image to be the whole card wrapper instead of the
  // narrow inner element (e.g. an anchor in the title) the user may have
  // grabbed onto.
  function forceWrapperDragImage (evt: DragEvent): void {
    const target = evt.currentTarget
    if (!(target instanceof HTMLElement) || evt.dataTransfer === null) return
    const rect = target.getBoundingClientRect()
    evt.dataTransfer.setDragImage(target, evt.clientX - rect.left, evt.clientY - rect.top)
  }
</script>

{#each stateObjects as objectRef, i (objectRef._id)}
  {@const dragged = isDragging && objectRef._id === dragCard?._id}
  {@const object = getObject(objectRef._id, limitedObjects)}
  {#if object !== undefined}
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      bind:this={stateRefs[i]}
      class="p-1 flex-no-shrink border-radius-1 clear-mins"
      on:dragover|preventDefault={(evt) => {
        cardDragOver(evt, object)
      }}
      on:drop|preventDefault|stopPropagation={(evt) => {
        cardDrop(evt, object)
      }}
    >
      <div
        class="card-container"
        data-id="kanban-card"
        data-card-id={object._id}
        class:selection={selection !== undefined ? objects[selection]?._id === object._id : false}
        class:checked={checkedSet.has(object._id)}
        on:mouseover={mouseAttractor(() => dispatch('obj-focus', object))}
        on:mouseenter={mouseAttractor(() => dispatch('obj-focus', object))}
        on:focus={() => {}}
        on:contextmenu={(evt) => {
          showMenu(evt, object)
        }}
        draggable={true}
        class:draggable={true}
        class:dragged
        on:dragstart={(evt) => {
          forceWrapperDragImage(evt)
          onDragStart(object, state)
        }}
        on:dragend={() => {
          isDragging = false
        }}
      >
        <Lazy>
          <slot name="card" object={toAny(object)} {dragged} />
        </Lazy>
      </div>
    </div>
  {/if}
{/each}
{#if stateObjects.length > limit && hasMoreToShow}
  <div class="p-1 flex-no-shrink clear-mins">
    <div class="card-container flex-center flex-row-center p-4 gap-2 no-word-wrap">
      <span class="caption-color">{limitedObjects.size}</span> <span>/</span><span>{stateObjects.length}</span>
      <Button
        size={'small'}
        icon={IconMoreH}
        label={ui.string.ShowMore}
        on:click={() => {
          limit = limit + limitStep
        }}
      />
    </div>
  </div>
{/if}

<style lang="scss">
  .card-container {
    background-color: var(--theme-kanban-card-bg-color);
    border: 1px solid var(--theme-kanban-card-border);
    border-radius: 0.25rem;

    &.checked {
      background-color: var(--highlight-select);
      box-shadow: 0 0 1px 1px var(--highlight-select-border);

      &:hover {
        background-color: var(--highlight-select-hover);
      }
    }
    &.selection,
    &.checked.selection {
      /* Use accent-aware edit border and inset box-shadow so the animated border uses
         the same accent token that the theme provides (avoids abrupt color jumps). */
      box-shadow: inset 0 0 1px 1px var(--primary-edit-border-color, var(--primary-button-default));

      &:hover {
        background-color: var(--highlight-hover);
      }
    }
    &.checked.selection:hover {
      background-color: var(--highlight-select-hover);
    }

    &.draggable {
      cursor: grab;
    }
    &.dragged {
      /* Prefer an explicit accent surface when available, otherwise fall back to the theme accent surface. */
      background-color: var(--accent-bg-color, var(--theme-bg-accent-color));
    }
  }
</style>
