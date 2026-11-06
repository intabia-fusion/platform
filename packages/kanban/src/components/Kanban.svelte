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
  import type {
    CategoryType,
    Class,
    Doc,
    DocumentQuery,
    DocumentUpdate,
    FindOptions,
    IdMap,
    Ref,
    Space
  } from '@hcengineering/core'

  import { getClient } from '@hcengineering/presentation'

  import ui, { Button, Icon, Scroller, lazyObserver, themeStore, defaultBackground } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy } from 'svelte'

  import type { DocWithRank, DropTarget, Item, SwimLane } from '../types'

  import { cellKey, collectVisibleGroups, COLUMN_LIMIT, stateKey, SWIM_CELL_LIMIT } from '../visibleGroups'
  import { cellLimit, columnCardCounts, availableDropTargets, columnPlace, isBlocked, swimCellKey } from '../boardView'
  import KanbanRow from './KanbanRow.svelte'
  import { KanbanController } from '../kanbanController'
  import { createLaneQueryController } from '../laneQueryController'
  import { withoutCard } from '../row'

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
  export let orderBy: [string, 1 | -1] | undefined = undefined
  export let onMoveCommit: ((id: string, fields: Record<string, unknown>) => void) | undefined = undefined
  export let onMoveRollback: ((id: string) => void) | undefined = undefined

  export let getUpdateProps: (doc: Doc, state: CategoryType, dropTargetId?: string) => DocumentUpdate<Item> | undefined
  export let getAvailableCategories: ((doc: Doc) => Promise<CategoryType[]>) | undefined = undefined

  // Landing spots per column (stateKey -> spots), shown once the dragged card starts moving.
  // The host computes them; on drop the spot id goes back through `getUpdateProps`.
  export let dropTargets = new Map<string, DropTarget[]>()

  // SwimLane support. When empty - classic kanban layout (legacy).
  export let swimLanes: SwimLane[] = []
  export let swimLaneKey: string | undefined = undefined
  export let getSwimLaneUpdateProps: ((doc: Doc, swimLane: SwimLane) => DocumentUpdate<Item> | undefined) | undefined =
    undefined
  // Document a lane header shows (e.g. the parent issue); loaded by the board query and passed to the header slot.
  export let getSwimLaneDocId: ((swimLane: SwimLane) => Ref<Doc> | undefined) | undefined = undefined
  export let getSwimLaneOfDoc: ((doc: Doc) => string | undefined) | undefined = undefined
  export let storageKey: string | undefined = undefined
  export let controlKey: string | undefined = undefined
  export let getSwimLaneHeaderStyle:
    | ((swimLane: SwimLane) => { background?: string, color?: string } | undefined)
    | undefined = undefined
  export let compact: boolean = false
  // Multiplies the cards a column or a lane cell shows before "show more": smaller cards fit more
  export let limitScale: number = 1
  // Grey column background and elevated cards
  export let modern: boolean = false
  export let fitColumns: boolean = false
  // A column over its WIP limit by its card count: its cards area turns red, in every lane
  export let overLimit: ((state: CategoryType, count: number) => boolean) | undefined = undefined
  // The group a category belongs to (e.g. the category of a status), for merging columns by it.
  export let getCategoryGroup: ((state: CategoryType) => string | undefined) | undefined = undefined

  import { registerColumnControls, registerSwimLaneControls } from '../swimlane'

  $: controller.updateInputs({
    columnStorageKey,
    categories,
    fitColumns,
    getCategoryGroup,
    groupByDocs,
    getGroupByValues,
    storageKey,
    swimLanes,
    getSwimLaneOfDoc,
    getSwimLaneDocId,
    getSwimLaneUpdateProps,
    getUpdateProps,
    dontUpdateRank,
    swimLaneMode,
    onMoveCommit,
    dispatch,
    client,
    onMoveRollback,
    scrollerEl,
    setGroupByValues,
    orderBy,
    getAvailableCategories,
    swimRowBindings,
    stateRefs,
    stateRows,
    shownSwimLanes,
    objects,
    selection,
    checkedSet,
    checked
  })

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
    unregisterColumnControls?.()
  })

  const dispatch = createEventDispatcher()

  const SWIM_CELL_LIMIT_STEP = 10
  const COLUMN_LIMIT_STEP = 20

  $: columnLimit = COLUMN_LIMIT * limitScale
  $: swimCellLimit = SWIM_CELL_LIMIT * limitScale
  let shownSwimLanes: SwimLane[] = []
  $: shownSwimLanes = swimLanes.slice(0, $laneLimit)
  // A lane queries its cards and header only once it nears the viewport; it keeps them after.
  // Lanes of another grouping start unseen: their blocks are keyed by the grouping, so they observe again.
  $: controller.setLaneKey(swimLaneKey)

  $: swimLaneMode = swimLanes.length > 0 && swimLaneKey !== undefined

  // Collapse state persisted in localStorage.

  $: controller.loadLanes(storageKey)

  $: columnStorageKey = controlKey !== undefined ? `${controlKey}-${String(groupByKey)}` : undefined
  $: controller.loadColumns(columnStorageKey)

  let unregisterColumnControls: (() => void) | undefined
  $: {
    unregisterColumnControls?.()
    unregisterColumnControls =
      controlKey !== undefined
        ? registerColumnControls(controlKey, {
            resetMerge,
            mergeByGroup,
            canMergeByGroup: $columns.canMergeByGroup,
            merged: $columns.merged
          })
        : undefined
  }

  // Card count per column, computed once per update for the WIP limit check of every cell.
  $: columnCounts = columnCardCounts(groupByDocs, categories, $columns.membersOf, getGroupByValues)

  // The stack widens only once the drag is under way: Chrome cancels a drag whose dragstart reflows the board.
  $: dragUnderway = $isDragging && $dragMoved

  // Spots of every available column, for the full-form status slots. Shown once the
  // drag is under way, so slots appearing on dragstart do not reflow the board under the pointer.
  $: shownSpots =
    dragUnderway && $dragCard !== undefined
      ? availableDropTargets(categories, dropTargets, $columns.membersOf, $dragCardAvailableCategories)
      : new Map<string, DropTarget[]>()
  // The card shown in a spot is out of the column's card list, so it is not drawn twice, and not
  // again at the bottom of the column when the pointer is off the spots.
  $: cardInSpot =
    !$atInitialPlace &&
    $dragCardState !== undefined &&
    (shownSpots.get(stateKey($dragCardState))?.length ?? 0) > 0 &&
    $dragCard !== undefined

  // One live query per lane (per column in the legacy layout), so a change re-runs only that lane.
  // Its size is statuses x cell limit + 1, independent of the board size.
  let loadedDocs: IdMap<DocWithRank> = new Map()
  // Lanes whose query has answered; a dropped lane leaves, so it waits for its header doc again.
  let loadedKeys = new Set<string>()
  const queryController = createLaneQueryController((docs, keys) => {
    loadedDocs = docs
    loadedKeys = keys
  })

  onDestroy(() => {
    queryController.destroy()
    controller.destroy()
  })

  let visibleGroups = new Map<string, Array<Ref<Doc>>>()
  $: visibleGroups = collectVisibleGroups({
    groupByDocs,
    categories: $columns.categories,
    swimLanes: shownSwimLanes,
    collapsed: $collapsed,
    seenLanes: $seenLanes,
    collapsedColumns: $collapsedColumns,
    cellLimits: $cellLimits,
    columnLimit,
    swimCellLimit,
    swimLaneMode,
    lanesPending: swimLaneKey !== undefined && swimLanes.length === 0,
    dragging: $isDragging,
    previous: visibleGroups,
    getSwimLaneOfDoc,
    getSwimLaneDocId,
    getGroupByValues: (docs, state) => columnValues(docs, state, $columns.membersOf)
  })
  $: queryController.sync(visibleGroups, _class, options)

  const client = getClient()

  // Auto-scroll on edge during drag.
  let scrollerEl: HTMLElement | undefined
  let headerRowHeight = 0
  // eslint-disable-next-line
  let dragged: boolean = false

  const stateRefs: HTMLElement[] = []
  const stateRows: KanbanRow[] = []
  const swimRowBindings: Record<string, KanbanRow> = {}

  $: stateRefs.length = categories.length
  $: stateRows.length = categories.length

  $: checkedSet = new Set<Ref<Doc>>(checked.map((it) => it._id))

  const controller: KanbanController = new KanbanController(
    {
      columnStorageKey,
      categories,
      fitColumns,
      getCategoryGroup,
      groupByDocs,
      getGroupByValues,
      storageKey,
      swimLanes,
      getSwimLaneOfDoc,
      getSwimLaneDocId,
      getSwimLaneUpdateProps,
      getUpdateProps,
      dontUpdateRank,
      swimLaneMode,
      onMoveCommit,
      dispatch,
      client,
      onMoveRollback,
      scrollerEl,
      setGroupByValues,
      orderBy,
      getAvailableCategories,
      swimRowBindings,
      stateRefs,
      stateRows,
      shownSwimLanes,
      objects,
      selection,
      checkedSet,
      checked
    },
    (patch) => {
      if ('groupByDocs' in patch) groupByDocs = patch.groupByDocs as typeof groupByDocs
      if ('selection' in patch) selection = patch.selection
      if ('checked' in patch) checked = patch.checked as typeof checked
    }
  )
  const {
    columns,
    laneLimit,
    seenLanes,
    cellLimits,
    collapsedColumns,
    dragOverCollapsed,
    dragOverDropTarget,
    atInitialPlace,
    collapsed,
    dragCardInitialSwimLane,
    dragCardInitialState,
    dragCard,
    dragCardCurrentSwimLane,
    dragCardState,
    dragCardTargetIndex,
    dragCardAvailableCategories,
    isDragging,
    dragMoved
  } = controller.view

  const {
    markLaneSeen,
    showMore,
    toggleColumn,
    mergeWith,
    mergeByGroup,
    resetMerge,
    columnValues,
    cardState,
    leaveCollapsed,
    leaveDropTarget,
    dropTargetDragOver,
    dropTargetDrop,
    toggleSwimLane,
    collapseAll,
    expandAll,
    getSwimLaneCategoryValues,
    getLegacyCategoryValues,
    getLaneDoc,
    countSwimLane,
    laneTakes,
    move,
    handleDragMove,
    updateDone,
    panelDragOver,
    cardDragOver,
    cardDrop,
    onDragStart,
    onDragEnd,
    showMenu
  } = controller

  export function select (offset: 1 | -1 | 0, of?: Doc, dir?: 'vertical' | 'horizontal'): void {
    controller.select(offset, of, dir)
  }

  export function check (docs: Doc[], value: boolean): void {
    controller.check(docs, value)
  }
