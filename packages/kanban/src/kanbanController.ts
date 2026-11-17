//
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
//

import type { CategoryType, Doc, DocumentUpdate, IdMap, Ref, Rank } from '@hcengineering/core'
import type { getClient } from '@hcengineering/presentation'
import { makeRank } from '@hcengineering/rank'
import type { createEventDispatcher } from 'svelte'
import { writable, readonly, type Writable, type Readable } from 'svelte/store'
import type { CardDragEvent, DocWithRank, DropTarget, Item, SwimLane } from './types'
import {
  loadCollapsed,
  loadMerged,
  buildColumns,
  insertIndex,
  laneCellValues,
  neighbourRanks,
  saveCollapsed,
  saveMerged,
  toggleMerge
} from './board'

import { stateKey } from './visibleGroups'
import {
  buildColumnView,
  cellLimit,
  isOtherBoardGroup,
  isMerged,
  columnPlace,
  cardPointerOffset,
  dragswap,
  swimCellKey,
  captureDragOriginScrolls,
  isAtDragOrigin,
  type DragOriginScroll
} from './boardView'

export interface KanbanBindings {
  seenLanes: Set<string>
  // Per-cell card limit, keyed by cellKey; a cell absent here shows its initial limit.
  laneLimit: number
  cellLimits: Map<string, number>
  collapsedColumns: Set<string>
  columnStorageKey: string | undefined
  membersOf: Map<string, CategoryType[]>
  // Merged columns are a view setting: their cards come from several categories.
  mergeGroups: string[][]
  categories: CategoryType[]
  fitColumns: boolean
  getCategoryGroup: ((state: CategoryType) => string | undefined) | undefined
  categoryGroups: string[][]
  groupByDocs: Record<string | number, Item[]>
  dropTargets: Map<string, DropTarget[]>
  getGroupByValues: (groupByDocs: Record<string | number, Item[]>, category: CategoryType) => Item[]
  // The collapsed column under the dragged card shows the card, as a live column does.
  dragOverCollapsed: string | undefined
  // The landing spot under the dragged card shows the card, as a slot it stands in.
  dragOverDropTarget: string | undefined
  atInitialPlace: boolean
  collapsed: Set<string>
  storageKey: string | undefined
  swimLanes: SwimLane[]
  getSwimLaneOfDoc: ((doc: Doc) => string | undefined) | undefined
  dragCardInitialSwimLane: SwimLane | undefined
  dragCardInitialState: CategoryType
  getSwimLaneDocId: ((swimLane: SwimLane) => Ref<Doc> | undefined) | undefined
  dragCard: Item | undefined
  dragCardCurrentSwimLane: SwimLane | undefined
  dragCardState: CategoryType | undefined
  // Insertion index of dragCard within target lane cell (swimlane mode). Undefined = append at end.
  dragCardTargetIndex: number | undefined
  getSwimLaneUpdateProps: ((doc: Doc, swimLane: SwimLane) => DocumentUpdate<Item> | undefined) | undefined
  dragCardAvailableCategories: CategoryType[] | undefined
  getUpdateProps: (doc: Doc, state: CategoryType, dropTargetId?: string) => DocumentUpdate<Item> | undefined
  dontUpdateRank: boolean
  swimLaneMode: boolean
  onMoveCommit: ((id: string, fields: Record<string, unknown>) => void) | undefined
  dispatch: ReturnType<typeof createEventDispatcher>
  client: ReturnType<typeof getClient>
  onMoveRollback: ((id: string) => void) | undefined
  scrollerEl: HTMLElement | undefined
  isDragging: boolean
  dragMoved: boolean
  setGroupByValues: (groupByDocs: Record<string | number, Item[]>, category: CategoryType, docs: Item[]) => void
  orderBy: [string, 1 | -1] | undefined
  getAvailableCategories: ((doc: Doc) => Promise<CategoryType[]>) | undefined
  swimRowBindings: Record<string, { scroll: (item: Item) => void }>
  stateRefs: HTMLElement[]
  stateRows: Array<{ scroll: (item: Item) => void }>
  shownSwimLanes: SwimLane[]
  objects: DocWithRank[]
  selection: number | undefined
  checkedSet: Set<Ref<Doc>>
  checked: Doc[]
}

type ViewKey =
  | 'laneLimit'
  | 'seenLanes'
  | 'cellLimits'
  | 'collapsedColumns'
  | 'mergeGroups'
  | 'dragOverCollapsed'
  | 'dragOverDropTarget'
  | 'atInitialPlace'
  | 'collapsed'
  | 'dragCardInitialSwimLane'
  | 'dragCardInitialState'
  | 'dragCard'
  | 'dragCardCurrentSwimLane'
  | 'dragCardState'
  | 'dragCardTargetIndex'
  | 'dragCardAvailableCategories'
  | 'isDragging'
  | 'dragMoved'
export type KanbanInputs = Omit<KanbanBindings, ViewKey | 'membersOf' | 'categoryGroups'>

export class KanbanController {
  private readonly board: KanbanBindings
  private readonly columns: Writable<ReturnType<typeof buildColumnView>>
  private readonly stores: { [K in ViewKey]: Writable<KanbanBindings[K]> }
  readonly view: { readonly columns: Readable<ReturnType<typeof buildColumnView>> } & {
    readonly [K in ViewKey]: Readable<KanbanBindings[K]>
  }

  private dragOriginScrolls: DragOriginScroll[] = []
  private dragSource: HTMLElement | undefined
  private dragCardInitialRect: DOMRect | undefined
  private dragOriginShifted = false
  private dragCardInitialRank: Rank | undefined
  // Where the card stood in its category, to put it back there in the legacy layout.
  private dragCardInitialIndex = -1
  // The legacy preview moves the card inside groupByDocs. Cleared once an update is sent,
  // so that a drag which sends none puts the card back.
  private dragCardToRestore: Item | undefined
  private dragVersion = 0
  private dragEndTimer: ReturnType<typeof setTimeout> | undefined
  private autoScrollRaf: number | undefined
  private lastDragX = 0
  private lastDragY = 0
  private readonly EDGE_PX = 60
  private readonly MAX_STEP = 24
  private previousLaneKey: string | undefined
  private previousCategories: CategoryType[]
  private previousColumnSignature: string
  readonly state: Readonly<KanbanBindings>

