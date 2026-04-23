<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import {
    CategoryType,
    Class,
    Doc,
    DocumentQuery,
    DocumentUpdate,
    FindOptions,
    type Rank,
    RateLimiter,
    Ref,
    Space
  } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/rank'
  import { IconChevronDown, IconChevronRight, ScrollBox, Scroller } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'
  import { CardDragEvent, DocWithRank, Item, SwimLane } from '../types'
  import KanbanRow from './KanbanRow.svelte'

  export let categories: CategoryType[] = []

  export let _class: Ref<Class<DocWithRank>>
  export let space: Ref<Space> | undefined = undefined
  export let query: DocumentQuery<DocWithRank> = {}
  export let options: FindOptions<DocWithRank> | undefined = undefined
  export let objects: DocWithRank[] = []
  export let groupByKey: any

  export let groupByDocs: Record<string | number, Item[]>
  export let getGroupByValues: (groupByDocs: Record<string | number, Item[]>, category: CategoryType) => Item[]
  export let setGroupByValues: (
    groupByDocs: Record<string | number, Item[]>,
    category: CategoryType,
    docs: Item[]
  ) => void

  export let selection: number | undefined = undefined
  export let checked: Doc[] = []
  export let dontUpdateRank: boolean = false

  export let getUpdateProps: (doc: Doc, state: CategoryType) => DocumentUpdate<Item> | undefined
  export let getAvailableCategories: ((doc: Doc) => Promise<CategoryType[]>) | undefined = undefined

  // SwimLane support. When empty - classic kanban layout (legacy).
  export let swimLanes: SwimLane[] = []
  export let swimLaneKey: string | undefined = undefined
  export let getSwimLaneUpdateProps: ((doc: Doc, swimLane: SwimLane) => DocumentUpdate<Item> | undefined) | undefined =
    undefined
  export let getSwimLaneQuery: ((swimLane: SwimLane) => DocumentQuery<DocWithRank>) | undefined = undefined
  export let getSwimLaneOfDoc: ((doc: Doc) => string | undefined) | undefined = undefined
  export let storageKey: string | undefined = undefined
  export let controlKey: string | undefined = undefined
  export let getSwimLaneHeaderStyle:
  | ((swimLane: SwimLane) => { background?: string, color?: string } | undefined)
  | undefined = undefined
  export let compact: boolean = false

  import { registerSwimLaneControls } from '../swimlane'

  let unregisterControls: (() => void) | undefined

  $: if (swimLaneMode && controlKey !== undefined) {
    if (unregisterControls !== undefined) unregisterControls()
    unregisterControls = registerSwimLaneControls(controlKey, { collapseAll, expandAll })
  } else {
    if (unregisterControls !== undefined) {
      unregisterControls()
      unregisterControls = undefined
    }
  }

  onDestroy(() => {
    if (unregisterControls !== undefined) {
      unregisterControls()
      unregisterControls = undefined
    }
  })

  const dispatch = createEventDispatcher()

  const limiter = new RateLimiter(10)

  $: swimLaneMode = swimLanes.length > 0 && swimLaneKey !== undefined

  // Collapse state persisted in localStorage.
  let collapsed = new Set<string>()

  function loadCollapsed (key: string | undefined): Set<string> {
    if (key === undefined || typeof localStorage === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(`kanban-swimlane-collapsed-${key}`)
      if (raw == null) return new Set()
      const arr: string[] = JSON.parse(raw)
      return new Set(arr)
    } catch {
      return new Set()
    }
  }

  function saveCollapsed (key: string | undefined, set: Set<string>): void {
    if (key === undefined || typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(`kanban-swimlane-collapsed-${key}`, JSON.stringify([...set]))
    } catch {
      // ignore
    }
  }

  $: collapsed = loadCollapsed(storageKey)

  function toggleSwimLane (id: string): void {
    if (collapsed.has(id)) collapsed.delete(id)
    else collapsed.add(id)
    collapsed = new Set(collapsed)
    saveCollapsed(storageKey, collapsed)
  }

  function collapseAll (): void {
    collapsed = new Set(swimLanes.map((s) => s._id))
    saveCollapsed(storageKey, collapsed)
  }

  function expandAll (): void {
    collapsed = new Set()
    saveCollapsed(storageKey, collapsed)
  }

  // Filter docs of a category that belong to a given swim lane.
  function getSwimLaneCategoryValues (
    swimLane: SwimLane,
    category: CategoryType,
    _groupByDocs: typeof groupByDocs,
    _dragCard: Item | undefined,
    _dragCardCurrentSwimLane: SwimLane | undefined
  ): Item[] {
    const arr = getGroupByValues(_groupByDocs, category) ?? []
    const ofDoc = getSwimLaneOfDoc
    if (ofDoc === undefined) return arr
    return arr.filter((doc) => {
      if (_dragCard !== undefined && doc._id === _dragCard._id && _dragCardCurrentSwimLane !== undefined) {
        return _dragCardCurrentSwimLane._id === swimLane._id
      }
      return ofDoc(doc) === swimLane._id
    })
  }

  function countSwimLane (swimLane: SwimLane): number {
    let total = 0
    for (const cat of categories) {
      total += getSwimLaneCategoryValues(swimLane, cat, groupByDocs, dragCard, dragCardCurrentSwimLane).length
    }
    return total
  }

  async function move (state: CategoryType, targetSwimLane?: SwimLane): Promise<void> {
    if (dragCard === undefined) {
      return
    }

    const canDrop = dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state)

    if (!canDrop) {
      dragCard = undefined
      dragCardAvailableCategories = undefined
      return
    }

    let updates = getUpdateProps(dragCard, state)

    if (updates === undefined) {
      panelDragLeave(undefined, dragCardState)
      dragCard = undefined
      dragCardAvailableCategories = undefined
      return
    }

    // Merge swim lane field update if target swim lane differs from source.
    if (
      swimLaneMode &&
      targetSwimLane !== undefined &&
      getSwimLaneUpdateProps !== undefined &&
      (dragCardInitialSwimLane === undefined || dragCardInitialSwimLane._id !== targetSwimLane._id)
    ) {
      const swimUpdates = getSwimLaneUpdateProps(dragCard, targetSwimLane)
      if (swimUpdates !== undefined) {
        updates = { ...updates, ...swimUpdates }
      }
    }

    if (!dontUpdateRank && dragCardInitialRank !== dragCard.rank && dragCardInitialRank !== undefined) {
      const dragCardRank = dragCard.rank
      updates = {
        ...updates,
        rank: dragCardRank
      }
      dragCard.rank = dragCardInitialRank
    }
    if (Object.keys(updates).length > 0) {
      await client.diffUpdate(dragCard, updates)
    }
    dragCard = undefined
    dragCardAvailableCategories = undefined
    dragCardCurrentSwimLane = undefined
  }

  const client = getClient()

  let dragCard: Item | undefined
  let dragCardInitialRank: Rank | undefined
  let dragCardInitialState: CategoryType
  let dragCardInitialPosition: number | undefined
  let dragCardState: CategoryType | undefined
  let dragCardAvailableCategories: CategoryType[] | undefined
  let dragCardInitialSwimLane: SwimLane | undefined
  let dragCardCurrentSwimLane: SwimLane | undefined

  let isDragging = false

  async function updateDone (updateValue: DocumentUpdate<Item>): Promise<void> {
    isDragging = false
    if (dragCard === undefined) {
      return
    }
    await client.update(dragCard, updateValue)
  }

  function panelDragOver (event: Event | undefined, state: CategoryType, swimLane?: SwimLane): void {
    event?.preventDefault()
    if (dragCard === undefined) return

    const swimLaneChanged =
      swimLane !== undefined && (dragCardCurrentSwimLane === undefined || dragCardCurrentSwimLane._id !== swimLane._id)

    if (dragCardState !== state || swimLaneChanged) {
      const canDrop = dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state)

      if (!canDrop) {
        return
      }

      const updates = getUpdateProps(dragCard, state)
      if (updates === undefined) {
        return
      }

      if (dragCardState !== state) {
        const oldArr = getGroupByValues(groupByDocs, dragCardState)
        const index = oldArr.findIndex((p) => p._id === dragCard?._id)
        if (index !== -1) {
          oldArr.splice(index, 1)
          setGroupByValues(groupByDocs, dragCardState, oldArr)
        }

        dragCardState = state
        const arr = getGroupByValues(groupByDocs, state) ?? []
        arr.push(dragCard)
        setGroupByValues(groupByDocs, state, arr)
      }

      if (swimLaneChanged) {
        dragCardCurrentSwimLane = swimLane
      }

      groupByDocs = groupByDocs
    }
  }
  function panelDragLeave (event: Event | undefined, state: CategoryType): void {
    event?.preventDefault()
    if (dragCard !== undefined && state !== dragCardInitialState) {
      // We need to restore original position
      const oldArr = getGroupByValues(groupByDocs, state)
      const index = oldArr.findIndex((p) => p._id === dragCard?._id)
      if (index !== -1) {
        oldArr.splice(index, 1)
        setGroupByValues(groupByDocs, state, oldArr)
      }

      if (dragCardInitialPosition !== undefined) {
        const newArr = getGroupByValues(groupByDocs, dragCardInitialState)
        newArr.splice(dragCardInitialPosition, 0, dragCard)
        setGroupByValues(groupByDocs, dragCardInitialPosition, newArr)
      }

      groupByDocs = groupByDocs
    }
  }

  function dragswap (ev: MouseEvent, i: number, s: number): boolean {
    if (s === -1) return false
    if (i < s) {
      return ev.offsetY < (ev.target as HTMLElement).offsetHeight / 2
    } else if (i > s) {
      return ev.offsetY > (ev.target as HTMLElement).offsetHeight / 2
    }
    return false
  }

  interface DragCardOverPos {
    dragCardId: Ref<Doc>
    dragCardPos: number
    overCardId: Ref<Doc>
    overCardPos: number
  }

  let cardOverPos: DragCardOverPos | undefined

  function cardDragOver (evt: CardDragEvent, object: Item, state: CategoryType): void {
    if (dragCard !== undefined && !dontUpdateRank) {
      const updates = getUpdateProps(dragCard, state)
      if (updates === undefined) {
        return
      }
      if (object._id !== dragCard._id) {
        let arr = getGroupByValues(groupByDocs, state) ?? []
        let dragCardIndex = -1
        let targetIndex = -1
        if (
          cardOverPos !== undefined &&
          cardOverPos.overCardId === object._id &&
          cardOverPos.dragCardId === dragCard._id
        ) {
          dragCardIndex = cardOverPos.dragCardPos
          targetIndex = cardOverPos.overCardPos
        } else {
          dragCardIndex = arr.findIndex((p) => p._id === dragCard?._id)
          targetIndex = arr.findIndex((p) => p._id === object._id)
          cardOverPos = {
            dragCardId: dragCard._id,
            dragCardPos: dragCardIndex,
            overCardId: object._id,
            overCardPos: targetIndex
          }
        }

        if (
          dragCardIndex !== -1 &&
          targetIndex !== -1 &&
          dragswap(evt, targetIndex, dragCardIndex) &&
          arr[targetIndex] !== undefined &&
          arr[dragCardIndex] !== undefined
        ) {
          arr.splice(dragCardIndex, 1)
          arr = [...arr.slice(0, targetIndex), dragCard, ...arr.slice(targetIndex)]
          setGroupByValues(groupByDocs, state, arr)
          groupByDocs = groupByDocs
          cardOverPos = undefined
        }
      }
    }
  }

  async function cardDrop (evt: CardDragEvent, object: Item, state: CategoryType): Promise<void> {
    if (!dontUpdateRank && dragCard !== undefined) {
      const arr = getGroupByValues(groupByDocs, state) ?? []
      const s = arr.findIndex((p) => p._id === dragCard?._id)
      if (s !== -1) {
        dragCard.rank = makeRank(arr[s - 1]?.rank, arr[s + 1]?.rank)
        const updates = getUpdateProps(dragCard, state)

        if (updates === undefined) {
          await client.update(dragCard, { rank: dragCard.rank })
        }
      }
    }
    isDragging = false
  }

  async function onDragStart (object: Item, state: CategoryType, swimLane?: SwimLane): Promise<void> {
    dragCardInitialState = state
    dragCardState = state
    dragCardInitialRank = object.rank
    dragCardInitialSwimLane = swimLane
    dragCardCurrentSwimLane = swimLane
    const items = getGroupByValues(groupByDocs, state) ?? []
    dragCardInitialPosition = items.findIndex((p) => p._id === object._id)
    dragCard = object
    isDragging = true
    dragCardAvailableCategories = await getAvailableCategories?.(object)
    dispatch('obj-focus', object)
  }
  // eslint-disable-next-line
  let dragged: boolean = false

  function toAny (object: any): any {
    return object
  }

  const stateRefs: HTMLElement[] = []
  const stateRows: KanbanRow[] = []
  const swimRowBindings: Record<string, KanbanRow> = {}

  $: stateRefs.length = categories.length
  $: stateRows.length = categories.length

  function swimCellKey (laneId: string, stateIdx: number): string {
    return `${laneId}::${stateIdx}`
  }

  function scrollInto (statePos: number, obj: Item, lane?: SwimLane): void {
    if (swimLaneMode && lane !== undefined) {
      swimRowBindings[swimCellKey(lane._id, statePos)]?.scroll(obj)
      return
    }
    stateRefs[statePos]?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    stateRows[statePos]?.scroll(obj)
  }

  function getState (doc: Item): number {
    let pos = 0
    for (const st of categories) {
      const stateObjs = getGroupByValues(groupByDocs, st) ?? []
      if (stateObjs.findIndex((it) => it._id === doc._id) !== -1) {
        return pos
      }
      pos++
    }
    return -1
  }

  function findSwimLaneOfDoc (doc: Doc): SwimLane | undefined {
    if (!swimLaneMode || getSwimLaneOfDoc === undefined) return undefined
    const id = getSwimLaneOfDoc(doc)
    if (id === undefined) return undefined
    return swimLanes.find((s) => s._id === id)
  }

  function visibleSwimLanes (): SwimLane[] {
    return swimLanes.filter((s) => !collapsed.has(s._id))
  }

  function getCellObjects (st: CategoryType, lane?: SwimLane): Item[] {
    if (swimLaneMode && lane !== undefined) {
      return getSwimLaneCategoryValues(lane, st, groupByDocs, dragCard, dragCardCurrentSwimLane)
    }
    return getGroupByValues(groupByDocs, st) ?? []
  }

  export function select (offset: 1 | -1 | 0, of?: Doc, dir?: 'vertical' | 'horizontal'): void {
    let pos = (of != null ? objects.findIndex((it) => it._id === of._id) : selection) ?? -1
    if (pos === -1) {
      const lanes = swimLaneMode ? visibleSwimLanes() : [undefined as SwimLane | undefined]
      for (const lane of lanes) {
        let found = false
        for (const st of categories) {
          const stateObjs = getCellObjects(st, lane)
          if (stateObjs.length > 0) {
            pos = objects.findIndex((it) => it._id === stateObjs[0]._id)
            found = true
            break
          }
        }
        if (found) break
      }
    }

    if (pos < 0) {
      pos = 0
    }
    if (pos >= objects.length) {
      pos = objects.length - 1
    }

    const obj = objects[pos]
    if (obj === undefined) {
      return
    }

    let objState = getState(obj)
    if (objState === -1) {
      return
    }

    const currentLane: SwimLane | undefined = swimLaneMode ? findSwimLaneOfDoc(obj) : undefined
    const stateObjs = getCellObjects(categories[objState], currentLane)
    const statePos = stateObjs.findIndex((it) => it._id === obj._id)
    if (statePos === undefined) {
      return
    }

    const lanes = swimLaneMode ? visibleSwimLanes() : []
    const laneIdx = currentLane !== undefined ? lanes.findIndex((l) => l._id === currentLane?._id) : -1

    if (offset === -1) {
      if (dir === undefined || dir === 'vertical') {
        if (statePos > 0) {
          const next = stateObjs[statePos - 1]
          scrollInto(objState, next, currentLane)
          dispatch('obj-focus', next)
          return
        }
        // cross lanes upward in same column
        if (swimLaneMode && laneIdx > 0) {
          for (let i = laneIdx - 1; i >= 0; i--) {
            const arr = getCellObjects(categories[objState], lanes[i])
            if (arr.length > 0) {
              const next = arr[arr.length - 1]
              scrollInto(objState, next, lanes[i])
              dispatch('obj-focus', next)
              return
            }
          }
        }
        const next = stateObjs[0]
        if (next !== undefined) {
          scrollInto(objState, next, currentLane)
          dispatch('obj-focus', next)
        }
        return
      } else {
        while (objState > 0) {
          objState--
          const nstateObjs = getCellObjects(categories[objState], currentLane)
          if (nstateObjs.length > 0) {
            const next = nstateObjs[statePos] ?? nstateObjs[nstateObjs.length - 1]
            scrollInto(objState, next, currentLane)
            dispatch('obj-focus', next)
            break
          }
        }
      }
    }
    if (offset === 1) {
      if (dir === undefined || dir === 'vertical') {
        if (statePos < stateObjs.length - 1) {
          const next = stateObjs[statePos + 1]
          scrollInto(objState, next, currentLane)
          dispatch('obj-focus', next)
          return
        }
        if (swimLaneMode && laneIdx !== -1 && laneIdx < lanes.length - 1) {
          for (let i = laneIdx + 1; i < lanes.length; i++) {
            const arr = getCellObjects(categories[objState], lanes[i])
            if (arr.length > 0) {
              const next = arr[0]
              scrollInto(objState, next, lanes[i])
              dispatch('obj-focus', next)
              return
            }
          }
        }
        const next = stateObjs[stateObjs.length - 1]
        if (next !== undefined) {
          scrollInto(objState, next, currentLane)
          dispatch('obj-focus', next)
        }
        return
      } else {
        while (objState < categories.length - 1) {
          objState++
          const nstateObjs = getCellObjects(categories[objState], currentLane)
          if (nstateObjs.length > 0) {
            const next = nstateObjs[statePos] ?? nstateObjs[nstateObjs.length - 1]
            scrollInto(objState, next, currentLane)
            dispatch('obj-focus', next)
            break
          }
        }
      }
    }
    if (offset === 0) {
      // scrollInto(objState, obj)
      dispatch('obj-focus', obj)
    }
  }

  $: checkedSet = new Set<Ref<Doc>>(checked.map((it) => it._id))

  export function check (docs: Doc[], value: boolean): void {
    dispatch('check', { docs, value })
  }
  const showMenu = async (evt: MouseEvent, object: Item): Promise<void> => {
    selection = objects.findIndex((p) => p._id === object._id)
    if (!checkedSet.has(object._id)) {
      check(objects, false)
      checked = []
    }
    dispatch('contextmenu', { evt, objects: checked.length > 0 ? checked : object })
  }