</script>

<div
  class="kanban-container"
  class:swimlane-mode={swimLaneMode}
  class:compact
  class:modern
  class:fit-columns={fitColumns}
  style:--kanban-fit-tracks={$columns.openColumns.length + ($columns.hasCollapsed ? 1 : 0)}
  on:dragover|capture={handleDragMove}
  on:dragend={onDragEnd}
  on:drop={onDragEnd}
>
  {#if swimLaneMode}
    <Scroller horizontal bind:divScroll={scrollerEl}>
      <div class="kanban-swimlane-wrap">
        <div
          class="kanban-swimlane-root"
          style:--swimlane-row-height={headerRowHeight > 0 ? `${headerRowHeight}px` : undefined}
        >
          <!-- sticky column headers row -->
          <div
            class="swimlane-header-row"
            bind:offsetHeight={headerRowHeight}
            style:grid-template-columns={$columns.gridColumns}
            style:--swimlane-row-bg={defaultBackground($themeStore.dark)}
          >
            {#each categories as state, si (typeof state === 'object' ? state.name : state)}
              {@const stateObjects = columnValues(groupByDocs, state, $columns.membersOf)}
              {@const blocked = isBlocked(
                state,
                dragUnderway,
                $dragCardAvailableCategories,
                $dragCardInitialState,
                $columns.membersOf
              )}
              {#if columnPlace(state, $collapsedColumns, $columns.membersOf) === 'open'}
                <div
                  class="swimlane-col-header"
                  data-id="kanban-column-header"
                  data-state={stateKey(state)}
                  class:drop-allowed={$isDragging &&
                    ($dragCardAvailableCategories === undefined || $dragCardAvailableCategories.includes(state))}
                  class:drop-disabled={blocked}
                >
                  {#if $$slots.header !== undefined}
                    {#key si}
                      <slot
                        name="header"
                        {state}
                        count={stateObjects.length}
                        index={si}
                        collapsed={false}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={$columns.membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/key}
                  {/if}
                </div>
              {/if}
            {/each}
          </div>

          {#each shownSwimLanes as swimLane (`${swimLaneKey}:${swimLane._id}`)}
            {@const isCollapsed = $collapsed.has(swimLane._id)}
            {@const laneCount = countSwimLane(swimLane)}
            {@const laneStyle = getSwimLaneHeaderStyle?.(swimLane)}
            <div
              class="swimlane-block"
              data-id="kanban-swimlane"
              data-swimlane-id={swimLane._id}
              use:lazyObserver={(visible, unsubscribe) => {
                markLaneSeen(swimLane._id, visible, unsubscribe)
              }}
            >
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="swimlane-header"
                data-id="kanban-swimlane-header"
                data-swimlane-collapsed={isCollapsed ? 'true' : 'false'}
                style:--swimlane-header-bg={laneStyle?.background ?? 'var(--theme-list-row-color)'}
                style:color={laneStyle?.color ?? 'var(--theme-caption-color)'}
                style:--swimlane-title-color={laneStyle?.color}
                on:click={() => {
                  toggleSwimLane(swimLane._id)
                }}
              >
                <div class="swimlane-toggle">
                  <Icon icon={isCollapsed ? ui.icon.ChevronRight : ui.icon.ChevronDown} size="small" />
                </div>
                {#if $$slots.swimLaneHeader !== undefined}
                  <slot
                    name="swimLaneHeader"
                    {swimLane}
                    count={laneCount}
                    collapsed={isCollapsed}
                    laneDoc={getLaneDoc(swimLane, loadedDocs)}
                    docsLoaded={loadedKeys.has(swimLane._id)}
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
                <div class="swimlane-grid" style:grid-template-columns={$columns.gridColumns}>
                  {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                    {@const blocked = isBlocked(
                      state,
                      dragUnderway,
                      $dragCardAvailableCategories,
                      $dragCardInitialState,
                      $columns.membersOf
                    )}
                    {#if columnPlace(state, $collapsedColumns, $columns.membersOf) === 'open'}
                      {@const spots =
                        laneTakes(swimLane) &&
                        !(
                          $atInitialPlace &&
                          state === $dragCardInitialState &&
                          swimLane._id === $dragCardInitialSwimLane?._id
                        )
                          ? (shownSpots.get(stateKey(state)) ?? [])
                          : []}
                      {@const laneStateObjects = getSwimLaneCategoryValues(
                        swimLane,
                        state,
                        groupByDocs,
                        $dragCard,
                        $dragCardCurrentSwimLane,
                        $dragCardState,
                        $dragCardTargetIndex,
                        $columns.membersOf
                      )}
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div
                        class="swimlane-cell"
                        class:drop-target={$isDragging}
                        class:drop-allowed={$isDragging &&
                          ($dragCardAvailableCategories === undefined || $dragCardAvailableCategories.includes(state))}
                        class:drop-disabled={blocked}
                        class:filled={modern}
                        class:over-limit={overLimit?.(state, columnCounts.get(stateKey(state)) ?? 0) === true}
                        data-id="kanban-swimlane-cell"
                        data-swimlane-id={swimLane._id}
                        data-state={stateKey(state)}
                        on:dragover={(event) => {
                          panelDragOver(event, state, swimLane)
                        }}
                        on:drop={() => {
                          void move(state, swimLane)
                        }}
                      >
                        <slot name="beforeCard" {state} {swimLane} />
                        {#if spots.length > 0}
                          <div class="drop-targets" data-id="kanban-drop-targets">
                            {#each spots as target (target.id)}
                              <!-- svelte-ignore a11y-no-static-element-interactions -->
                              <div
                                class="drop-target"
                                class:drag-over={$dragOverDropTarget === target.id &&
                                  $dragCardState === state &&
                                  $dragCardCurrentSwimLane?._id === swimLane._id}
                                data-drop-target={target.id}
                                on:dragover={(event) => {
                                  dropTargetDragOver(event, state, target, swimLane)
                                }}
                                on:dragleave={leaveDropTarget}
                                on:drop={(event) => {
                                  dropTargetDrop(event, state, target, swimLane)
                                }}
                              >
                                <div class="drop-target-label">
                                  <slot name="dropTarget" {state} {target} dragCard={$dragCard} />
                                </div>
                                {#if $dragOverDropTarget === target.id && $dragCardState === state && $dragCardCurrentSwimLane?._id === swimLane._id && $dragCard !== undefined}
                                  <div class="drop-target-card">
                                    <slot
                                      name="card"
                                      object={$dragCard}
                                      dragged={true}
                                      swimLane={$dragCardCurrentSwimLane}
                                    />
                                  </div>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}
                        <KanbanRow
                          bind:this={swimRowBindings[swimCellKey(swimLane._id, si)]}
                          on:obj-focus
                          stateObjects={cardInSpot ? withoutCard(laneStateObjects, $dragCard) : laneStateObjects}
                          isDragging={$isDragging}
                          dragCard={$dragCard}
                          {objects}
                          {selection}
                          {checkedSet}
                          {state}
                          loaded={loadedDocs}
                          limit={cellLimit($cellLimits, cellKey(swimLane._id, state), swimCellLimit)}
                          onShowMore={() => {
                            showMore(cellKey(swimLane._id, state), swimCellLimit, SWIM_CELL_LIMIT_STEP)
                          }}
                          cardDragOver={(evt, obj) => {
                            cardDragOver(evt, obj, state)
                          }}
                          cardDrop={(evt, obj) => {
                            void cardDrop(evt, obj, state, swimLane)
                          }}
                          onDragStart={(obj, st) => {
                            void onDragStart(obj, cardState(obj, st), swimLane)
                          }}
                          {modern}
                          {showMenu}
                        >
                          <svelte:fragment slot="card" let:object let:dragged>
                            <slot name="card" {object} {dragged} {swimLane} />
                          </svelte:fragment>
                        </KanbanRow>

                        <slot name="afterCard" {state} {swimLane} />
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
          {#if swimLanes.length > $laneLimit}
            <div class="p-2 flex-center">
              <span class="mr-2">{$laneLimit} / {swimLanes.length}</span>
              <Button
                size="small"
                icon={ui.icon.DotsHorizontal}
                label={ui.string.ShowMore}
                dataId="btn-kanban-show-more-lanes"
                on:click={() => {
                  controller.showMoreLanes()
                }}
              />
            </div>
          {/if}
        </div>
        {#if $columns.hasCollapsed}
          <div class="collapsed-stack" class:dragging={dragUnderway} data-id="kanban-collapsed-stack">
            <div class="collapsed-stack-items">
              {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                {#if columnPlace(state, $collapsedColumns, $columns.membersOf) === 'stack'}
                  {@const blocked = isBlocked(
                    state,
                    dragUnderway,
                    $dragCardAvailableCategories,
                    $dragCardInitialState,
                    $columns.membersOf
                  )}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="collapsed-item"
                    data-id="kanban-collapsed-column"
                    data-state={stateKey(state)}
                    class:drop-allowed={$isDragging && !blocked}
                    class:drop-disabled={blocked}
                    class:drag-over={$isDragging && $dragOverCollapsed === stateKey(state)}
                    on:dragover={(event) => {
                      controller.hoverCollapsed(state)
                      // The stack has no lanes, so the card keeps its lane.
                      panelDragOver(event, state, $dragCardInitialSwimLane)
                    }}
                    on:dragleave={(event) => {
                      leaveCollapsed(event)
                    }}
                    on:drop={() => {
                      controller.hoverCollapsed()
                      void move(state, $dragCardInitialSwimLane)
                    }}
                  >
                    {#if $$slots.header !== undefined}
                      <slot
                        name="header"
                        {state}
                        count={columnValues(groupByDocs, state, $columns.membersOf).length}
                        index={si}
                        collapsed={true}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={$columns.membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/if}
                    {#if $isDragging && $dragCard !== undefined && $dragOverCollapsed === stateKey(state)}
                      <div class="collapsed-drop-card">
                        <slot
                          name="card"
                          object={loadedDocs.get($dragCard._id) ?? $dragCard}
                          dragged={true}
                          swimLane={$dragCardCurrentSwimLane}
                        />
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </Scroller>
  {:else}
    <Scroller horizontal contentDirection="horizontal" align="stretch" noStretch={false} bind:divScroll={scrollerEl}>
      <div
        class="kanban-content"
        style:grid-template-columns={fitColumns
          ? `${$columns.gridColumns}${$columns.hasCollapsed ? ' minmax(0, var(--kanban-col-stack))' : ''}`
          : undefined}
      >
        {#each categories as state, si (typeof state === 'object' ? state.name : state)}
          {@const stateObjects = getLegacyCategoryValues(state, groupByDocs, $columns.membersOf)}
          {@const blocked = isBlocked(
            state,
            dragUnderway,
            $dragCardAvailableCategories,
            $dragCardInitialState,
            $columns.membersOf
          )}

          {#if columnPlace(state, $collapsedColumns, $columns.membersOf) === 'open'}
            {@const spots =
              $atInitialPlace && state === $dragCardInitialState ? [] : (shownSpots.get(stateKey(state)) ?? [])}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="panel-container"
              class:drop-allowed={$isDragging &&
                ($dragCardAvailableCategories === undefined || $dragCardAvailableCategories.includes(state))}
              class:drop-disabled={blocked}
              data-id="kanban-column"
              data-state={stateKey(state)}
              bind:this={stateRefs[si]}
              on:dragover={(event) => {
                panelDragOver(event, state)
              }}
              on:drop={() => {
                void move(state)
              }}
            >
              {#if $$slots.header !== undefined}
                {#key si}
                  <slot
                    name="header"
                    {state}
                    count={stateObjects.length}
                    index={si}
                    collapsed={false}
                    {blocked}
                    toggle={() => {
                      toggleColumn(state)
                    }}
                    members={$columns.membersOf.get(stateKey(state)) ?? [state]}
                    merge={mergeWith(state)}
                  />
                {/key}
              {/if}
              <div class="column-body">
                {#if spots.length > 0}
                  <div class="drop-targets" data-id="kanban-drop-targets">
                    {#each spots as target (target.id)}
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div
                        class="drop-target"
                        class:drag-over={$dragOverDropTarget === target.id && $dragCardState === state}
                        data-drop-target={target.id}
                        on:dragover={(event) => {
                          dropTargetDragOver(event, state, target)
                        }}
                        on:dragleave={leaveDropTarget}
                        on:drop={(event) => {
                          dropTargetDrop(event, state, target)
                        }}
                      >
                        <div class="drop-target-label">
                          <slot name="dropTarget" {state} {target} dragCard={$dragCard} />
                        </div>
                        {#if $dragOverDropTarget === target.id && $dragCardState === state && $dragCard !== undefined}
                          <div class="drop-target-card">
                            <slot name="card" object={$dragCard} dragged={true} />
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="column-cards-scroll">
                  <Scroller
                    padding={modern ? '0.25rem max(var(--kanban-col-inset), 0.25rem)' : '.25rem .5rem'}
                    on:dragover
                    on:drop
                  >
                    <div
                      class="column-cards"
                      class:filled={modern && stateObjects.length > 0}
                      class:over-limit={overLimit?.(state, stateObjects.length) === true}
                    >
                      <slot name="beforeCard" {state} />
                      <KanbanRow
                        bind:this={stateRows[si]}
                        on:obj-focus
                        stateObjects={cardInSpot ? withoutCard(stateObjects, $dragCard) : stateObjects}
                        isDragging={$isDragging}
                        dragCard={$dragCard}
                        {objects}
                        {selection}
                        {checkedSet}
                        {state}
                        loaded={loadedDocs}
                        limit={cellLimit($cellLimits, cellKey('', state), columnLimit)}
                        onShowMore={() => {
                          showMore(cellKey('', state), columnLimit, COLUMN_LIMIT_STEP)
                        }}
                        cardDragOver={(evt, obj) => {
                          cardDragOver(evt, obj, state)
                        }}
                        cardDrop={(evt, obj) => {
                          void cardDrop(evt, obj, state)
                        }}
                        onDragStart={(obj, st) => {
                          void onDragStart(obj, cardState(obj, st))
                        }}
                        {modern}
                        {showMenu}
                      >
                        <svelte:fragment slot="card" let:object let:dragged>
                          <slot name="card" {object} {dragged} />
                        </svelte:fragment>
                      </KanbanRow>

                      <slot name="afterCard" {state} />
                    </div>
                  </Scroller>
                </div>
              </div>
            </div>
          {/if}
        {/each}
        {#if $columns.hasCollapsed}
          <div class="collapsed-stack" class:dragging={dragUnderway} data-id="kanban-collapsed-stack">
            <div class="collapsed-stack-items">
              {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                {#if columnPlace(state, $collapsedColumns, $columns.membersOf) === 'stack'}
                  {@const blocked = isBlocked(
                    state,
                    dragUnderway,
                    $dragCardAvailableCategories,
                    $dragCardInitialState,
                    $columns.membersOf
                  )}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="collapsed-item"
                    data-id="kanban-collapsed-column"
                    data-state={stateKey(state)}
                    class:drop-allowed={$isDragging && !blocked}
                    class:drop-disabled={blocked}
                    class:drag-over={$isDragging && $dragOverCollapsed === stateKey(state)}
                    on:dragover={(event) => {
                      controller.hoverCollapsed(state)
                      panelDragOver(event, state)
                    }}
                    on:dragleave={(event) => {
                      leaveCollapsed(event)
                    }}
                    on:drop={() => {
                      controller.hoverCollapsed()
                      void move(state, $dragCardCurrentSwimLane)
                    }}
                  >
                    {#if $$slots.header !== undefined}
                      <slot
                        name="header"
                        {state}
                        count={getLegacyCategoryValues(state, groupByDocs, $columns.membersOf).length}
                        index={si}
                        collapsed={true}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={$columns.membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/if}
                    {#if $isDragging && $dragCard !== undefined && $dragOverCollapsed === stateKey(state)}
                      <div class="collapsed-drop-card">
                        <slot name="card" object={loadedDocs.get($dragCard._id) ?? $dragCard} dragged={true} />
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
        <slot name="afterPanel" />
      </div>
    </Scroller>
  {/if}
  {#if $isDragging}
    <slot name="doneBar" onDone={updateDone} />
  {/if}
</div>

<style lang="scss">
  :global(.kanban-drop-placeholder) {
    pointer-events: none;
    outline: 2px dashed var(--theme-divider-color);
    outline-offset: -2px;
    border-radius: 0.25rem;
  }

  .kanban-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;

    --kanban-col-width: 20rem;
    --kanban-col-stack: 14rem;
    --kanban-col-gap: 0.5rem;

    &.compact {
      --kanban-col-width: 14rem;
      --kanban-col-gap: 0.375rem;
    }
    // A column is a fixed track: header and cards sit `--kanban-col-inset` inside it, neighbours `--kanban-col-gap` apart.
    // The `--kanban-column-*` and `--kanban-padding-*` properties of the caller override the defaults.
    &.modern {
      --kanban-col-width: var(--kanban-column-width, 20rem);
      --kanban-col-gap: var(--kanban-column-gap, 0rem);
      --kanban-col-inset: var(--kanban-column-inset, 0.875rem);
      --kanban-pad-top: var(--kanban-padding-top, 1.5rem);
      --kanban-pad-x: var(--kanban-padding-x, 1.5rem);

      .kanban-content {
        column-gap: var(--kanban-col-gap);
        padding: var(--kanban-pad-top) var(--kanban-pad-x) 0.5rem;
      }
      .panel-container {
        border: none;
      }
      .column-body > .drop-targets {
        padding: 0.25rem max(var(--kanban-col-inset), 0.25rem);
      }
      .column-cards.filled {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .kanban-swimlane-root {
        padding: 0 var(--kanban-pad-x) 0.5rem;
      }
      .swimlane-header-row {
        padding: var(--kanban-pad-top) 0 0.5rem;
        border-bottom: none;
      }
      .swimlane-col-header {
        box-sizing: border-box;
        padding: 0 var(--kanban-col-inset);
      }
      .swimlane-block {
        margin-bottom: 0.5rem;
        background-color: transparent;
      }
      .swimlane-header {
        height: 2rem;
        padding: 0 0.5rem;
        border-bottom: none;
        border-radius: 0.25rem;
        box-shadow: none;
      }
      // Cells keep the height of their cards, as in the design kit; an empty one is 3.5rem
      .swimlane-grid {
        align-items: start;
        padding: 0.5rem 0 0;
      }
      // Every cell keeps the grey background, also an empty one
      .swimlane-cell {
        gap: 0.5rem;
        width: auto;
        min-height: 3.5rem;
        margin: 0 var(--kanban-col-inset);
        border: none;

        &.drop-target {
          border: none;
          outline: 1px dashed var(--theme-divider-color);
          outline-offset: -1px;
        }
      }
    }
  }
  .kanban-container.fit-columns {
    --kanban-col-inset: min(var(--kanban-column-inset, 0.875rem), 5%);

    .kanban-content,
    .kanban-swimlane-wrap {
      box-sizing: border-box;
      width: 100%;
    }
    .kanban-swimlane-root {
      box-sizing: border-box;
      width: 0;
      min-width: 0;
    }
    .swimlane-header {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }
    .panel-container,
    .swimlane-col-header,
    .swimlane-cell,
    .collapsed-stack {
      width: auto;
      min-width: 0;
      max-width: 100%;
    }
    .kanban-swimlane-wrap > .collapsed-stack {
      box-sizing: border-box;
      flex-basis: min(var(--kanban-col-stack), calc(100% / var(--kanban-fit-tracks)));
    }
  }
  // Row 1 holds the column headers: they share the height of the tallest one, as in the swimlane header row.
  .kanban-content {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: auto minmax(0, 1fr);

    .collapsed-stack {
      grid-row: span 2;
      overflow-y: auto;
    }
    padding: 1.5rem 1.5rem 0.5rem;
    min-width: 0;
    height: 100%;
  }

  .panel-container {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    width: var(--kanban-col-width);
    min-width: var(--kanban-col-width);
    min-height: 0;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
  }

  // Keep status targets reachable while only the cards viewport scrolls.
  .column-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .column-body > .drop-targets {
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 0.25rem 0.5rem;
  }
  .column-cards-scroll {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  // SwimLane layout
  // The stack of collapsed columns sits beside the lanes and scrolls with them.
  .kanban-swimlane-wrap {
    display: flex;
    width: max-content;
    min-width: 100%;

    // Full height keeps the dashed borders down to the last lane; the stack scrolls with the board.
    .collapsed-stack-items {
      margin-top: 1rem;
    }
  }
  .kanban-swimlane-root {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    padding: 0 1.5rem 0.5rem;
    width: max-content;
  }
  .swimlane-header-row {
    position: sticky;
    top: 0;
    z-index: 5;
    display: grid;
    gap: var(--kanban-col-gap);
    padding: 1rem 0 0.5rem;
    background: var(--swimlane-row-bg);
    border-bottom: 1px solid var(--theme-divider-color);
  }
  // Headers of one row share the height of the tallest one, e.g. a merged column.
  .swimlane-col-header {
    display: flex;
    flex-direction: column;
    width: var(--kanban-col-width);

    :global(> *) {
      flex-grow: 1;
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
    top: var(--swimlane-row-height, 4rem);
    left: 0;
    z-index: 4;
    width: max-content;
    min-width: 100%;
    box-shadow: 0 1px 0 var(--theme-divider-color);
    background: var(--swimlane-header-bg);
  }
  .swimlane-toggle {
    display: inline-flex;
    width: 1rem;
    height: 1rem;
  }
  .swimlane-grid {
    display: grid;
    gap: var(--kanban-col-gap);
    padding: 0.5rem 0;
  }
  // Cards of a column sit on a grey background, only while the column has cards
  .column-cards.filled,
  .swimlane-cell.filled {
    padding: 0.5rem;
    background-color: var(--theme-kanban-card-bg-color);
    border-radius: 0.5rem;
  }
  .column-cards.over-limit,
  .swimlane-cell.over-limit {
    background-color: color-mix(in srgb, var(--theme-state-negative-color) 8%, var(--theme-kanban-card-bg-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-state-negative-color) 45%, transparent);
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

  .panel-container,
  .swimlane-cell,
  .swimlane-col-header {
    transition:
      opacity 0.15s ease,
      filter 0.15s ease;

    &.drop-disabled {
      opacity: 0.45;
      filter: grayscale(0.6);
      pointer-events: none;
      cursor: not-allowed;
    }
  }
  .collapsed-stack {
    flex-shrink: 0;
    transition:
      width 0.15s ease,
      min-width 0.15s ease;

    // Wider than the dragged card, so the highlighted target shows beside it.
    &.dragging {
      width: calc(var(--kanban-col-width) + 6rem);
      min-width: calc(var(--kanban-col-width) + 6rem);
    }
    width: var(--kanban-col-stack);
    min-width: var(--kanban-col-stack);
    padding: 0 0.25rem;
    border-left: 1px dashed color-mix(in srgb, var(--theme-dark-color) 50%, transparent);
    border-right: 1px dashed color-mix(in srgb, var(--theme-dark-color) 50%, transparent);
  }
  .collapsed-stack-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .collapsed-item {
    border: 1px solid transparent;
    border-radius: 0.25rem;
    transition:
      opacity 0.15s ease,
      filter 0.15s ease;

    .collapsed-drop-card {
      margin: 0.25rem;
      border: 1px solid var(--theme-kanban-card-border);
      border-radius: 0.25rem;
      background-color: var(--accent-bg-color, var(--theme-bg-accent-color));
      pointer-events: none;
    }

    &.drag-over {
      border: 2px solid var(--primary-button-default);
      background-color: var(--theme-drop-zone-bg-color, var(--theme-button-hovered));
    }

    &.drop-allowed {
      border: 1px dashed var(--theme-divider-color);
      background-color: var(--theme-drop-zone-bg-color, var(--theme-button-hovered));
    }
    &.drop-disabled {
      opacity: 0.45;
      filter: grayscale(0.6);
      pointer-events: none;
    }
  }
  .swimlane-title {
    font-weight: 600;
    color: var(--swimlane-title-color, var(--theme-caption-color));
  }
  .swimlane-count {
    color: var(--theme-dark-color);
    font-size: 0.75rem;
    padding: 0 0.375rem;
    background: var(--theme-button-hovered);
    border-radius: 0.625rem;
    line-height: 1.25rem;
  }
  // Landing spots of every available column: one full-width slot per value the card
  // can take, the card standing in the hovered slot. A drop sets exactly that value.
  .drop-targets {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.25rem 0;
    width: 100%;
  }
  .drop-target {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    box-sizing: border-box;
    width: 100%;
    min-height: 3.5rem;
    padding: 0.5rem;
    border: 1px dashed var(--theme-divider-color);
    border-radius: 0.375rem;
    background-color: var(--theme-drop-zone-bg-color, var(--theme-button-hovered));
    cursor: pointer;

    &.drag-over {
      border: 2px solid var(--primary-button-default);
    }
  }
  .drop-target-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
  }
  .drop-target-card {
    pointer-events: none;
  }
</style>