  constructor (
    inputs: KanbanInputs,
    private readonly onChange: (
      patch: Partial<Pick<KanbanInputs, 'selection' | 'checked' | 'groupByDocs'>>
    ) => void = () => {}
  ) {
    this.board = {
      ...inputs,
      membersOf: new Map(),
      categoryGroups: [],
      laneLimit: 20,
      seenLanes: new Set<string>(),
      cellLimits: new Map<string, number>(),
      collapsedColumns: new Set<string>(),
      mergeGroups: [],
      dragOverCollapsed: undefined,
      dragOverDropTarget: undefined,
      atInitialPlace: false,
      collapsed: new Set<string>(),
      dragCardInitialSwimLane: undefined,
      dragCardInitialState: inputs.categories[0],
      dragCard: undefined,
      dragCardCurrentSwimLane: undefined,
      dragCardState: undefined,
      dragCardTargetIndex: undefined,
      dragCardAvailableCategories: undefined,
      isDragging: false,
      dragMoved: false
    }
    this.columns = writable(
      buildColumnView(
        this.board.categories,
        this.board.mergeGroups,
        this.board.collapsedColumns,
        this.board.getCategoryGroup,
        this.board.fitColumns
      )
    )
    this.refreshColumns()
    this.stores = {
      laneLimit: writable(this.board.laneLimit),
      seenLanes: writable(this.board.seenLanes),
      cellLimits: writable(this.board.cellLimits),
      collapsedColumns: writable(this.board.collapsedColumns),
      mergeGroups: writable(this.board.mergeGroups),
      dragOverCollapsed: writable(this.board.dragOverCollapsed),
      dragOverDropTarget: writable(this.board.dragOverDropTarget),
      atInitialPlace: writable(this.board.atInitialPlace),
      collapsed: writable(this.board.collapsed),
      dragCardInitialSwimLane: writable(this.board.dragCardInitialSwimLane),
      dragCardInitialState: writable(this.board.dragCardInitialState),
      dragCard: writable(this.board.dragCard),
      dragCardCurrentSwimLane: writable(this.board.dragCardCurrentSwimLane),
      dragCardState: writable(this.board.dragCardState),
      dragCardTargetIndex: writable(this.board.dragCardTargetIndex),
      dragCardAvailableCategories: writable(this.board.dragCardAvailableCategories),
      isDragging: writable(this.board.isDragging),
      dragMoved: writable(this.board.dragMoved)
    }
    this.view = {
      columns: readonly(this.columns),
      laneLimit: readonly(this.stores.laneLimit),
      seenLanes: readonly(this.stores.seenLanes),
      cellLimits: readonly(this.stores.cellLimits),
      collapsedColumns: readonly(this.stores.collapsedColumns),
      mergeGroups: readonly(this.stores.mergeGroups),
      dragOverCollapsed: readonly(this.stores.dragOverCollapsed),
      dragOverDropTarget: readonly(this.stores.dragOverDropTarget),
      atInitialPlace: readonly(this.stores.atInitialPlace),
      collapsed: readonly(this.stores.collapsed),
      dragCardInitialSwimLane: readonly(this.stores.dragCardInitialSwimLane),
      dragCardInitialState: readonly(this.stores.dragCardInitialState),
      dragCard: readonly(this.stores.dragCard),
      dragCardCurrentSwimLane: readonly(this.stores.dragCardCurrentSwimLane),
      dragCardState: readonly(this.stores.dragCardState),
      dragCardTargetIndex: readonly(this.stores.dragCardTargetIndex),
      dragCardAvailableCategories: readonly(this.stores.dragCardAvailableCategories),
      isDragging: readonly(this.stores.isDragging),
      dragMoved: readonly(this.stores.dragMoved)
    }
    this.previousCategories = this.board.categories.slice()
    this.previousColumnSignature = JSON.stringify(
      this.board.categories.map((state) => [stateKey(state), this.board.getCategoryGroup?.(state)])
    )
    this.state = this.board
  }

  private readonly refreshColumns = (): void => {
    const view = buildColumnView(
      this.board.categories,
      this.board.mergeGroups,
      this.board.collapsedColumns,
      this.board.getCategoryGroup,
      this.board.fitColumns
    )
    this.board.membersOf = view.membersOf
    this.board.categoryGroups = view.categoryGroups
    this.columns.set(view)
  }

  private readonly set = <K extends keyof KanbanBindings>(key: K, value: KanbanBindings[K]): KanbanBindings[K] => {
    if ((typeof value !== 'object' || value === null) && Object.is(this.board[key], value)) return value
    this.board[key] = value
    const store = (this.stores as Partial<{ [K in keyof KanbanBindings]: Writable<KanbanBindings[K]> }>)[key]
    store?.set(value)
    if (key === 'mergeGroups' || key === 'collapsedColumns') this.refreshColumns()
    if (key === 'selection' || key === 'checked' || key === 'groupByDocs') this.onChange({ [key]: value })
    return value
  }

  showMoreLanes = (): void => {
    this.set('laneLimit', this.board.laneLimit + 20)
  }

  markLaneSeen = (id: string, visible: boolean, unsubscribe?: () => void): void => {
    if (!visible) return
    unsubscribe?.()
    if (!this.board.seenLanes.has(id)) this.set('seenLanes', new Set(this.board.seenLanes).add(id))
  }

  showMore = (key: string, initial: number, step: number): void => {
    this.board.cellLimits.set(key, cellLimit(this.board.cellLimits, key, initial) + step)
    this.set('cellLimits', this.board.cellLimits)
  }

  toggleColumn = (state: CategoryType): void => {
    const key = stateKey(state)
    if (this.board.collapsedColumns.has(key)) this.board.collapsedColumns.delete(key)
    else this.board.collapsedColumns.add(key)
    this.set('collapsedColumns', new Set(this.board.collapsedColumns))
    saveCollapsed(this.board.columnStorageKey, this.board.collapsedColumns, 'column')
  }

  private readonly mergeColumn = (state: CategoryType, other: CategoryType): void => {
    const otherKey = stateKey(other)
    // Collapse is stored under the first column of a group: the rest of the group keeps it when `other` leaves.
    const rest = (this.board.membersOf.get(otherKey) ?? []).filter((m) => stateKey(m) !== otherKey)
    this.set('mergeGroups', toggleMerge(this.board.mergeGroups, stateKey(state), otherKey))
    saveMerged(this.board.columnStorageKey, this.board.mergeGroups)
    // A collapsed column joins the open one, it does not pull it into the stack.
    if (!this.board.collapsedColumns.delete(otherKey)) return
    const heir = buildColumns(this.board.categories, this.board.mergeGroups).find(
      (c) => rest.length > 0 && c.members.includes(rest[0])
    )
    if (heir !== undefined) this.board.collapsedColumns.add(stateKey(heir.state))
    this.set('collapsedColumns', new Set(this.board.collapsedColumns))
    saveCollapsed(this.board.columnStorageKey, this.board.collapsedColumns, 'column')
  }