</script>

<div class="kanban-container" class:swimlane-mode={swimLaneMode} class:compact>
  {#if swimLaneMode}
    <div class="kanban-swimlane-scroll">
      <div class="kanban-swimlane-root">
        <!-- sticky column headers row -->
        <div class="swimlane-header-row" style:--kanban-col-count={categories.length}>
          {#each categories as state, si (typeof state === 'object' ? state.name : state)}
            {@const stateObjects = getGroupByValues(groupByDocs, state)}
            <div class="swimlane-col-header">
              {#if $$slots.header !== undefined}
                {#key si}
                  <slot name="header" state={toAny(state)} count={stateObjects.length} index={si} />
                {/key}
              {/if}
            </div>
          {/each}
        </div>

        {#each swimLanes as swimLane (swimLane._id)}
          {@const isCollapsed = collapsed.has(swimLane._id)}
          {@const laneCount = countSwimLane(swimLane)}
          {@const laneStyle = getSwimLaneHeaderStyle?.(swimLane)}
          <div class="swimlane-block">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="swimlane-header"
              style:background-color={laneStyle?.background ?? 'var(--theme-panel-color, var(--theme-bg-color))'}
              style:color={laneStyle?.color ?? 'var(--theme-caption-color)'}
              style:--swimlane-title-color={laneStyle?.color}
              on:click={() => {
                toggleSwimLane(swimLane._id)
              }}
            >
              <div class="swimlane-toggle">
                <svelte:component this={isCollapsed ? IconChevronRight : IconChevronDown} size={'small'} />
              </div>
              {#if $$slots.swimLaneHeader !== undefined}
                <slot
                  name="swimLaneHeader"
                  {swimLane}
                  count={laneCount}
                  collapsed={isCollapsed}
                  toggle={() => {
                    toggleSwimLane(swimLane._id)
                  }}
                />
              {:else}
                <span class="swimlane-title">{swimLane.title}</span>
                <span class="swimlane-count">{laneCount}</span>
              {/if}
            </div>

            {#if !isCollapsed}
              <div class="swimlane-grid" style:--kanban-col-count={categories.length}>
                {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                  {@const laneStateObjects = getSwimLaneCategoryValues(
                    swimLane,
                    state,
                    groupByDocs,
                    dragCard,
                    dragCardCurrentSwimLane
                  )}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="swimlane-cell"
                    class:drop-target={isDragging}
                    on:dragover={(event) => {
                      panelDragOver(event, state, swimLane)
                    }}
                    on:drop={() => {
                      void move(state, swimLane).then(() => {
                        isDragging = false
                      })
                    }}
                  >
                    <slot name="beforeCard" {state} {swimLane} />
                    <KanbanRow
                      bind:this={swimRowBindings[swimCellKey(swimLane._id, si)]}
                      on:obj-focus
                      stateObjects={laneStateObjects}
                      {isDragging}
                      {dragCard}
                      {objects}
                      {selection}
                      {checkedSet}
                      {state}
                      {limiter}
                      cardDragOver={(evt, obj) => {
                        cardDragOver(evt, obj, state)
                      }}
                      cardDrop={(evt, obj) => {
                        void cardDrop(evt, obj, state)
                      }}
                      onDragStart={(obj, st) => {
                        void onDragStart(obj, st, swimLane)
                      }}
                      {showMenu}
                      {_class}
                      {query}
                      {options}
                      {groupByKey}
                      swimLaneQuery={getSwimLaneQuery?.(swimLane)}
                      initialLimit={3}
                      limitStep={10}
                    >
                      <svelte:fragment slot="card" let:object let:dragged>
                        <slot name="card" {object} {dragged} {swimLane} />
                      </svelte:fragment>
                    </KanbanRow>

                    <slot name="afterCard" {state} {swimLane} />
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <ScrollBox>
      <div class="kanban-content">
        {#each categories as state, si (typeof state === 'object' ? state.name : state)}
          {@const stateObjects = getGroupByValues(groupByDocs, state)}

          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="panel-container"
            bind:this={stateRefs[si]}
            on:dragover={(event) => {
              panelDragOver(event, state)
            }}
            on:drop={() => {
              void move(state).then(() => {
                isDragging = false
              })
            }}
          >
            {#if $$slots.header !== undefined}
              {#key si}
                <slot name="header" state={toAny(state)} count={stateObjects.length} index={si} />
              {/key}
            {/if}
            <Scroller padding={'.25rem .5rem'} on:dragover on:drop>
              <slot name="beforeCard" {state} />
              <KanbanRow
                bind:this={stateRows[si]}
                on:obj-focus
                {stateObjects}
                {isDragging}
                {dragCard}
                {objects}
                {selection}
                {checkedSet}
                {state}
                {limiter}
                cardDragOver={(evt, obj) => {
                  cardDragOver(evt, obj, state)
                }}
                cardDrop={(evt, obj) => {
                  void cardDrop(evt, obj, state)
                }}
                {onDragStart}
                {showMenu}
                {_class}
                {query}
                {options}
                {groupByKey}
              >
                <svelte:fragment slot="card" let:object let:dragged>
                  <slot name="card" {object} {dragged} />
                </svelte:fragment>
              </KanbanRow>

              <slot name="afterCard" {state} />
            </Scroller>
          </div>
        {/each}
        <slot name="afterPanel" />
      </div>
    </ScrollBox>
  {/if}
  {#if isDragging}
    <slot name="doneBar" onDone={updateDone} />
  {/if}
</div>

<style lang="scss">
  .kanban-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    --kanban-col-width: 20rem;
    --kanban-col-gap: 0.5rem;

    &.compact {
      --kanban-col-width: 14rem;
      --kanban-col-gap: 0.375rem;
    }
  }
  .kanban-content {
    display: flex;
    padding: 1.5rem 1.5rem 0.5rem;
    min-width: 0;
  }

  .panel-container {
    display: flex;
    flex-direction: column;
    width: var(--kanban-col-width);
    min-width: var(--kanban-col-width);
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
  }

  // SwimLane layout
  .kanban-swimlane-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
  .kanban-swimlane-root {
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem 0.5rem;
    width: max-content;
    min-width: 100%;
  }
  .swimlane-header-row {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    grid-template-columns: repeat(var(--kanban-col-count), var(--kanban-col-width));
    gap: var(--kanban-col-gap);
    padding: 1rem 0 0.5rem;
    background-color: var(--theme-panel-color, var(--theme-bg-color));
    border-bottom: 1px solid var(--theme-divider-color);
  }
  .swimlane-col-header {
    width: var(--kanban-col-width);

    :global(> *) {
      margin: 0 !important;
    }
  }

  .swimlane-block {
    display: flex;
    flex-direction: column;
    margin-bottom: 1rem;
    border-radius: 0.375rem;
    background-color: var(--theme-list-row-color, var(--theme-bg-color));
  }
  .swimlane-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    border-bottom: 1px solid var(--theme-divider-color);
    user-select: none;
    position: sticky;
    top: 4rem;
    left: 0;
    z-index: 4;
    width: max-content;
    min-width: 100%;
    box-shadow: 0 1px 0 var(--theme-divider-color);
  }
  .swimlane-toggle {
    display: inline-flex;
    width: 1rem;
    height: 1rem;
  }
  .swimlane-grid {
    display: grid;
    grid-template-columns: repeat(var(--kanban-col-count), var(--kanban-col-width));
    gap: var(--kanban-col-gap);
    padding: 0.5rem 0;
  }
  .swimlane-cell {
    display: flex;
    flex-direction: column;
    width: var(--kanban-col-width);
    min-height: 4rem;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding: 0.25rem 0;
    transition:
      background-color 0.12s ease,
      border-color 0.12s ease;

    &.drop-target {
      background-color: var(--theme-drop-zone-bg-color, var(--theme-button-hovered));
      border: 1px dashed var(--theme-divider-color);
    }
  }
  .swimlane-title {
    font-weight: 600;
    color: var(--swimlane-title-color, var(--theme-caption-color));
  }
  .swimlane-count {
    color: var(--theme-dark-color);
    font-size: 0.8125rem;
    padding: 0 0.375rem;
    background: var(--theme-button-hovered);
    border-radius: 0.5rem;
    line-height: 1.25rem;
  }
</style>
