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
  import { type Rank, toIdMap } from '@hcengineering/core'
  import { createQuery, getClient, type LiveQuery } from '@hcengineering/presentation'
  import { makeRank } from '@hcengineering/rank'
  import ui, { Button, Icon, Scroller, lazyObserver, themeStore, defaultBackground } from '@hcengineering/ui'
  import { createEventDispatcher, onDestroy, tick } from 'svelte'

  import type { CardDragEvent, DocWithRank, DropTarget, Item, SwimLane } from '../types'
  import {
    buildColumns,
    insertIndex,
    laneCellValues,
    loadCollapsed,
    loadMerged,
    neighbourRanks,
    saveCollapsed,
    saveMerged,
    toggleMerge
  } from '../board'
  import { type LaneDocs, mergeLaneDocs, planLaneQueries } from '../laneQueries'
  import { cellKey, collectVisibleGroups, COLUMN_LIMIT, stateKey, SWIM_CELL_LIMIT } from '../visibleGroups'
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
  export let orderBy: [string, 1 | -1] | undefined = undefined
  export let onMoveCommit: ((id: string, fields: Record<string, unknown>) => void) | undefined = undefined
  export let onMoveRollback: ((id: string) => void) | undefined = undefined

  export let getUpdateProps: (doc: Doc, state: CategoryType, dropTargetId?: string) => DocumentUpdate<Item> | undefined
  export let getAvailableCategories: ((doc: Doc) => Promise<CategoryType[]>) | undefined = undefined

  // Landing spots per column (stateKey -> spots), shown inside the column while a card is held
  // over it. The host computes them; on drop the spot id goes back through `getUpdateProps`.
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
  // A column over its WIP limit by its card count: its cards area turns red, in every lane
  export let overLimit: ((state: CategoryType, count: number) => boolean) | undefined = undefined
  // The group a category belongs to (e.g. the category of a status), for merging columns by it.
  export let getCategoryGroup: ((state: CategoryType) => string | undefined) | undefined = undefined

  import { registerColumnControls, registerSwimLaneControls } from '../swimlane'

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
  const SWIM_LANE_PAGE = 20
  const COLUMN_LIMIT_STEP = 20

  // Per-cell card limit, keyed by cellKey; a cell absent here shows its initial limit.
  let cellLimits = new Map<string, number>()
  $: columnLimit = COLUMN_LIMIT * limitScale
  $: swimCellLimit = SWIM_CELL_LIMIT * limitScale
  let laneLimit = SWIM_LANE_PAGE
  $: shownSwimLanes = swimLanes.slice(0, laneLimit)
  // A lane queries its cards and header only once it nears the viewport; it keeps them after.
  // Lanes of another grouping start unseen: their blocks are keyed by the grouping, so they observe again.
  let seenLanes = new Set<string>()
  let seenLanesKey = swimLaneKey
  $: if (swimLaneKey !== seenLanesKey) {
    seenLanesKey = swimLaneKey
    seenLanes = new Set()
  }

  function markLaneSeen (id: string, visible: boolean, unsubscribe?: () => void): void {
    if (!visible) return
    unsubscribe?.()
    if (!seenLanes.has(id)) seenLanes = new Set(seenLanes).add(id)
  }

  function cellLimit (limits: Map<string, number>, key: string, initial: number): number {
    return limits.get(key) ?? initial
  }

  function showMore (key: string, initial: number, step: number): void {
    cellLimits.set(key, cellLimit(cellLimits, key, initial) + step)
    cellLimits = cellLimits
  }

  $: swimLaneMode = swimLanes.length > 0 && swimLaneKey !== undefined

  // Collapse state persisted in localStorage.
  let collapsed = new Set<string>()

  $: collapsed = loadCollapsed(storageKey)

  $: columnStorageKey = controlKey !== undefined ? `${controlKey}-${String(groupByKey)}` : undefined
  let collapsedColumns = new Set<string>()
  $: collapsedColumns = loadCollapsed(columnStorageKey, 'column')

  function toggleColumn (state: CategoryType): void {
    const key = stateKey(state)
    if (collapsedColumns.has(key)) collapsedColumns.delete(key)
    else collapsedColumns.add(key)
    collapsedColumns = new Set(collapsedColumns)
    saveCollapsed(columnStorageKey, collapsedColumns, 'column')
  }

  // Merged columns are a view setting: their cards come from several categories.
  let mergeGroups: string[][] = []
  $: mergeGroups = loadMerged(columnStorageKey)
  $: membersOf = new Map(buildColumns(categories, mergeGroups).map((c) => [stateKey(c.state), c.members]))

  function mergeColumn (state: CategoryType, other: CategoryType): void {
    const otherKey = stateKey(other)
    // Collapse is stored under the first column of a group: the rest of the group keeps it when `other` leaves.
    const rest = (membersOf.get(otherKey) ?? []).filter((m) => stateKey(m) !== otherKey)
    mergeGroups = toggleMerge(mergeGroups, stateKey(state), otherKey)
    saveMerged(columnStorageKey, mergeGroups)
    // A collapsed column joins the open one, it does not pull it into the stack.
    if (!collapsedColumns.delete(otherKey)) return
    const heir = buildColumns(categories, mergeGroups).find((c) => rest.length > 0 && c.members.includes(rest[0]))
    if (heir !== undefined) collapsedColumns.add(stateKey(heir.state))
    collapsedColumns = new Set(collapsedColumns)
    saveCollapsed(columnStorageKey, collapsedColumns, 'column')
  }

  function mergeWith (state: CategoryType): (other: CategoryType) => void {
    return (other) => {
      mergeColumn(state, other)
    }
  }

  // Statuses of each `getCategoryGroup` group that holds more than one of them.
  let categoryGroups: string[][] = []
  $: categoryGroups = getCategoryGroups(categories, getCategoryGroup)

  function getCategoryGroups (states: CategoryType[], groupOf: typeof getCategoryGroup): string[][] {
    if (groupOf === undefined) return []
    const byGroup = new Map<string, string[]>()
    for (const state of states) {
      const group = groupOf(state)
      if (group !== undefined) byGroup.set(group, [...(byGroup.get(group) ?? []), stateKey(state)])
    }
    return Array.from(byGroup.values()).filter((keys) => keys.length > 1)
  }

  function groupsSignature (groups: string[][]): string {
    return JSON.stringify(groups.map((keys) => JSON.stringify([...keys].sort())).sort())
  }

  // Merging by category is offered only when it would change this board.
  $: canMergeByGroup =
    categoryGroups.length > 0 &&
    groupsSignature(mergeGroups.filter((group) => !isOtherBoardGroup(categories, group))) !==
      groupsSignature(categoryGroups)

  function isOtherBoardGroup (states: CategoryType[], group: string[]): boolean {
    const keys = new Set(states.map((state) => stateKey(state)))
    return !group.some((key) => keys.has(key))
  }

  // Stored groups may belong to other boards: a viewlet is shared by all projects.
  function otherBoardsGroups (): string[][] {
    return mergeGroups.filter((group) => isOtherBoardGroup(categories, group))
  }

  // Replaces the merged columns with one column per group of `getCategoryGroup`.
  function mergeByGroup (): void {
    if (getCategoryGroup === undefined) return
    const groups = categoryGroups
    // The group is drawn at its first status, whose collapse would hide an open column of the group.
    for (const keys of groups) {
      if (keys.some((key) => membersOf.has(key) && !collapsedColumns.has(key))) collapsedColumns.delete(keys[0])
    }
    collapsedColumns = new Set(collapsedColumns)
    saveCollapsed(columnStorageKey, collapsedColumns, 'column')
    mergeGroups = [...otherBoardsGroups(), ...groups]
    saveMerged(columnStorageKey, mergeGroups)
  }

  function resetMerge (): void {
    mergeGroups = otherBoardsGroups()
    saveMerged(columnStorageKey, mergeGroups)
  }

  let unregisterColumnControls: (() => void) | undefined
  $: {
    unregisterColumnControls?.()
    unregisterColumnControls =
      controlKey !== undefined
        ? registerColumnControls(controlKey, {
            resetMerge,
            mergeByGroup,
            canMergeByGroup,
            merged: Array.from(membersOf.values()).some((members) => members.length > 1)
          })
        : undefined
  }

  function isMerged (state: CategoryType, members: Map<string, CategoryType[]>): boolean {
    return (members.get(stateKey(state))?.length ?? 1) > 1
  }

  // Where a category is drawn: its own column, the stack of collapsed ones, or nowhere (merged into another column).
  function columnPlace (
    state: CategoryType,
    collapsedKeys: Set<string>,
    members: Map<string, CategoryType[]>
  ): 'open' | 'stack' | 'hidden' {
    if (!members.has(stateKey(state))) return 'hidden'
    return collapsedKeys.has(stateKey(state)) ? 'stack' : 'open'
  }

  function columnValues (
    _groupByDocs: typeof groupByDocs,
    state: CategoryType,
    members: Map<string, CategoryType[]>
  ): Item[] {
    return (members.get(stateKey(state)) ?? [state]).flatMap((m) => getGroupByValues(_groupByDocs, m) ?? [])
  }

  // Card count per column, computed once per update for the WIP limit check of every cell.
  $: columnCounts = new Map(categories.map((c) => [stateKey(c), columnValues(groupByDocs, c, membersOf).length]))

  // The category a card of a merged column really has.
  function cardState (object: Item, column: CategoryType): CategoryType {
    return (
      (membersOf.get(stateKey(column)) ?? [column]).find((m) =>
        getGroupByValues(groupByDocs, m)?.some((it) => it._id === object._id)
      ) ?? column
    )
  }

  // No drop: outside the workflow, or a merged column. The column the card left is never blocked.
  function isBlocked (
    state: CategoryType,
    dragging: boolean,
    available: CategoryType[] | undefined,
    from: CategoryType | undefined,
    members: Map<string, CategoryType[]>
  ): boolean {
    if (!dragging) return false
    const own = members.get(stateKey(state)) ?? [state]
    if (from !== undefined && own.includes(from)) return false
    return own.length > 1 || (available !== undefined && !available.includes(state))
  }

  // The stack widens only once the drag is under way: Chrome cancels a drag whose dragstart reflows the board.
  let dragMoved = false
  $: dragUnderway = isDragging && dragMoved

  // Collapsed columns leave their place and gather in one column at the end of the board.
  $: hasCollapsed = categories.some((state) => columnPlace(state, collapsedColumns, membersOf) === 'stack')

  $: gridColumns = categories
    .filter((state) => columnPlace(state, collapsedColumns, membersOf) === 'open')
    .map(() => 'var(--kanban-col-width)')
    .join(' ')

  // The collapsed column under the dragged card shows the card, as a live column does.
  let dragOverCollapsed: string | undefined

  function leaveCollapsed (event: DragEvent): void {
    const item = event.currentTarget as HTMLElement
    if (!item.contains(event.relatedTarget as Node | null)) dragOverCollapsed = undefined
  }

  // The landing spot under the dragged card shows the card, as a slot it stands in.
  let dragOverDropTarget: string | undefined

  function leaveDropTarget (event: DragEvent): void {
    const item = event.currentTarget as HTMLElement
    if (!item.contains(event.relatedTarget as Node | null)) dragOverDropTarget = undefined
  }

  function dropTargetDragOver (event: DragEvent, target: DropTarget): void {
    event.preventDefault()
    event.stopPropagation()
    dragOverDropTarget = target.id
  }

  function dropTargetDrop (event: DragEvent, state: CategoryType, target: DropTarget, swimLane?: SwimLane): void {
    event.preventDefault()
    event.stopPropagation()
    dragOverDropTarget = undefined
    void move(state, swimLane, target.id).then(() => {
      isDragging = false
    })
  }

  // Spots of the column the card is held over, for the full-form status slots. Shown once the
  // drag is under way, so slots appearing on dragstart do not reflow the board under the pointer.
  $: shownSpots =
    dragUnderway && dragCard !== undefined && dragCardState !== undefined
      ? (dropTargets.get(stateKey(dragCardState)) ?? [])
      : []
  // The card shown in a spot is out of the column's card list, so it is not drawn twice, and not
  // again at the bottom of the column when the pointer is off the spots.
  $: cardInSpot = shownSpots.length > 1 && dragCard !== undefined

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
    _dragCardCurrentSwimLane: SwimLane | undefined,
    _dragCardState: CategoryType | undefined,
    _dragCardTargetIndex: number | undefined,
    _members: Map<string, CategoryType[]> = membersOf
  ): Item[] {
    // A merged column takes no drop, so its dragged card keeps its place there.
    const merged = isMerged(category, _members)
    return laneCellValues(columnValues(_groupByDocs, category, _members), swimLane._id, category, getSwimLaneOfDoc, {
      card: merged ? undefined : _dragCard,
      initialLane: dragCardInitialSwimLane?._id,
      initialState: dragCardInitialState,
      lane: _dragCardCurrentSwimLane?._id,
      state: _dragCardState,
      targetIndex: _dragCardTargetIndex
    })
  }

  // Legacy (non-swimlane) cell values. Returns raw cell content unchanged during
  // drag — drag preview is shown via a CSS drop-zone highlight on the target
  // column, not by relocating the card in the DOM. This avoids a Svelte reactivity
  // cascade across every column on every dragover and keeps drag interaction smooth.
  function getLegacyCategoryValues (
    category: CategoryType,
    _groupByDocs: typeof groupByDocs,
    _members: Map<string, CategoryType[]> = membersOf
  ): Item[] {
    return columnValues(_groupByDocs, category, _members)
  }

  // One live query per lane (per column in the legacy layout), so a change re-runs only that lane.
  // Its size is statuses x cell limit + 1, independent of the board size.
  const laneQueries = new Map<string, LaneDocs & { query: LiveQuery }>()
  let loadedDocs: IdMap<DocWithRank> = new Map()
  // Lanes whose query has answered; a dropped lane leaves, so it waits for its header doc again.
  let loadedKeys = new Set<string>()
  let lastOptionsKey = ''

  function syncLaneQueries (groups: Map<string, Array<Ref<Doc>>>, _options: typeof options): void {
    const optionsKey = JSON.stringify(_options)
    if (optionsKey !== lastOptionsKey) {
      lastOptionsKey = optionsKey
      laneQueries.forEach(({ query }) => {
        query.unsubscribe()
      })
      laneQueries.clear()
      loadedKeys = new Set()
    }
    const plan = planLaneQueries(new Map(Array.from(laneQueries, ([key, { ids }]) => [key, ids])), groups)
    for (const key of plan.drop) {
      laneQueries.get(key)?.query.unsubscribe()
      laneQueries.delete(key)
      loadedKeys.delete(key)
    }
    if (plan.drop.length > 0) loadedKeys = loadedKeys
    for (const [key, ids] of plan.run) {
      const entry = laneQueries.get(key) ?? { query: createQuery(true), ids, docs: new Map(), pending: true }
      laneQueries.set(key, entry)
      entry.ids = ids
      entry.pending = true
      entry.query.query(
        _class,
        { _id: { $in: ids as Array<Ref<DocWithRank>> } },
        (res) => {
          entry.docs = toIdMap(res)
          entry.pending = false
          loadedKeys = new Set(loadedKeys).add(key)
          loadedDocs = mergeLaneDocs(laneQueries.values(), loadedDocs)
        },
        { ..._options, limit: ids.length }
      )
    }
    // Docs of dropped queries stay in loadedDocs until the next result, so cards do not blink.
    if (laneQueries.size === 0) loadedDocs = new Map()
  }

  onDestroy(() => {
    laneQueries.forEach(({ query }) => {
      query.unsubscribe()
    })
    stopAutoScroll()
    window.removeEventListener('mousemove', onDragEnd, true)
  })

  let visibleGroups = new Map<string, Array<Ref<Doc>>>()
  $: visibleGroups = collectVisibleGroups({
    groupByDocs,
    categories: categories.filter((state) => membersOf.has(stateKey(state))),
    swimLanes: shownSwimLanes,
    collapsed,
    seenLanes,
    collapsedColumns,
    cellLimits,
    columnLimit,
    swimCellLimit,
    swimLaneMode,
    lanesPending: swimLaneKey !== undefined && swimLanes.length === 0,
    dragging: isDragging,
    previous: visibleGroups,
    getSwimLaneOfDoc,
    getSwimLaneDocId,
    getGroupByValues: (docs, state) => columnValues(docs, state, membersOf)
  })
  $: syncLaneQueries(visibleGroups, options)

  function getLaneDoc (swimLane: SwimLane, docs: IdMap<DocWithRank>): DocWithRank | undefined {
    const id = getSwimLaneDocId?.(swimLane)
    return id !== undefined ? docs.get(id as Ref<DocWithRank>) : undefined
  }

  function countSwimLane (swimLane: SwimLane): number {
    let total = 0
    for (const cat of categories) {
      // A merged status is counted by the first column of its group.
      if (!membersOf.has(stateKey(cat))) continue
      total += getSwimLaneCategoryValues(
        swimLane,
        cat,
        groupByDocs,
        dragCard,
        dragCardCurrentSwimLane,
        dragCardState,
        dragCardTargetIndex
      ).length
    }
    return total
  }

  // A card leaves its lane only for a lane that knows what to write into the card.
  function laneTakes (lane: SwimLane | undefined): boolean {
    if (dragCard === undefined || lane === undefined || lane._id === dragCardInitialSwimLane?._id) return true
    return getSwimLaneUpdateProps?.(dragCard, lane) !== undefined
  }

  async function move (state: CategoryType, targetSwimLane?: SwimLane, dropTargetId?: string): Promise<void> {
    if (dragCard === undefined) {
      return
    }

    const canDrop =
      (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state)) &&
      !isMerged(state, membersOf) &&
      laneTakes(targetSwimLane)

    if (!canDrop) {
      dragCard = undefined
      dragCardAvailableCategories = undefined
      return
    }

    let updates = getUpdateProps(dragCard, state, dropTargetId)

    if (updates === undefined) {
      panelDragLeave(undefined, dragCardState)
      dragCard = undefined
      dragCardAvailableCategories = undefined
      return
    }

    // Apply swim lane field update via plain update — diffUpdate ignores attachedTo/space.
    let swimUpdates: DocumentUpdate<Item> | undefined
    if (
      swimLaneMode &&
      targetSwimLane !== undefined &&
      getSwimLaneUpdateProps !== undefined &&
      dragCardInitialSwimLane?._id !== targetSwimLane._id
    ) {
      swimUpdates = getSwimLaneUpdateProps(dragCard, targetSwimLane)
    }

    if (!dontUpdateRank) {
      // Compute target rank from neighbours of the target cell (lane+state).
      let prevRank: Rank | undefined
      let nextRank: Rank | undefined
      if (swimLaneMode && targetSwimLane !== undefined) {
        const visible = getSwimLaneCategoryValues(
          targetSwimLane,
          state,
          groupByDocs,
          dragCard,
          targetSwimLane,
          state,
          dragCardTargetIndex
        )
        // A card gone from its own cell during the drag keeps its rank.
        if (visible.some((p) => p._id === dragCard?._id)) {
          ;[prevRank, nextRank] = neighbourRanks(visible, dragCard._id, undefined)
        }
      } else {
        ;[prevRank, nextRank] = neighbourRanks(
          getGroupByValues(groupByDocs, state) ?? [],
          dragCard._id,
          dragCardTargetIndex
        )
      }
      if (prevRank !== undefined || nextRank !== undefined) {
        const newRank = makeRank(prevRank, nextRank)
        if (newRank !== dragCardInitialRank && newRank !== dragCard.rank) {
          updates = { ...updates, rank: newRank }
        }
      } else if (dragCardInitialRank !== dragCard.rank && dragCardInitialRank !== undefined) {
        updates = { ...updates, rank: dragCard.rank }
      }
    }
    // Build the diff against current card values. Do NOT mutate the card —
    // optimistic positioning is handled via onMoveCommit (pendingMoves overlay
    // in the host component), which keeps live-query in charge of the actual
    // card state until the server confirms.
    const movedCard = dragCard
    const rawMerged: DocumentUpdate<Item> = { ...updates, ...(swimUpdates ?? {}) }
    const cardValues = movedCard as unknown as Record<string, unknown>
    const merged = Object.fromEntries(
      Object.entries(rawMerged).filter(([key, value]) => cardValues[key] !== value)
    ) as DocumentUpdate<Item>

    if (Object.keys(merged).length > 0) {
      // Optimistic overlay in the host (KanbanView) keeps the moved card in
      // its new column/rank until the live-query roundtrip lands; the actual
      // card data stays under live-query control.
      onMoveCommit?.(movedCard._id, merged as Record<string, unknown>)
      dragCardToRestore = undefined
    }
    // Restore focus on the just-moved card so keyboard navigation continues
    // from there, mirroring the mouse-hover focus path.
    dispatch('obj-focus', { ...movedCard, ...merged })
    if (Object.keys(merged).length > 0) {
      try {
        await client.update(dragCard, merged)
      } catch (err) {
        onMoveRollback?.(movedCard._id)
      }
    }
    dragCard = undefined
    dragCardAvailableCategories = undefined
    dragCardCurrentSwimLane = undefined
    dragCardTargetIndex = undefined
  }

  const client = getClient()

  let dragCard: Item | undefined
  let dragCardInitialRank: Rank | undefined
  let dragCardInitialState: CategoryType
  let dragCardState: CategoryType | undefined
  let dragCardAvailableCategories: CategoryType[] | undefined
  // Where the card stood in its category, to put it back there in the legacy layout.
  let dragCardInitialIndex = -1
  // The legacy preview moves the card inside groupByDocs. Cleared once an update is sent,
  // so that a drag which sends none puts the card back.
  let dragCardToRestore: Item | undefined
  let dragCardInitialSwimLane: SwimLane | undefined
  let dragCardCurrentSwimLane: SwimLane | undefined
  // Insertion index of dragCard within target lane cell (swimlane mode). Undefined = append at end.
  let dragCardTargetIndex: number | undefined

  let isDragging = false

  // Auto-scroll on edge during drag.
  let scrollerEl: HTMLElement | undefined
  let headerRowHeight = 0
  let autoScrollRaf: number | undefined
  let lastDragX = 0
  let lastDragY = 0
  const EDGE_PX = 60
  const MAX_STEP = 24

  function autoScrollTick (): void {
    autoScrollRaf = undefined
    // bind:divScroll sets null once the Scroller is destroyed.
    if (!isDragging || scrollerEl == null) return
    const r = scrollerEl.getBoundingClientRect()
    let dx = 0
    let dy = 0
    if (lastDragX - r.left < EDGE_PX) {
      dx = -Math.ceil(((EDGE_PX - (lastDragX - r.left)) / EDGE_PX) * MAX_STEP)
    } else if (r.right - lastDragX < EDGE_PX) {
      dx = Math.ceil(((EDGE_PX - (r.right - lastDragX)) / EDGE_PX) * MAX_STEP)
    }
    if (lastDragY - r.top < EDGE_PX) {
      dy = -Math.ceil(((EDGE_PX - (lastDragY - r.top)) / EDGE_PX) * MAX_STEP)
    } else if (r.bottom - lastDragY < EDGE_PX) {
      dy = Math.ceil(((EDGE_PX - (r.bottom - lastDragY)) / EDGE_PX) * MAX_STEP)
    }
    if (dx !== 0) scrollerEl.scrollLeft += dx
    if (dy !== 0) scrollerEl.scrollTop += dy
    if (isDragging && (dx !== 0 || dy !== 0)) autoScrollRaf = requestAnimationFrame(autoScrollTick)
  }

  function handleDragMove (e: DragEvent): void {
    if (!isDragging) return
    // A card that unmounts mid-drag loses its dragend. A native drag sends no mouse events,
    // so the first mousemove ends it. Not armed at dragstart: Firefox sends one right after.
    if (!dragMoved) window.addEventListener('mousemove', onDragEnd, true)
    dragMoved = true
    lastDragX = e.clientX
    lastDragY = e.clientY
    if (autoScrollRaf === undefined) autoScrollRaf = requestAnimationFrame(autoScrollTick)
  }

  function stopAutoScroll (): void {
    if (autoScrollRaf !== undefined) {
      cancelAnimationFrame(autoScrollRaf)
      autoScrollRaf = undefined
    }
  }

  async function updateDone (updateValue: DocumentUpdate<Item>): Promise<void> {
    isDragging = false
    if (dragCard === undefined) {
      return
    }
    dragCardToRestore = undefined
    await client.update(dragCard, updateValue)
  }

  function removeFromCategories (card: Item): void {
    for (const cat of categories) {
      const a = getGroupByValues(groupByDocs, cat) ?? []
      const i = a.findIndex((p) => p._id === card._id)
      if (i !== -1) {
        a.splice(i, 1)
        setGroupByValues(groupByDocs, cat, a)
      }
    }
  }

  function putBack (card: Item): void {
    removeFromCategories(card)
    const own = getGroupByValues(groupByDocs, dragCardInitialState) ?? []
    own.splice(dragCardInitialIndex === -1 ? own.length : dragCardInitialIndex, 0, card)
    setGroupByValues(groupByDocs, dragCardInitialState, own)
    dragCardState = dragCardInitialState
    dragCardTargetIndex = undefined
    groupByDocs = groupByDocs
  }

  function panelDragOver (event: Event | undefined, state: CategoryType, swimLane?: SwimLane): void {
    event?.preventDefault()
    if (dragCard === undefined) return

    const swimLaneChanged = swimLane !== undefined && dragCardCurrentSwimLane?._id !== swimLane._id

    if (dragCardState !== state || swimLaneChanged) {
      // A merged column takes no drop, so a card brought back to it is put where it stood.
      const members = membersOf.get(stateKey(state)) ?? [state]
      if (
        !swimLaneMode &&
        dragCardState !== dragCardInitialState &&
        members.length > 1 &&
        members.includes(dragCardInitialState)
      ) {
        putBack(dragCard)
        return
      }

      const canDrop =
        (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state)) &&
        !isMerged(state, membersOf) &&
        laneTakes(swimLane)

      if (!canDrop) {
        return
      }

      const updates = getUpdateProps(dragCard, state)
      if (updates === undefined) {
        return
      }

      if (dragCardState !== state) {
        if (!swimLaneMode) {
          // Move dragCard into the target column synchronously via groupByDocs
          // mutation so Svelte renders it in its new column on the next tick.
          // Strip dragCard from EVERY category first to prevent duplicate-key
          // errors if a transient parent rebuild re-injected it elsewhere.
          removeFromCategories(dragCard)
          const arr = getGroupByValues(groupByDocs, state) ?? []
          arr.push(dragCard)
          setGroupByValues(groupByDocs, state, arr)
        }
        dragOverDropTarget = undefined
        dragCardState = state
        dragCardTargetIndex = dontUpdateRank && orderBy?.[1] === -1 ? 0 : undefined
      }

      if (swimLaneChanged) {
        dragCardCurrentSwimLane = swimLane
        dragCardTargetIndex = dontUpdateRank && orderBy?.[1] === -1 ? 0 : undefined
      }
      groupByDocs = groupByDocs
    }
  }
  function panelDragLeave (event: Event | undefined, state: CategoryType): void {
    event?.preventDefault()
    // Legacy preview is render-only via getLegacyCategoryValues — no restore needed.
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

  function cardDragOver (evt: CardDragEvent, object: Item, state: CategoryType): void {
    // A merged column takes no drop; a reorder there would put the card in two categories.
    if (
      (dragCardAvailableCategories !== undefined && !dragCardAvailableCategories.includes(state)) ||
      isMerged(state, membersOf)
    ) {
      return
    }
    if (swimLaneMode) {
      if (dragCard === undefined) return
      if (object._id === dragCard._id) return
      const lane = dragCardCurrentSwimLane
      if (lane === undefined) return
      const visible = getSwimLaneCategoryValues(lane, state, groupByDocs, dragCard, lane, state, dragCardTargetIndex)
      const targetIdx = visible.findIndex((p) => p._id === object._id)
      const dragIdx = visible.findIndex((p) => p._id === dragCard?._id)
      if (targetIdx === -1) return
      const insertAfter = dragswap(evt, targetIdx, dragIdx)
      if (!insertAfter) return
      const desired = dragIdx === -1 || dragIdx > targetIdx ? targetIdx : targetIdx + 1
      const mapped = insertIndex(desired, dragIdx, visible.length)
      if (dragCardTargetIndex !== mapped) {
        dragCardTargetIndex = mapped
        groupByDocs = groupByDocs
      }
      return
    }
    if (dragCard !== undefined) {
      const updates = getUpdateProps(dragCard, state)
      if (updates === undefined) {
        return
      }
      if (object._id === dragCard._id) return
      const arr = getGroupByValues(groupByDocs, state) ?? []
      const targetIdx = arr.findIndex((p) => p._id === object._id)
      const dragIdx = arr.findIndex((p) => p._id === dragCard?._id)
      if (targetIdx === -1) return
      const targetEl: HTMLElement | null = (evt.target as HTMLElement).closest('[data-card-id]')
      const beforeTarget = (() => {
        const h = (evt.target as HTMLElement)?.offsetHeight ?? targetEl?.offsetHeight ?? 0
        return evt.offsetY < h / 2
      })()
      const desired = beforeTarget ? targetIdx : targetIdx + 1
      const mapped = insertIndex(desired, dragIdx, arr.length)
      // Reorder dragCard inside the column array so Svelte can render the
      // preview without any imperative DOM placeholder. Strip ALL occurrences
      // of dragCard before insertion to defend against any transient parent
      // rebuild that may have re-added it.
      if (mapped !== dragIdx) {
        const next = arr.filter((p) => p._id !== dragCard?._id)
        const insertAt = Math.max(0, Math.min(mapped, next.length))
        next.splice(insertAt, 0, dragCard)
        setGroupByValues(groupByDocs, state, next)
        groupByDocs = groupByDocs
        dragCardTargetIndex = mapped
      }
    }
  }

  async function cardDrop (evt: CardDragEvent, object: Item, state: CategoryType, swimLane?: SwimLane): Promise<void> {
    if (dragCard !== undefined) {
      const canDrop =
        (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state)) &&
        !isMerged(state, membersOf) &&
        laneTakes(swimLane)
      if (!canDrop) {
        dragCard = undefined
        dragCardAvailableCategories = undefined
        isDragging = false
        return
      }
      let updates: DocumentUpdate<Item> | undefined
      // Drop on the source card itself with no movement: skip rank update entirely.
      const droppedOnSelf = object._id === dragCard._id && dragCardTargetIndex === undefined
      const stateChanged = dragCardInitialState !== state
      // Always pick up state-mapped fields (status, space) when the column or
      // anything else changed — even if rank can't be derived (empty cell).
      if (stateChanged || !droppedOnSelf) {
        const stateUpdates = getUpdateProps(dragCard, state)
        if (stateUpdates !== undefined) updates = stateUpdates
      }
      if (!dontUpdateRank && !droppedOnSelf) {
        let prevRank: Rank | undefined
        let nextRank: Rank | undefined
        if (swimLaneMode && swimLane !== undefined) {
          const visible = getSwimLaneCategoryValues(
            swimLane,
            state,
            groupByDocs,
            dragCard,
            swimLane,
            state,
            dragCardTargetIndex
          )
          if (visible.some((p) => p._id === dragCard?._id)) {
            ;[prevRank, nextRank] = neighbourRanks(visible, dragCard._id, undefined)
          }
        } else {
          ;[prevRank, nextRank] = neighbourRanks(
            getGroupByValues(groupByDocs, state) ?? [],
            dragCard._id,
            dragCardTargetIndex
          )
        }
        if (prevRank !== undefined || nextRank !== undefined) {
          const newRank = makeRank(prevRank, nextRank)
          updates = { ...(updates ?? {}), rank: newRank }
        }
      }
      let swimUpdates: DocumentUpdate<Item> | undefined
      if (
        swimLaneMode &&
        swimLane !== undefined &&
        getSwimLaneUpdateProps !== undefined &&
        dragCardInitialSwimLane?._id !== swimLane._id
      ) {
        swimUpdates = getSwimLaneUpdateProps(dragCard, swimLane)
      }
      // Register optimistic overlay BEFORE awaiting server — so the live-query
      // snapshot doesn't snap the card back to its old position while the update
      // is in flight.
      const overlay: Record<string, unknown> = { ...(updates ?? {}), ...(swimUpdates ?? {}) }
      if (Object.keys(overlay).length > 0) {
        onMoveCommit?.(dragCard._id, overlay)
        dragCardToRestore = undefined
      }
      // Restore focus on the just-moved card so keyboard navigation continues
      // from there, mirroring the mouse-hover focus path.
      dispatch('obj-focus', { ...dragCard, ...overlay })
      // The drag can end while an update is pending, and that clears dragCard.
      const movedCard = dragCard
      try {
        if (updates !== undefined && Object.keys(updates).length > 0) {
          await client.diffUpdate(movedCard, updates)
        }
        if (swimUpdates !== undefined && Object.keys(swimUpdates).length > 0) {
          await client.update(movedCard, swimUpdates)
        }
      } catch (err) {
        onMoveRollback?.(movedCard._id)
      }
    }
    isDragging = false
  }

  async function onDragStart (object: Item, state: CategoryType, swimLane?: SwimLane): Promise<void> {
    dragCardInitialState = state
    dragCardInitialIndex = (getGroupByValues(groupByDocs, state) ?? []).findIndex((p) => p._id === object._id)
    dragCardState = state
    dragCardInitialRank = object.rank
    dragCardInitialSwimLane = swimLane
    dragCardCurrentSwimLane = swimLane
    dragCard = object
    dragCardToRestore = swimLaneMode ? undefined : object
    dragMoved = false
    dragOverCollapsed = undefined
    dragOverDropTarget = undefined
    isDragging = true
    dragCardTargetIndex = undefined
    const available = await getAvailableCategories?.(object)
    if (isDragging) {
      dragCardAvailableCategories = available
    }
  }

  function onDragEnd (): void {
    const card = dragCardToRestore
    dragCardToRestore = undefined
    if (card !== undefined) {
      const own = getGroupByValues(groupByDocs, dragCardInitialState) ?? []
      if (own[dragCardInitialIndex]?._id !== card._id) putBack(card)
    }
    isDragging = false
    dragCard = undefined
    dragCardAvailableCategories = undefined
    dragOverDropTarget = undefined
    stopAutoScroll()
    window.removeEventListener('mousemove', onDragEnd, true)
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
      const stateObjs = membersOf.has(stateKey(st)) ? columnValues(groupByDocs, st, membersOf) : []
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
    return shownSwimLanes.filter((s) => !collapsed.has(s._id))
  }

  function getCellObjects (st: CategoryType, lane?: SwimLane): Item[] {
    if (columnPlace(st, collapsedColumns, membersOf) !== 'open') return []
    if (swimLaneMode && lane !== undefined) {
      return getSwimLaneCategoryValues(
        lane,
        st,
        groupByDocs,
        dragCard,
        dragCardCurrentSwimLane,
        dragCardState,
        dragCardTargetIndex
      )
    }
    return columnValues(groupByDocs, st, membersOf)
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

<div
  class="kanban-container"
  class:swimlane-mode={swimLaneMode}
  class:compact
  class:modern
  on:dragover={handleDragMove}
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
            style:grid-template-columns={gridColumns}
            style:--swimlane-row-bg={defaultBackground($themeStore.dark)}
          >
            {#each categories as state, si (typeof state === 'object' ? state.name : state)}
              {@const stateObjects = columnValues(groupByDocs, state, membersOf)}
              {@const blocked = isBlocked(
                state,
                dragUnderway,
                dragCardAvailableCategories,
                dragCardInitialState,
                membersOf
              )}
              {#if columnPlace(state, collapsedColumns, membersOf) === 'open'}
                <div
                  class="swimlane-col-header"
                  data-id="kanban-column-header"
                  data-state={stateKey(state)}
                  class:drop-allowed={isDragging &&
                    (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state))}
                  class:drop-disabled={blocked}
                >
                  {#if $$slots.header !== undefined}
                    {#key si}
                      <slot
                        name="header"
                        state={toAny(state)}
                        count={stateObjects.length}
                        index={si}
                        collapsed={false}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/key}
                  {/if}
                </div>
              {/if}
            {/each}
          </div>

          {#each shownSwimLanes as swimLane (`${swimLaneKey}:${swimLane._id}`)}
            {@const isCollapsed = collapsed.has(swimLane._id)}
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
                <div class="swimlane-grid" style:grid-template-columns={gridColumns}>
                  {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                    {@const blocked = isBlocked(
                      state,
                      dragUnderway,
                      dragCardAvailableCategories,
                      dragCardInitialState,
                      membersOf
                    )}
                    {#if columnPlace(state, collapsedColumns, membersOf) === 'open'}
                      {@const laneStateObjects = getSwimLaneCategoryValues(
                        swimLane,
                        state,
                        groupByDocs,
                        dragCard,
                        dragCardCurrentSwimLane,
                        dragCardState,
                        dragCardTargetIndex,
                        membersOf
                      )}
                      <!-- svelte-ignore a11y-no-static-element-interactions -->
                      <div
                        class="swimlane-cell"
                        class:drop-target={isDragging}
                        class:drop-allowed={isDragging &&
                          (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state))}
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
                          void move(state, swimLane).then(() => {
                            isDragging = false
                          })
                        }}
                      >
                        <slot name="beforeCard" {state} {swimLane} />
                        {#if dragCardState === state && dragCardCurrentSwimLane?._id === swimLane._id && shownSpots.length > 1}
                          <div class="drop-targets" data-id="kanban-drop-targets">
                            {#each shownSpots as target (target.id)}
                              <!-- svelte-ignore a11y-no-static-element-interactions -->
                              <div
                                class="drop-target"
                                class:drag-over={dragOverDropTarget === target.id}
                                data-drop-target={target.id}
                                on:dragover={(event) => {
                                  dropTargetDragOver(event, target)
                                }}
                                on:dragleave={leaveDropTarget}
                                on:drop={(event) => {
                                  dropTargetDrop(event, state, target, swimLane)
                                }}
                              >
                                <div class="drop-target-label">
                                  <slot name="dropTarget" {state} {target} {dragCard} />
                                </div>
                                {#if dragOverDropTarget === target.id && dragCard !== undefined}
                                  <div class="drop-target-card">
                                    <slot
                                      name="card"
                                      object={dragCard}
                                      dragged={true}
                                      swimLane={dragCardCurrentSwimLane}
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
                          stateObjects={cardInSpot
                            ? laneStateObjects.filter((doc) => doc._id !== dragCard?._id)
                            : laneStateObjects}
                          {isDragging}
                          {dragCard}
                          {objects}
                          {selection}
                          {checkedSet}
                          {state}
                          loaded={loadedDocs}
                          limit={cellLimit(cellLimits, cellKey(swimLane._id, state), swimCellLimit)}
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
          {#if swimLanes.length > laneLimit}
            <div class="p-2 flex-center">
              <span class="mr-2">{laneLimit} / {swimLanes.length}</span>
              <Button
                size="small"
                icon={ui.icon.DotsHorizontal}
                label={ui.string.ShowMore}
                dataId="btn-kanban-show-more-lanes"
                on:click={() => {
                  laneLimit += SWIM_LANE_PAGE
                }}
              />
            </div>
          {/if}
        </div>
        {#if hasCollapsed}
          <div class="collapsed-stack" class:dragging={dragUnderway} data-id="kanban-collapsed-stack">
            <div class="collapsed-stack-items">
              {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                {#if columnPlace(state, collapsedColumns, membersOf) === 'stack'}
                  {@const blocked = isBlocked(
                    state,
                    dragUnderway,
                    dragCardAvailableCategories,
                    dragCardInitialState,
                    membersOf
                  )}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="collapsed-item"
                    data-id="kanban-collapsed-column"
                    data-state={stateKey(state)}
                    class:drop-allowed={isDragging && !blocked}
                    class:drop-disabled={blocked}
                    class:drag-over={isDragging && dragOverCollapsed === stateKey(state)}
                    on:dragover={(event) => {
                      dragOverCollapsed = stateKey(state)
                      // The stack has no lanes, so the card keeps its lane.
                      panelDragOver(event, state, dragCardInitialSwimLane)
                    }}
                    on:dragleave={(event) => {
                      leaveCollapsed(event)
                    }}
                    on:drop={() => {
                      dragOverCollapsed = undefined
                      void move(state, dragCardInitialSwimLane).then(() => {
                        isDragging = false
                      })
                    }}
                  >
                    {#if $$slots.header !== undefined}
                      <slot
                        name="header"
                        state={toAny(state)}
                        count={columnValues(groupByDocs, state, membersOf).length}
                        index={si}
                        collapsed={true}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/if}
                    {#if isDragging && dragCard !== undefined && dragOverCollapsed === stateKey(state)}
                      <div class="collapsed-drop-card">
                        <slot
                          name="card"
                          object={toAny(loadedDocs.get(dragCard._id) ?? dragCard)}
                          dragged={true}
                          swimLane={dragCardCurrentSwimLane}
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
      <div class="kanban-content">
        {#each categories as state, si (typeof state === 'object' ? state.name : state)}
          {@const stateObjects = getLegacyCategoryValues(state, groupByDocs, membersOf)}
          {@const blocked = isBlocked(
            state,
            dragUnderway,
            dragCardAvailableCategories,
            dragCardInitialState,
            membersOf
          )}

          {#if columnPlace(state, collapsedColumns, membersOf) === 'open'}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="panel-container"
              class:drop-allowed={isDragging &&
                (dragCardAvailableCategories === undefined || dragCardAvailableCategories.includes(state))}
              class:drop-disabled={blocked}
              data-id="kanban-column"
              data-state={stateKey(state)}
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
                  <slot
                    name="header"
                    state={toAny(state)}
                    count={stateObjects.length}
                    index={si}
                    collapsed={false}
                    {blocked}
                    toggle={() => {
                      toggleColumn(state)
                    }}
                    members={membersOf.get(stateKey(state)) ?? [state]}
                    merge={mergeWith(state)}
                  />
                {/key}
              {/if}
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
                  {#if dragCardState === state && shownSpots.length > 1}
                    <div class="drop-targets" data-id="kanban-drop-targets">
                      {#each shownSpots as target (target.id)}
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                          class="drop-target"
                          class:drag-over={dragOverDropTarget === target.id}
                          data-drop-target={target.id}
                          on:dragover={(event) => {
                            dropTargetDragOver(event, target)
                          }}
                          on:dragleave={leaveDropTarget}
                          on:drop={(event) => {
                            dropTargetDrop(event, state, target)
                          }}
                        >
                          <div class="drop-target-label">
                            <slot name="dropTarget" {state} {target} {dragCard} />
                          </div>
                          {#if dragOverDropTarget === target.id && dragCard !== undefined}
                            <div class="drop-target-card">
                              <slot name="card" object={dragCard} dragged={true} />
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                  <KanbanRow
                    bind:this={stateRows[si]}
                    on:obj-focus
                    stateObjects={cardInSpot ? stateObjects.filter((doc) => doc._id !== dragCard?._id) : stateObjects}
                    {isDragging}
                    {dragCard}
                    {objects}
                    {selection}
                    {checkedSet}
                    {state}
                    loaded={loadedDocs}
                    limit={cellLimit(cellLimits, cellKey('', state), columnLimit)}
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
          {/if}
        {/each}
        {#if hasCollapsed}
          <div class="collapsed-stack" class:dragging={dragUnderway} data-id="kanban-collapsed-stack">
            <div class="collapsed-stack-items">
              {#each categories as state, si (typeof state === 'object' ? state.name : state)}
                {#if columnPlace(state, collapsedColumns, membersOf) === 'stack'}
                  {@const blocked = isBlocked(
                    state,
                    dragUnderway,
                    dragCardAvailableCategories,
                    dragCardInitialState,
                    membersOf
                  )}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div
                    class="collapsed-item"
                    data-id="kanban-collapsed-column"
                    data-state={stateKey(state)}
                    class:drop-allowed={isDragging && !blocked}
                    class:drop-disabled={blocked}
                    class:drag-over={isDragging && dragOverCollapsed === stateKey(state)}
                    on:dragover={(event) => {
                      dragOverCollapsed = stateKey(state)
                      panelDragOver(event, state)
                    }}
                    on:dragleave={(event) => {
                      leaveCollapsed(event)
                    }}
                    on:drop={() => {
                      dragOverCollapsed = undefined
                      void move(state, dragCardCurrentSwimLane).then(() => {
                        isDragging = false
                      })
                    }}
                  >
                    {#if $$slots.header !== undefined}
                      <slot
                        name="header"
                        state={toAny(state)}
                        count={getLegacyCategoryValues(state, groupByDocs, membersOf).length}
                        index={si}
                        collapsed={true}
                        {blocked}
                        toggle={() => {
                          toggleColumn(state)
                        }}
                        members={membersOf.get(stateKey(state)) ?? [state]}
                        merge={mergeWith(state)}
                      />
                    {/if}
                    {#if isDragging && dragCard !== undefined && dragOverCollapsed === stateKey(state)}
                      <div class="collapsed-drop-card">
                        <slot name="card" object={toAny(loadedDocs.get(dragCard._id) ?? dragCard)} dragged={true} />
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
  {#if isDragging}
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
  // Landing spots of the column a card is held over: one full-width slot per value the card
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