  mergeWith = (state: CategoryType): ((other: CategoryType) => void) => {
    return (other) => {
      this.mergeColumn(state, other)
    }
  }

  // Stored groups may belong to other boards: a viewlet is shared by all projects.
  private readonly otherBoardsGroups = (): string[][] => {
    return this.board.mergeGroups.filter((group) => isOtherBoardGroup(this.board.categories, group))
  }

  // Replaces the merged columns with one column per group of `getCategoryGroup`.
  mergeByGroup = (): void => {
    if (this.board.getCategoryGroup === undefined) return
    const groups = this.board.categoryGroups
    // The group is drawn at its first status, whose collapse would hide an open column of the group.
    for (const keys of groups) {
      if (keys.some((key) => this.board.membersOf.has(key) && !this.board.collapsedColumns.has(key))) {
        this.board.collapsedColumns.delete(keys[0])
      }
    }
    this.set('collapsedColumns', new Set(this.board.collapsedColumns))
    saveCollapsed(this.board.columnStorageKey, this.board.collapsedColumns, 'column')
    this.set('mergeGroups', [...this.otherBoardsGroups(), ...groups])
    saveMerged(this.board.columnStorageKey, this.board.mergeGroups)
  }

  resetMerge = (): void => {
    this.set('mergeGroups', this.otherBoardsGroups())
    saveMerged(this.board.columnStorageKey, this.board.mergeGroups)
  }

  columnValues = (
    _groupByDocs: KanbanBindings['groupByDocs'],
    state: CategoryType,
    members: Map<string, CategoryType[]>
  ): Item[] => {
    return (members.get(stateKey(state)) ?? [state]).flatMap((m) => this.board.getGroupByValues(_groupByDocs, m) ?? [])
  }

  // The category a card of a merged column really has.
  cardState = (object: Item, column: CategoryType): CategoryType => {
    return (
      (this.board.membersOf.get(stateKey(column)) ?? [column]).find((m) =>
        this.board.getGroupByValues(this.board.groupByDocs, m)?.some((it) => it._id === object._id)
      ) ?? column
    )
  }

  leaveCollapsed = (event: DragEvent): void => {
    const item = event.currentTarget as HTMLElement
    if (!item.contains(event.relatedTarget as Node | null)) this.set('dragOverCollapsed', undefined)
  }

  leaveDropTarget = (event: DragEvent): void => {
    const item = event.currentTarget as HTMLElement
    if (!item.contains(event.relatedTarget as Node | null)) this.set('dragOverDropTarget', undefined)
  }

  dropTargetDragOver = (event: DragEvent, state: CategoryType, target: DropTarget, swimLane?: SwimLane): void => {
    if (this.board.atInitialPlace) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    this.panelDragOver(event, state, swimLane)
    event.preventDefault()
    event.stopPropagation()
    this.set('dragOverDropTarget', target.id)
  }

  dropTargetDrop = (event: DragEvent, state: CategoryType, target: DropTarget, swimLane?: SwimLane): void => {
    event.preventDefault()
    event.stopPropagation()
    this.set('dragOverDropTarget', undefined)
    void this.move(state, swimLane, target.id)
  }

  toggleSwimLane = (id: string): void => {
    if (this.board.collapsed.has(id)) this.board.collapsed.delete(id)
    else this.board.collapsed.add(id)
    this.set('collapsed', new Set(this.board.collapsed))
    saveCollapsed(this.board.storageKey, this.board.collapsed)
  }

  collapseAll = (): void => {
    this.set('collapsed', new Set(this.board.swimLanes.map((s) => s._id)))
    saveCollapsed(this.board.storageKey, this.board.collapsed)
  }

  expandAll = (): void => {
    this.set('collapsed', new Set())
    saveCollapsed(this.board.storageKey, this.board.collapsed)
  }

  // Filter docs of a category that belong to a given swim lane.
  getSwimLaneCategoryValues = (
    swimLane: SwimLane,
    category: CategoryType,
    _groupByDocs: KanbanBindings['groupByDocs'],
    _dragCard: Item | undefined,
    _dragCardCurrentSwimLane: SwimLane | undefined,
    _dragCardState: CategoryType | undefined,
    _dragCardTargetIndex: number | undefined,
    _members: Map<string, CategoryType[]> = this.board.membersOf
  ): Item[] => {
    // A merged column takes no drop, so its dragged card keeps its place there.
    const merged = isMerged(category, _members)
    return laneCellValues(
      this.columnValues(_groupByDocs, category, _members),
      swimLane._id,
      category,
      this.board.getSwimLaneOfDoc,
      {
        card: merged || (this.board.dropTargets.size > 0 && _dragCardTargetIndex === undefined) ? undefined : _dragCard,
        initialLane: this.board.dragCardInitialSwimLane?._id,
        initialState: this.board.dragCardInitialState,
        lane: _dragCardCurrentSwimLane?._id,
        state: _dragCardState,
        targetIndex: _dragCardTargetIndex
      }
    )
  }

  // Legacy (non-swimlane) cell values. Returns raw cell content unchanged during
  // drag — drag preview is shown via a CSS drop-zone highlight on the target
  // column, not by relocating the card in the DOM. This avoids a Svelte reactivity
  // cascade across every column on every dragover and keeps drag interaction smooth.
  getLegacyCategoryValues = (
    category: CategoryType,
    _groupByDocs: KanbanBindings['groupByDocs'],
    _members: Map<string, CategoryType[]> = this.board.membersOf
  ): Item[] => {
    return this.columnValues(_groupByDocs, category, _members)
  }

  getLaneDoc = (swimLane: SwimLane, docs: IdMap<DocWithRank>): DocWithRank | undefined => {
    const id = this.board.getSwimLaneDocId?.(swimLane)
    return id !== undefined ? docs.get(id as Ref<DocWithRank>) : undefined
  }

  countSwimLane = (swimLane: SwimLane): number => {
    let total = 0
    for (const cat of this.board.categories) {
      // A merged status is counted by the first column of its group.
      if (!this.board.membersOf.has(stateKey(cat))) continue
      total += this.getSwimLaneCategoryValues(
        swimLane,
        cat,
        this.board.groupByDocs,
        this.board.dragCard,
        this.board.dragCardCurrentSwimLane,
        this.board.dragCardState,
        this.board.dragCardTargetIndex
      ).length
    }
    return total
  }

  // A card leaves its lane only for a lane that knows what to write into the card.
  laneTakes = (lane: SwimLane | undefined): boolean => {
    if (
      this.board.dragCard === undefined ||
      lane === undefined ||
      lane._id === this.board.dragCardInitialSwimLane?._id
    ) {
      return true
    }
    return this.board.getSwimLaneUpdateProps?.(this.board.dragCard, lane) !== undefined
  }

  move = async (state: CategoryType, targetSwimLane?: SwimLane, dropTargetId?: string): Promise<void> => {
    const version = this.dragVersion
    if (this.board.dragCard === undefined) {
      return
    }

    const canDrop =
      (this.board.dragCardAvailableCategories === undefined ||
        this.board.dragCardAvailableCategories.includes(state)) &&
      !isMerged(state, this.board.membersOf) &&
      this.laneTakes(targetSwimLane)

    if (!canDrop) {
      this.set('dragCard', undefined)
      this.set('dragCardAvailableCategories', undefined)
      return
    }

    if (
      this.board.atInitialPlace &&
      state === this.board.dragCardInitialState &&
      targetSwimLane?._id === this.board.dragCardInitialSwimLane?._id
    ) {
      this.onDragEnd()
      return
    }

    let updates = this.board.getUpdateProps(this.board.dragCard, state, dropTargetId)

    if (updates === undefined) {
      this.panelDragLeave(undefined, this.board.dragCardState)
      this.set('dragCard', undefined)
      this.set('dragCardAvailableCategories', undefined)
      return
    }

    const cardValues = this.board.dragCard as unknown as Record<string, unknown>
    if (
      state === this.board.dragCardInitialState &&
      targetSwimLane?._id === this.board.dragCardInitialSwimLane?._id &&
      (dropTargetId === undefined
        ? this.board.dropTargets.size === 0 ||
          this.board.dontUpdateRank ||
          this.board.dragCardState !== state ||
          this.board.dragCardTargetIndex === undefined
        : Object.entries(updates).every(([key, value]) => key === 'rank' || cardValues[key] === value))
    ) {
      this.onDragEnd()
      return
    }

    // Apply swim lane field update via plain update — diffUpdate ignores attachedTo/space.
    let swimUpdates: DocumentUpdate<Item> | undefined
    if (
      this.board.swimLaneMode &&
      targetSwimLane !== undefined &&
      this.board.getSwimLaneUpdateProps !== undefined &&
      this.board.dragCardInitialSwimLane?._id !== targetSwimLane._id
    ) {
      swimUpdates = this.board.getSwimLaneUpdateProps(this.board.dragCard, targetSwimLane)
    }

    if (!this.board.dontUpdateRank) {
      // Compute target rank from neighbours of the target cell (lane+state).
      let prevRank: Rank | undefined
      let nextRank: Rank | undefined
      if (this.board.swimLaneMode && targetSwimLane !== undefined) {
        const visible = this.getSwimLaneCategoryValues(
          targetSwimLane,
          state,
          this.board.groupByDocs,
          this.board.dragCard,
          targetSwimLane,
          state,
          this.board.dragCardTargetIndex
        )
        // A card gone from its own cell during the drag keeps its rank.
        if (visible.some((p) => p._id === this.board.dragCard?._id)) {
          ;[prevRank, nextRank] = neighbourRanks(visible, this.board.dragCard._id, undefined)
        }
      } else {
        ;[prevRank, nextRank] = neighbourRanks(
          this.board.getGroupByValues(this.board.groupByDocs, state) ?? [],
          this.board.dragCard._id,
          this.board.dragCardTargetIndex
        )
      }
      if (prevRank !== undefined || nextRank !== undefined) {
        const newRank = makeRank(prevRank, nextRank)
        if (newRank !== this.dragCardInitialRank && newRank !== this.board.dragCard.rank) {
          updates = { ...updates, rank: newRank }
        }
      } else if (this.dragCardInitialRank !== this.board.dragCard.rank && this.dragCardInitialRank !== undefined) {
        updates = { ...updates, rank: this.board.dragCard.rank }
      }
    }
    // Build the diff against current card values. Do NOT mutate the card —
    // optimistic positioning is handled via onMoveCommit (pendingMoves overlay
    // in the host component), which keeps live-query in charge of the actual
    // card state until the server confirms.
    const movedCard = this.board.dragCard
    const rawMerged: DocumentUpdate<Item> = { ...updates, ...(swimUpdates ?? {}) }
    const merged = Object.fromEntries(
      Object.entries(rawMerged).filter(([key, value]) => cardValues[key] !== value)
    ) as DocumentUpdate<Item>

    if (Object.keys(merged).length > 0) {
      // Optimistic overlay in the host (KanbanView) keeps the moved card in
      // its new column/rank until the live-query roundtrip lands; the actual
      // card data stays under live-query control.
      this.board.onMoveCommit?.(movedCard._id, merged as Record<string, unknown>)
      this.dragCardToRestore = undefined
    }
    // Restore focus on the just-moved card so keyboard navigation continues
    // from there, mirroring the mouse-hover focus path.
    this.board.dispatch('obj-focus', { ...movedCard, ...merged })
    if (Object.keys(merged).length > 0) {
      try {
        await this.board.client.update(this.board.dragCard, merged)
      } catch (err) {
        this.board.onMoveRollback?.(movedCard._id)
      }
    }
    if (version === this.dragVersion) this.onDragEnd()
  }

  private readonly endAfterDrop = (): void => {
    const version = this.dragVersion
    // Native listeners can run microtasks between capture and target; cleanup needs the next task.
    if (this.dragEndTimer !== undefined) clearTimeout(this.dragEndTimer)
    this.dragEndTimer = setTimeout(() => {
      this.dragEndTimer = undefined
      if (version === this.dragVersion) this.onDragEnd()
    }, 0)
  }

  private readonly autoScrollTick = (): void => {
    this.autoScrollRaf = undefined
    // bind:divScroll sets null once the Scroller is destroyed.
    const el = this.board.scrollerEl
    if (!this.board.isDragging || el == null) return
    const r = el.getBoundingClientRect()
    let dx = 0
    let dy = 0
    if (this.lastDragX - r.left < this.EDGE_PX) {
      dx = -Math.ceil(((this.EDGE_PX - (this.lastDragX - r.left)) / this.EDGE_PX) * this.MAX_STEP)
    } else if (r.right - this.lastDragX < this.EDGE_PX) {
      dx = Math.ceil(((this.EDGE_PX - (r.right - this.lastDragX)) / this.EDGE_PX) * this.MAX_STEP)
    }
    if (this.lastDragY - r.top < this.EDGE_PX) {
      dy = -Math.ceil(((this.EDGE_PX - (this.lastDragY - r.top)) / this.EDGE_PX) * this.MAX_STEP)
    } else if (r.bottom - this.lastDragY < this.EDGE_PX) {
      dy = Math.ceil(((this.EDGE_PX - (r.bottom - this.lastDragY)) / this.EDGE_PX) * this.MAX_STEP)
    }
    const left = el.scrollLeft
    const top = el.scrollTop
    if (dx !== 0) el.scrollLeft = left + dx
    if (dy !== 0) el.scrollTop = top + dy
    if (this.board.isDragging && (el.scrollLeft !== left || el.scrollTop !== top)) {
      this.autoScrollRaf = requestAnimationFrame(this.autoScrollTick)
    }
  }

  handleDragMove = (e: DragEvent): void => {
    if (!this.board.isDragging) return
    const shiftedOrigin =
      this.board.dragMoved && (this.board.dropTargets.get(stateKey(this.board.dragCardInitialState))?.length ?? 0) > 0
    if (shiftedOrigin && !this.dragOriginShifted && this.board.dragCardTargetIndex === undefined) {
      const source = this.board.scrollerEl?.querySelector<HTMLElement>(`[data-card-id="${this.board.dragCard?._id}"]`)
      const cell = source?.closest<HTMLElement>('[data-state]')
      if (
        source != null &&
        cell?.dataset.state === stateKey(this.board.dragCardInitialState) &&
        (!this.board.swimLaneMode || cell.dataset.swimlaneId === this.board.dragCardInitialSwimLane?._id) &&
        cell.querySelector('[data-id="kanban-drop-targets"]') !== null
      ) {
        // Reordering moves the preview; cancellation stays at the slot below the status targets.
        this.dragCardInitialRect = source.getBoundingClientRect()
        this.dragOriginScrolls = captureDragOriginScrolls(source, this.board.scrollerEl)
        this.dragOriginShifted = true
      }
    }
    const overDropTarget = e.target instanceof Element && e.target.closest('[data-drop-target]') !== null
    this.set('atInitialPlace', !overDropTarget && isAtDragOrigin(this.dragCardInitialRect, e, this.dragOriginScrolls))
    if (
      this.board.atInitialPlace &&
      this.board.dragCard !== undefined &&
      (this.board.dragCardState !== this.board.dragCardInitialState ||
        this.board.dragCardCurrentSwimLane?._id !== this.board.dragCardInitialSwimLane?._id ||
        this.board.dragCardTargetIndex !== undefined ||
        this.board.getGroupByValues(this.board.groupByDocs, this.board.dragCardInitialState)?.[
          this.dragCardInitialIndex
        ]?._id !== this.board.dragCard._id)
    ) {
      this.putBack(this.board.dragCard)
      this.set('dragCardCurrentSwimLane', this.board.dragCardInitialSwimLane)
      this.set('dragOverDropTarget', undefined)
    }
    // A card that unmounts mid-drag loses its dragend. A native drag sends no mouse events,
    // so the first mousemove ends it. Not armed at dragstart: Firefox sends one right after.
    if (!this.board.dragMoved) window.addEventListener('mousemove', this.onDragEnd, true)
    this.set('dragMoved', true)
    if (this.board.atInitialPlace) {
      this.stopAutoScroll()
      return
    }
    this.lastDragX = e.clientX
    this.lastDragY = e.clientY
    this.autoScrollRaf ??= requestAnimationFrame(this.autoScrollTick)
  }

  private readonly stopAutoScroll = (): void => {
    if (this.autoScrollRaf !== undefined) {
      cancelAnimationFrame(this.autoScrollRaf)
      this.autoScrollRaf = undefined
    }
  }

  updateDone = async (updateValue: DocumentUpdate<Item>): Promise<void> => {
    this.set('isDragging', false)
    if (this.board.dragCard === undefined) {
      return
    }
    this.dragCardToRestore = undefined
    await this.board.client.update(this.board.dragCard, updateValue)
  }

  private readonly removeFromCategories = (card: Item): void => {
    for (const cat of this.board.categories) {
      const a = this.board.getGroupByValues(this.board.groupByDocs, cat) ?? []
      const i = a.findIndex((p) => p._id === card._id)
      if (i !== -1) {
        a.splice(i, 1)
        this.board.setGroupByValues(this.board.groupByDocs, cat, a)
      }
    }
  }

  private readonly putBack = (card: Item): void => {
    this.removeFromCategories(card)
    const own = this.board.getGroupByValues(this.board.groupByDocs, this.board.dragCardInitialState) ?? []
    own.splice(this.dragCardInitialIndex === -1 ? own.length : this.dragCardInitialIndex, 0, card)
    this.board.setGroupByValues(this.board.groupByDocs, this.board.dragCardInitialState, own)
    this.set('dragCardState', this.board.dragCardInitialState)
    this.set('dragCardTargetIndex', undefined)
    this.set('groupByDocs', this.board.groupByDocs)
  }

  panelDragOver = (event: Event | undefined, state: CategoryType, swimLane?: SwimLane): void => {
    event?.preventDefault()
    if (this.board.dragCard === undefined || this.board.atInitialPlace) return

    const swimLaneChanged = swimLane !== undefined && this.board.dragCardCurrentSwimLane?._id !== swimLane._id

    if (this.board.dragCardState !== state || swimLaneChanged) {
      // A merged column takes no drop, so a card brought back to it is put where it stood.
      const members = this.board.membersOf.get(stateKey(state)) ?? [state]
      if (
        !this.board.swimLaneMode &&
        this.board.dragCardState !== this.board.dragCardInitialState &&
        members.length > 1 &&
        members.includes(this.board.dragCardInitialState)
      ) {
        this.putBack(this.board.dragCard)
        return
      }

      const canDrop =
        (this.board.dragCardAvailableCategories === undefined ||
          this.board.dragCardAvailableCategories.includes(state)) &&
        !isMerged(state, this.board.membersOf) &&
        this.laneTakes(swimLane)

      if (!canDrop) {
        return
      }

      const updates = this.board.getUpdateProps(this.board.dragCard, state)
      if (updates === undefined) {
        return
      }

      const targetIndex =
        this.board.dropTargets.size === 0 && this.board.dontUpdateRank && this.board.orderBy?.[1] === -1 ? 0 : undefined
      if (this.board.dragCardState !== state) {
        if (!this.board.swimLaneMode && this.board.dropTargets.size === 0) {
          // Move dragCard into the target column synchronously via groupByDocs
          // mutation so Svelte renders it in its new column on the next tick.
          // Strip dragCard from EVERY category first to prevent duplicate-key
          // errors if a transient parent rebuild re-injected it elsewhere.
          this.removeFromCategories(this.board.dragCard)
          const arr = this.board.getGroupByValues(this.board.groupByDocs, state) ?? []
          arr.push(this.board.dragCard)
          this.board.setGroupByValues(this.board.groupByDocs, state, arr)
        }
        this.set('dragOverDropTarget', undefined)
        this.set('dragCardState', state)
        this.set('dragCardTargetIndex', targetIndex)
      }

      if (swimLaneChanged) {
        this.set('dragCardCurrentSwimLane', swimLane)
        this.set('dragCardTargetIndex', targetIndex)
      }
      this.set('groupByDocs', this.board.groupByDocs)
    }
  }

  private readonly panelDragLeave = (event: Event | undefined, state: CategoryType): void => {
    event?.preventDefault()
    // Legacy preview is render-only via getLegacyCategoryValues — no restore needed.
  }

  cardDragOver = (evt: CardDragEvent, object: Item, state: CategoryType, swimLane?: SwimLane): void => {
    if (this.board.atInitialPlace || this.board.dontUpdateRank) {
      evt.preventDefault()
      return
    }
    // A merged column takes no drop; a reorder there would put the card in two categories.
    if (
      (this.board.dragCardAvailableCategories !== undefined &&
        !this.board.dragCardAvailableCategories.includes(state)) ||
      isMerged(state, this.board.membersOf)
    ) {
      return
    }
    // The cell's bubbling dragover must not reset a reorder computed for its card.
    this.panelDragOver(evt, state, swimLane)
    if (this.board.swimLaneMode) {
      if (this.board.dragCard === undefined) return
      if (object._id === this.board.dragCard._id) return
      const lane = this.board.dragCardCurrentSwimLane
      if (lane === undefined) return
      const visible = this.getSwimLaneCategoryValues(
        lane,
        state,
        this.board.groupByDocs,
        this.board.dragCard,
        lane,
        state,
        this.board.dragCardTargetIndex
      )
      const targetIdx = visible.findIndex((p) => p._id === object._id)
      const dragIdx = visible.findIndex((p) => p._id === this.board.dragCard?._id)
      if (targetIdx === -1) return
      const insertAfter = dragswap(evt, targetIdx, dragIdx)
      if (!insertAfter) return
      const desired = dragIdx === -1 || dragIdx > targetIdx ? targetIdx : targetIdx + 1
      const mapped = insertIndex(desired, dragIdx, visible.length)
      if (this.board.dragCardTargetIndex !== mapped) {
        this.set('dragCardTargetIndex', mapped)
        this.set('groupByDocs', this.board.groupByDocs)
      }
      return
    }
    if (this.board.dragCard !== undefined) {
      const updates = this.board.getUpdateProps(this.board.dragCard, state)
      if (updates === undefined) {
        return
      }
      if (object._id === this.board.dragCard._id) return
      const arr = this.board.getGroupByValues(this.board.groupByDocs, state) ?? []
      const targetIdx = arr.findIndex((p) => p._id === object._id)
      const dragIdx = arr.findIndex((p) => p._id === this.board.dragCard?._id)
      if (targetIdx === -1) return
      const beforeTarget = cardPointerOffset(evt) < 0
      const desired = beforeTarget ? targetIdx : targetIdx + 1
      const mapped = insertIndex(desired, dragIdx, arr.length)
      if (this.board.dropTargets.size > 0 && state !== this.board.dragCardInitialState) {
        this.set('dragCardTargetIndex', mapped)
        return
      }
      // Reorder dragCard inside the column array so Svelte can render the
      // preview without any imperative DOM placeholder. Strip ALL occurrences
      // of dragCard before insertion to defend against any transient parent
      // rebuild that may have re-added it.
      if (mapped !== dragIdx) {
        const next = arr.filter((p) => p._id !== this.board.dragCard?._id)
        const insertAt = Math.max(0, Math.min(mapped, next.length))
        next.splice(insertAt, 0, this.board.dragCard)
        this.board.setGroupByValues(this.board.groupByDocs, state, next)
        this.set('groupByDocs', this.board.groupByDocs)
        this.set('dragCardTargetIndex', mapped)
      }
    }
  }

  cardDrop = async (evt: CardDragEvent, object: Item, state: CategoryType, swimLane?: SwimLane): Promise<void> => {
    const version = this.dragVersion
    if (this.board.dragCard !== undefined) {
      const canDrop =
        (this.board.dragCardAvailableCategories === undefined ||
          this.board.dragCardAvailableCategories.includes(state)) &&
        !isMerged(state, this.board.membersOf) &&
        this.laneTakes(swimLane)
      if (!canDrop) {
        this.set('dragCard', undefined)
        this.set('dragCardAvailableCategories', undefined)
        this.set('isDragging', false)
        return
      }
      if (
        (this.board.atInitialPlace || this.board.dontUpdateRank || this.board.dragCardTargetIndex === undefined) &&
        state === this.board.dragCardInitialState &&
        swimLane?._id === this.board.dragCardInitialSwimLane?._id
      ) {
        this.onDragEnd()
        return
      }
      let updates: DocumentUpdate<Item> | undefined
      // Drop on the source card itself with no movement: skip rank update entirely.
      const droppedOnSelf = object._id === this.board.dragCard._id && this.board.dragCardTargetIndex === undefined
      const stateChanged = this.board.dragCardInitialState !== state
      // Always pick up state-mapped fields (status, space) when the column or
      // anything else changed — even if rank can't be derived (empty cell).
      if (stateChanged || !droppedOnSelf) {
        const stateUpdates = this.board.getUpdateProps(this.board.dragCard, state)
        if (stateUpdates !== undefined) updates = stateUpdates
      }
      if (!this.board.dontUpdateRank && !droppedOnSelf) {
        let prevRank: Rank | undefined
        let nextRank: Rank | undefined
        if (this.board.swimLaneMode && swimLane !== undefined) {
          const visible = this.getSwimLaneCategoryValues(
            swimLane,
            state,
            this.board.groupByDocs,
            this.board.dragCard,
            swimLane,
            state,
            this.board.dragCardTargetIndex
          )
          if (visible.some((p) => p._id === this.board.dragCard?._id)) {
            ;[prevRank, nextRank] = neighbourRanks(visible, this.board.dragCard._id, undefined)
          }
        } else {
          ;[prevRank, nextRank] = neighbourRanks(
            this.board.getGroupByValues(this.board.groupByDocs, state) ?? [],
            this.board.dragCard._id,
            this.board.dragCardTargetIndex
          )
        }
        if (prevRank !== undefined || nextRank !== undefined) {
          const newRank = makeRank(prevRank, nextRank)
          updates = { ...(updates ?? {}), rank: newRank }
        }
      }
      let swimUpdates: DocumentUpdate<Item> | undefined
      if (
        this.board.swimLaneMode &&
        swimLane !== undefined &&
        this.board.getSwimLaneUpdateProps !== undefined &&
        this.board.dragCardInitialSwimLane?._id !== swimLane._id
      ) {
        swimUpdates = this.board.getSwimLaneUpdateProps(this.board.dragCard, swimLane)
      }
      // Register optimistic overlay BEFORE awaiting server — so the live-query
      // snapshot doesn't snap the card back to its old position while the update
      // is in flight.
      const overlay: Record<string, unknown> = { ...(updates ?? {}), ...(swimUpdates ?? {}) }
      if (Object.keys(overlay).length > 0) {
        this.board.onMoveCommit?.(this.board.dragCard._id, overlay)
        this.dragCardToRestore = undefined
      }
      // Restore focus on the just-moved card so keyboard navigation continues
      // from there, mirroring the mouse-hover focus path.
      this.board.dispatch('obj-focus', { ...this.board.dragCard, ...overlay })
      // The drag can end while an update is pending, and that clears dragCard.
      const movedCard = this.board.dragCard
      try {
        if (updates !== undefined && Object.keys(updates).length > 0) {
          await this.board.client.diffUpdate(movedCard, updates)
        }
        if (swimUpdates !== undefined && Object.keys(swimUpdates).length > 0) {
          await this.board.client.update(movedCard, swimUpdates)
        }
      } catch (err) {
        this.board.onMoveRollback?.(movedCard._id)
      }
    }
    if (version === this.dragVersion) this.onDragEnd()
  }

  onDragStart = async (object: Item, state: CategoryType, swimLane?: SwimLane): Promise<void> => {
    const version = (this.dragVersion = this.dragVersion + 1)
    if (this.dragEndTimer !== undefined) clearTimeout(this.dragEndTimer)
    this.dragEndTimer = undefined
    window.addEventListener('drop', this.endAfterDrop, true)
    window.addEventListener('dragend', this.endAfterDrop, true)
    this.dragSource?.removeEventListener('dragend', this.endAfterDrop, true)
    this.dragSource = this.board.scrollerEl?.querySelector<HTMLElement>(`[data-card-id="${object._id}"]`) ?? undefined
    // A detached source still receives its own native dragend when no window listener can see it.
    this.dragSource?.addEventListener('dragend', this.endAfterDrop, true)
    const rect = this.dragSource?.getBoundingClientRect()
    this.dragOriginScrolls = captureDragOriginScrolls(this.dragSource, this.board.scrollerEl)
    this.dragCardInitialRect = rect !== undefined && rect.width > 0 && rect.height > 0 ? rect : undefined
    this.dragOriginShifted = false
    this.set('atInitialPlace', this.dragCardInitialRect !== undefined)
    this.set('dragCardInitialState', state)
    this.dragCardInitialIndex = (this.board.getGroupByValues(this.board.groupByDocs, state) ?? []).findIndex(
      (p) => p._id === object._id
    )
    this.set('dragCardState', state)
    this.dragCardInitialRank = object.rank
    this.set('dragCardInitialSwimLane', swimLane)
    this.set('dragCardCurrentSwimLane', swimLane)
    this.set('dragCard', object)
    this.dragCardToRestore = this.board.swimLaneMode ? undefined : object
    this.set('dragMoved', false)
    this.set('dragOverCollapsed', undefined)
    this.set('dragOverDropTarget', undefined)
    this.set('isDragging', true)
    this.set('dragCardTargetIndex', undefined)
    try {
      const available = await this.board.getAvailableCategories?.(object)
      if (this.board.isDragging && version === this.dragVersion) this.set('dragCardAvailableCategories', available)
    } catch (error) {
      if (version === this.dragVersion) this.onDragEnd()
    }
  }

  onDragEnd = (): void => {
    this.dragVersion = this.dragVersion + 1
    if (this.dragEndTimer !== undefined) clearTimeout(this.dragEndTimer)
    this.dragEndTimer = undefined
    const card = this.dragCardToRestore
    this.dragCardToRestore = undefined
    if (card !== undefined) {
      const own = this.board.getGroupByValues(this.board.groupByDocs, this.board.dragCardInitialState) ?? []
      if (own[this.dragCardInitialIndex]?._id !== card._id) this.putBack(card)
    }
    this.set('isDragging', false)
    this.set('dragCard', undefined)
    this.set('dragCardAvailableCategories', undefined)
    this.set('dragOverDropTarget', undefined)
    this.dragCardInitialRect = undefined
    this.dragOriginShifted = false
    this.set('atInitialPlace', false)
    this.stopAutoScroll()
    window.removeEventListener('mousemove', this.onDragEnd, true)
    window.removeEventListener('drop', this.endAfterDrop, true)
    window.removeEventListener('dragend', this.endAfterDrop, true)
    this.dragSource?.removeEventListener('dragend', this.endAfterDrop, true)
    this.dragSource = undefined
    this.dragOriginScrolls = []
  }

  private readonly scrollInto = (statePos: number, obj: Item, lane?: SwimLane): void => {
    if (this.board.swimLaneMode && lane !== undefined) {
      this.board.swimRowBindings[swimCellKey(lane._id, statePos)]?.scroll(obj)
      return
    }
    this.board.stateRefs[statePos]?.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    this.board.stateRows[statePos]?.scroll(obj)
  }

  private readonly getState = (doc: Item): number => {
    let pos = 0
    for (const st of this.board.categories) {
      const stateObjs = this.board.membersOf.has(stateKey(st))
        ? this.columnValues(this.board.groupByDocs, st, this.board.membersOf)
        : []
      if (stateObjs.findIndex((it) => it._id === doc._id) !== -1) {
        return pos
      }
      pos++
    }
    return -1
  }

  private readonly findSwimLaneOfDoc = (doc: Doc): SwimLane | undefined => {
    if (!this.board.swimLaneMode || this.board.getSwimLaneOfDoc === undefined) return undefined
    const id = this.board.getSwimLaneOfDoc(doc)
    if (id === undefined) return undefined
    return this.board.swimLanes.find((s) => s._id === id)
  }

  private readonly visibleSwimLanes = (): SwimLane[] => {
    return this.board.shownSwimLanes.filter((s) => !this.board.collapsed.has(s._id))
  }

  private readonly getCellObjects = (st: CategoryType, lane?: SwimLane): Item[] => {
    if (columnPlace(st, this.board.collapsedColumns, this.board.membersOf) !== 'open') return []
    if (this.board.swimLaneMode && lane !== undefined) {
      return this.getSwimLaneCategoryValues(
        lane,
        st,
        this.board.groupByDocs,
        this.board.dragCard,
        this.board.dragCardCurrentSwimLane,
        this.board.dragCardState,
        this.board.dragCardTargetIndex
      )
    }
    return this.columnValues(this.board.groupByDocs, st, this.board.membersOf)
  }

  select = (offset: 1 | -1 | 0, of?: Doc, dir?: 'vertical' | 'horizontal'): void => {
    let pos = (of != null ? this.board.objects.findIndex((it) => it._id === of._id) : this.board.selection) ?? -1
    if (pos === -1) {
      const lanes = this.board.swimLaneMode ? this.visibleSwimLanes() : [undefined as SwimLane | undefined]
      for (const lane of lanes) {
        let found = false
        for (const st of this.board.categories) {
          const stateObjs = this.getCellObjects(st, lane)
          if (stateObjs.length > 0) {
            pos = this.board.objects.findIndex((it) => it._id === stateObjs[0]._id)
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
    if (pos >= this.board.objects.length) {
      pos = this.board.objects.length - 1
    }

    const obj = this.board.objects[pos]
    if (obj === undefined) {
      return
    }

    let objState = this.getState(obj)
    if (objState === -1) {
      return
    }

    const currentLane: SwimLane | undefined = this.board.swimLaneMode ? this.findSwimLaneOfDoc(obj) : undefined
    const stateObjs = this.getCellObjects(this.board.categories[objState], currentLane)
    const statePos = stateObjs.findIndex((it) => it._id === obj._id)
    if (statePos === undefined) {
      return
    }

    const lanes = this.board.swimLaneMode ? this.visibleSwimLanes() : []
    const laneIdx = currentLane !== undefined ? lanes.findIndex((l) => l._id === currentLane?._id) : -1

    if (offset === -1) {
      if (dir === undefined || dir === 'vertical') {
        if (statePos > 0) {
          const next = stateObjs[statePos - 1]
          this.scrollInto(objState, next, currentLane)
          this.board.dispatch('obj-focus', next)
          return
        }
        // cross lanes upward in same column
        if (this.board.swimLaneMode && laneIdx > 0) {
          for (let i = laneIdx - 1; i >= 0; i--) {
            const arr = this.getCellObjects(this.board.categories[objState], lanes[i])
            if (arr.length > 0) {
              const next = arr[arr.length - 1]
              this.scrollInto(objState, next, lanes[i])
              this.board.dispatch('obj-focus', next)
              return
            }
          }
        }
        const next = stateObjs[0]
        if (next !== undefined) {
          this.scrollInto(objState, next, currentLane)
          this.board.dispatch('obj-focus', next)
        }
        return
      } else {
        while (objState > 0) {
          objState--
          const nstateObjs = this.getCellObjects(this.board.categories[objState], currentLane)
          if (nstateObjs.length > 0) {
            const next = nstateObjs[statePos] ?? nstateObjs[nstateObjs.length - 1]
            this.scrollInto(objState, next, currentLane)
            this.board.dispatch('obj-focus', next)
            break
          }
        }
      }
    }
    if (offset === 1) {
      if (dir === undefined || dir === 'vertical') {
        if (statePos < stateObjs.length - 1) {
          const next = stateObjs[statePos + 1]
          this.scrollInto(objState, next, currentLane)
          this.board.dispatch('obj-focus', next)
          return
        }
        if (this.board.swimLaneMode && laneIdx !== -1 && laneIdx < lanes.length - 1) {
          for (let i = laneIdx + 1; i < lanes.length; i++) {
            const arr = this.getCellObjects(this.board.categories[objState], lanes[i])
            if (arr.length > 0) {
              const next = arr[0]
              this.scrollInto(objState, next, lanes[i])
              this.board.dispatch('obj-focus', next)
              return
            }
          }
        }
        const next = stateObjs[stateObjs.length - 1]
        if (next !== undefined) {
          this.scrollInto(objState, next, currentLane)
          this.board.dispatch('obj-focus', next)
        }
        return
      } else {
        while (objState < this.board.categories.length - 1) {
          objState++
          const nstateObjs = this.getCellObjects(this.board.categories[objState], currentLane)
          if (nstateObjs.length > 0) {
            const next = nstateObjs[statePos] ?? nstateObjs[nstateObjs.length - 1]
            this.scrollInto(objState, next, currentLane)
            this.board.dispatch('obj-focus', next)
            break
          }
        }
      }
    }
    if (offset === 0) {
      this.board.dispatch('obj-focus', obj)
    }
  }

  check = (docs: Doc[], value: boolean): void => {
    this.board.dispatch('check', { docs, value })
  }

  destroy = (): void => {
    this.stopAutoScroll()
    window.removeEventListener('mousemove', this.onDragEnd, true)
    window.removeEventListener('drop', this.endAfterDrop, true)
    window.removeEventListener('dragend', this.endAfterDrop, true)
    this.dragSource?.removeEventListener('dragend', this.endAfterDrop, true)
    this.dragSource = undefined
    this.dragOriginScrolls = []
    if (this.dragEndTimer !== undefined) clearTimeout(this.dragEndTimer)
    this.dragEndTimer = undefined
    this.dragVersion++
  }

  setLaneKey = (key: string | undefined): void => {
    if (this.previousLaneKey === key) return
    this.previousLaneKey = key
    this.set('seenLanes', new Set())
  }

  loadLanes = (key: string | undefined): void => {
    this.set('collapsed', loadCollapsed(key))
  }

  loadColumns = (key: string | undefined): void => {
    this.set('collapsedColumns', loadCollapsed(key, 'column'))
    this.set('mergeGroups', loadMerged(key))
  }

  updateInputs = (inputs: KanbanInputs): void => {
    const signature = JSON.stringify(
      inputs.categories.map((state) => [stateKey(state), inputs.getCategoryGroup?.(state)])
    )
    const columnsChanged =
      this.previousCategories.length !== inputs.categories.length ||
      this.previousCategories.some((state, index) => state !== inputs.categories[index]) ||
      signature !== this.previousColumnSignature ||
      inputs.fitColumns !== this.board.fitColumns
    Object.assign(this.board, inputs)
    if (!columnsChanged) return
    this.previousCategories = inputs.categories.slice()
    this.previousColumnSignature = signature
    this.refreshColumns()
  }

  hoverCollapsed = (state?: CategoryType): void => {
    this.set('dragOverCollapsed', state === undefined ? undefined : stateKey(state))
  }

  showMenu = async (evt: MouseEvent, object: Item): Promise<void> => {
    this.set(
      'selection',
      this.board.objects.findIndex((p) => p._id === object._id)
    )
    if (!this.board.checkedSet.has(object._id)) {
      this.check(this.board.objects, false)
      this.set('checked', [])
    }
    this.board.dispatch('contextmenu', { evt, objects: this.board.checked.length > 0 ? this.board.checked : object })
  }
}
