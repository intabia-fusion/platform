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
    Lookup,
    Ref,
    Status,
    StatusCategory,
    WithLookup
  } from '@hcengineering/core'
  import core, { generateId, getObjectValue, groupByArray, mergeQueries } from '@hcengineering/core'
  import type { Item, SwimLane, DropTarget } from '@hcengineering/kanban'
  import { Kanban as KanbanUI } from '@hcengineering/kanban'
  import { employeeByIdStore } from '@hcengineering/contact-resources'
  import type { Employee } from '@hcengineering/contact'
  import { getName } from '@hcengineering/contact'
  import type { IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import { ActionContext, createQuery, getClient, reduceCalls } from '@hcengineering/presentation'
  import type { DocWithRank, TaskType, Project as TaskProject } from '@hcengineering/task'
  import task, { getStates } from '@hcengineering/task'
  import {
    getTaskKanbanResultQuery,
    StatusCategoryIcon,
    taskTypeStore,
    typeStore,
    updateTaskKanbanCategories
  } from '@hcengineering/task-resources'
  import type { Board, BoardColumn, Issue, Project } from '@hcengineering/tracker'
  import {
    IssuePriority,
    IssuesGrouping,
    IssuesOrdering,
    columnCategory,
    columnDropTargets,
    columnStatusFor,
    isOverLimit,
    pickSwimlane,
    resolveCardDensity,
    type CardDensity,
    type CardField
  } from '@hcengineering/tracker'
  import type { BlankViewProps, ColorDefinition, SelectPopupValueType } from '@hcengineering/ui'
  import ui, {
    Button,
    defaultBackground,
    getPlatformAvatarColorForTextDef,
    getPlatformColorDef,
    SelectPopup,
    eventToHTMLElement,
    Label,
    BlankView,
    Loading,
    showPopup,
    themeStore,
    Icon,
    tooltip
  } from '@hcengineering/ui'
  import type { AttributeModel, BuildModelKey, Viewlet, ViewOptionModel, ViewOptions } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import type { SelectDirection } from '@hcengineering/view-resources'
  import {
    buildModel,
    enabledConfig,
    focusStore,
    getCategoryQueryNoLookup,
    getCategoryQueryNoLookupOptions,
    getCategoryQueryProjection,
    getGroupByValues,
    getPresenter,
    groupBy,
    ListSelectionProvider,
    noCategory,
    provideCategoryValues,
    provideStatusIconScope,
    setGroupByValues,
    showMenu,
    statusStore
  } from '@hcengineering/view-resources'
  import type { ProjectWorkflow, Workflow, WorkflowTransition } from '@hcengineering/workflow'
  import workflow from '@hcengineering/workflow'
  import { getContext, onDestroy, onMount } from 'svelte'
  import { writable, type Readable } from 'svelte/store'

  import tracker from '../../plugin'
  import { boardContextKey, ConditionMatches } from '../../boards'
  import { componentStore } from '../../component'
  import { activeProjects, IssuePriorityColor, sortSwimLaneValues } from '../../utils'
  import {
    buildSwimLanes,
    normalizeSwimValue,
    sortSwimLanes,
    swimLaneUpdateProps,
    UNASSIGNED_SWIM
  } from '../../swimLanes'
  import CreateIssue from '../CreateIssue.svelte'
  import IssueKanbanCard from './IssueKanbanCard.svelte'
  import IssueStatusIcon from './IssueStatusIcon.svelte'
  import BoardColumnStatuses from '../boards/BoardColumnStatuses.svelte'
  import BoardConditionHint from '../boards/BoardConditionHint.svelte'

  const _class = tracker.class.Issue
  export let space: Ref<Project> | undefined = undefined
  export let baseMenuClass: Ref<Class<Doc>> | undefined = undefined
  export let query: DocumentQuery<Issue> = {}
  export let viewOptionsConfig: ViewOptionModel[] | undefined = undefined
  export let viewOptions: ViewOptions
  export let viewlet: Viewlet
  export let config: (string | BuildModelKey)[]
  export let options: FindOptions<DocWithRank> | undefined = undefined
  export let emptyState: BlankViewProps | undefined = undefined

  // Set by a board page: the board's columns replace the grouping by status
  const boardStore: Readable<Board | undefined> = getContext(boardContextKey) ?? writable(undefined)
  $: board = $boardStore

  $: requestedGroupByKey = (
    board !== undefined ? IssuesGrouping.Status : (viewOptions.groupBy[0] ?? noCategory)
  ) as IssuesGrouping
  // Set together with categories: columns of the old grouping under a new key query {space: 0}.
  let groupByKey = (viewOptions.groupBy[0] ?? noCategory) as IssuesGrouping
  // A board sorts its cards itself ("Card order" of its settings), the first order of the viewlet by default
  $: orderBy = board !== undefined ? (board.orderBy ?? viewlet.viewOptions?.orderBy[0]) : viewOptions.orderBy
  $: density = resolveCardDensity(viewOptions.density, board?.density, viewOptions.compactMode === true)
  // Paddings of the grid shrink with the cards; 'detailed' keeps the defaults of the kanban
  const densityGrid: Record<CardDensity, { inset: string, padding: string, headerGap: string } | undefined> = {
    detailed: undefined,
    normal: { inset: '0.75rem', padding: '1.25rem', headerGap: '0.875rem' },
    compact: { inset: '0.5rem', padding: '1rem', headerGap: '0.75rem' },
    dense: { inset: '0.375rem', padding: '0.75rem', headerGap: '0.5rem' }
  }
  $: grid = densityGrid[density]
  // Fields a board picked win over the view config; the parent has no config key and shows unless the board hides it
  $: cardFieldShown = (field: CardField): boolean =>
    board?.cardFields !== undefined
      ? board.cardFields.includes(field)
      : field === 'parent' || enabledConfig(config, field)

  let customAttrModels: AttributeModel[] = []
  const buildCustomAttrModels = reduceCalls(async function (cfg: (string | BuildModelKey)[]): Promise<void> {
    const customKeys = cfg.filter((c): c is BuildModelKey => typeof c !== 'string' && c.displayProps?.custom === true)
    if (customKeys.length === 0) {
      customAttrModels = []
      return
    }
    const groups = groupByArray(customKeys, (k) => k.displayProps?._class ?? _class)
    const models = (
      await Promise.all(
        Array.from(groups.entries()).map(([targetClass, keys]) =>
          buildModel({ client, _class: targetClass, keys, ignoreMissing: true, lookup })
        )
      )
    ).flat()
    customAttrModels = models
  })
  $: void buildCustomAttrModels(config)

  let accentColors = new Map<string, ColorDefinition>()
  const setAccentColor = (n: number, ev: CustomEvent<ColorDefinition>) => {
    accentColors.set(`${n}${$themeStore.dark}${groupByKey}`, ev.detail)
    accentColors = accentColors
  }

  $: dontUpdateRank = orderBy ? orderBy[0] !== IssuesOrdering.Manual : false

  $: currentSpace = space ?? board?.projects[0] ?? tracker.project.DefaultProject
  let currentProject: Project | undefined
  $: currentProject = $activeProjects.get(currentSpace)

  let resultQuery: DocumentQuery<any> = { ...query }
  const client = getClient()

  $: void getTaskKanbanResultQuery(client.getHierarchy(), query, viewOptionsConfig, viewOptions).then((p) => {
    resultQuery = mergeQueries(p, query)
  })

  $: queryNoLookup = getCategoryQueryNoLookup(resultQuery)

  function toIssue (object: any): WithLookup<Issue> {
    return object as WithLookup<Issue>
  }

  // Status a landing spot names, for its icon and label.
  function dropTargetStatus (target: DropTarget): Status | undefined {
    return $statusStore.byId.get(target.id as Ref<Status>)
  }

  const lookup: Lookup<Issue> = {
    ...(options?.lookup ?? {}),
    attachedTo: tracker.class.Issue,
    _id: {
      subIssues: tracker.class.Issue
    }
  }

  $: resultOptions = { ...options, lookup, ...(orderBy !== undefined ? { sort: { [orderBy[0]]: orderBy[1] } } : {}) }

  let kanbanUI: KanbanUI
  const listProvider = new ListSelectionProvider((offset: 1 | -1 | 0, of?: Doc, dir?: SelectDirection) => {
    kanbanUI?.select(offset, of, dir)
  })
  const selection = listProvider.selection

  onMount(() => {
    ;(document.activeElement as HTMLElement)?.blur()
  })

  // Category information only
  let tasks: DocWithRank[] = []

  // Optimistic overlay: pending field updates per doc id, applied to tasks on every rebuild
  // until live-query snapshots catch up to the target values.
  let pendingMoves = new Map<string, Record<string, unknown>>()

  function applyPendingMoves (docs: DocWithRank[]): DocWithRank[] {
    if (pendingMoves.size === 0) return docs
    let needsResort = false
    const result = docs.map((d) => {
      const overlay = pendingMoves.get(d._id)
      if (overlay === undefined) return d
      // Check if snapshot already matches all overlay fields — if so, drop the entry.
      let matches = true
      for (const k of Object.keys(overlay)) {
        if ((d as any)[k] !== overlay[k]) {
          matches = false
          break
        }
      }
      if (matches) {
        // Silently drop matched overlay — do NOT trigger a follow-up reactive
        // tick by reassigning pendingMoves. The snapshot already carries the
        // target values, so the next render is identical with or without the
        // entry. Reassigning here causes a visible re-render flash because
        // groupByDocs rebuilds twice in quick succession (once with overlay,
        // once without) before the DOM stabilizes.
        pendingMoves.delete(d._id)
        return d
      }
      if ('rank' in overlay) needsResort = true
      return { ...d, ...overlay } satisfies DocWithRank
    })
    if (needsResort && orderBy !== undefined) {
      const [field, dir] = orderBy
      result.sort((a, b) => {
        const av = (a as any)[field]
        const bv = (b as any)[field]
        if (av === bv) return 0
        return (av < bv ? -1 : 1) * dir
      })
    }
    return result
  }

  function registerPendingMove (id: string, fields: Record<string, unknown>): void {
    pendingMoves.set(id, { ...(pendingMoves.get(id) ?? {}), ...fields })
    pendingMoves = pendingMoves
  }

  function clearPendingMove (id: string): void {
    if (pendingMoves.has(id)) {
      pendingMoves.delete(id)
      pendingMoves = pendingMoves
    }
  }

  $: effectiveTasks = pendingMoves.size > 0 ? applyPendingMoves(tasks) : tasks

  // Memoize groupByDocs by a cheap content hash so that downstream Kanban
  // re-renders only when the partitioning actually changes. Without this,
  // every batched live-query snapshot — even one that doesn't affect this
  // view's grouping — triggers a full Kanban prop change and KanbanRow
  // re-mounts. We hash via a 32-bit FNV-style accumulator over keys+ids;
  // collision probability is negligible relative to user-visible reorderings.
  let groupByDocs: Record<string | number, DocWithRank[]> = {}
  let lastGroupHash = 0
  $: {
    const next = groupBy(effectiveTasks, groupByKey, categories)
    const keys = Object.keys(next).sort()
    let hash = 2166136261 >>> 0
    const mix = (s: string): void => {
      for (let i = 0; i < s.length; i++) {
        hash = Math.imul(hash ^ s.charCodeAt(i), 16777619) >>> 0
      }
    }
    // Mix swimLaneBy so that toggling swim lane (which changes per-doc projection
    // fields like `priority`) busts the memo and forces a fresh groupByDocs even
    // if ids/lengths inside categories did not change.
    mix(swimLaneBy)
    // Mix the swim-lane value of the first doc of each category so a projection
    // refresh that adds the swim field to existing docs invalidates the memo.
    for (const k of keys) {
      mix(k)
      const arr = (next as any)[k] ?? []
      hash = Math.imul(hash ^ arr.length, 16777619) >>> 0
      for (const item of arr) mix(item._id)
      if (swimLaneBy !== 'none' && swimLaneBy !== '' && arr.length > 0) {
        const v = arr[0][swimLaneBy]
        mix(String(v))
      }
    }
    if (hash !== lastGroupHash) {
      lastGroupHash = hash
      groupByDocs = next
    }
  }

  let fastDocs: DocWithRank[] = []
  let slowDocs: DocWithRank[] = []

  const docsQuery = createQuery()
  const docsQuerySlow = createQuery()

  let fastQueryIds = new Set<Ref<DocWithRank>>()

  // A board has no lanes option in the view options: only the board sets its lanes
  $: swimLaneBy = board !== undefined ? (board.swimLaneBy ?? 'none') : ((viewOptions.swimLaneBy as string) ?? 'none')

  let categoryQueryOptions: Partial<FindOptions<DocWithRank>>
  $: categoryQueryOptions = {
    ...getCategoryQueryNoLookupOptions(resultOptions),
    projection: {
      ...resultOptions.projection,
      _id: 1,
      _class: 1,
      rank: 1,
      ...getCategoryQueryProjection(
        client.getHierarchy(),
        _class,
        queryNoLookup,
        board !== undefined ? [IssuesGrouping.Status] : viewOptions.groupBy
      ),
      ...(swimLaneBy !== 'none' && swimLaneBy !== '' ? { [swimLaneBy]: 1 } : {})
    }
  }

  $: docsQuery.query(
    _class,
    queryNoLookup,
    (res) => {
      fastDocs = res
      fastQueryIds = new Set(res.map((it) => it._id))
      docsLoaded = true
    },
    { ...categoryQueryOptions, limit: 1000 }
  )
  let docsLoaded = false
  $: docsQuerySlow.query(
    _class,
    queryNoLookup,
    (res) => {
      slowDocs = res
    },
    categoryQueryOptions
  )

  $: tasks = [...fastDocs, ...slowDocs.filter((it) => !fastQueryIds.has(it._id))]

  $: listProvider.update(tasks)

  let categories: CategoryType[] = []
  const categoryValues = provideCategoryValues()
  $: categoryValues.set(categories)
  const statusIconScope = provideStatusIconScope()
  $: statusIconScope.set(resultQuery)
  let loadCategories = true

  const queryId = generateId()

  let headerComponent: AttributeModel | undefined

  function statusCategory (state: CategoryType): string | undefined {
    return $statusStore.byId.get(state as Ref<Status>)?.category
  }

  // A merged header lists the first statuses; the chevron shows the rest.
  const MERGED_NAMES = 2
  let expandedHeaders = new Set<string>()

  function toggleHeaderNames (key: string): void {
    if (!expandedHeaders.delete(key)) expandedHeaders.add(key)
    expandedHeaders = new Set(expandedHeaders)
  }

  // Merging columns is a view setting of the board: a click adds a column or takes it out.
  function showMergePopup (
    ev: MouseEvent,
    state: CategoryType,
    members: CategoryType[],
    merge: (other: CategoryType) => void
  ): void {
    const presenter = headerComponent?.presenter
    if (presenter === undefined) return
    const others = categories.filter((c) => c !== state)
    const selected = new Set(members)
    const items = (): SelectPopupValueType[] =>
      others.map((c, i) => ({
        id: i,
        component: presenter,
        props: { value: c, space, size: 'small', kind: 'list-header', display: 'kanban' },
        isSelected: selected.has(c)
      }))
    // onSelect keeps the popup open, so several columns are picked in one go.
    const popup = showPopup(
      SelectPopup,
      {
        value: items(),
        onSelect: (id: SelectPopupValueType['id']) => {
          if (typeof id !== 'number') return
          const other = others[id]
          if (!selected.delete(other)) selected.add(other)
          merge(other)
          popup.update({ value: items() })
        }
      },
      eventToHTMLElement(ev)
    )
  }

  // Columns of a board are rebuilt only when their statuses change: new categories rerender the board.
  let boardColumnsKey = ''
  $: if (board !== undefined) {
    const key = JSON.stringify(board.columns.map((c) => [c.id, c.statuses]))
    if (key !== boardColumnsKey) {
      boardColumnsKey = key
      groupByKey = IssuesGrouping.Status
      headerComponent = undefined
      categories = board.columns.map(columnCategory)
      loadCategories = false
    }
  }

  function boardColumn (state: CategoryType): BoardColumn | undefined {
    return typeof state === 'object' ? board?.columns.find((c) => c.id === state.name) : undefined
  }

  const updateCategories = reduceCalls(async function (
    key: IssuesGrouping,
    space: Ref<Project> | undefined,
    tasks: DocWithRank[],
    viewOptions: ViewOptions,
    viewOptionsConfig: ViewOptionModel[] | undefined
  ): Promise<void> {
    if (board !== undefined) return
    const res = await updateTaskKanbanCategories(
      client,
      viewlet,
      _class,
      space,
      tasks,
      key,
      viewOptions,
      viewOptionsConfig,
      update,
      queryId
    )
    // A missing presenter costs only the header, not the grouping.
    const header =
      key === noCategory ? undefined : await getPresenter(client, _class, { key }, { key }).catch(() => undefined)
    // The grouping changed while loading: the next call applies the new one.
    if (key !== requestedGroupByKey) return
    groupByKey = key
    headerComponent = header
    categories = res
    loadCategories = false
  })

  function update (): void {
    void updateCategories(requestedGroupByKey, space, tasks, viewOptions, viewOptionsConfig)
  }

  $: void updateCategories(requestedGroupByKey, space, tasks, viewOptions, viewOptionsConfig)

  const fullFilled: Record<string, boolean> = {}

  // Statuses each dragged issue may take, by the workflow: a board column picks one of them on a drop
  const allowedByDoc = new Map<Ref<Doc>, Ref<Status>[] | undefined>()

  // Landing spots per board column for the dragged issue, so the kanban reveals a spot per status.
  // Computed eagerly on drag start; the kanban only shows them while a card is held over a column.
  let dropTargets = new Map<string, DropTarget[]>()

  function buildDropTargets (board: Board, doc: Doc, allowed: Ref<Status>[] | undefined): Map<string, DropTarget[]> {
    const result = new Map<string, DropTarget[]>()
    const issue = toIssue(doc)
    for (const column of board.columns) {
      const statuses = columnDropTargets(column, issue.status, allowed)
      if (statuses.length > 1) {
        result.set(
          column.id,
          statuses.map((s) => ({ id: s }))
        )
      }
    }
    return result
  }

  const getUpdateProps = (
    doc: Doc,
    category: CategoryType,
    dropTargetId?: string
  ): DocumentUpdate<Item> | undefined => {
    if (board !== undefined) {
      const column = boardColumn(category)
      if (column === undefined) return undefined
      const current = toIssue(doc).status
      const allowed = allowedByDoc.get(doc._id)
      // A landing spot names the exact status; otherwise the first status the column allows.
      const status =
        dropTargetId !== undefined
          ? columnDropTargets(column, current, allowed).includes(dropTargetId as Ref<Status>)
            ? (dropTargetId as Ref<Status>)
            : undefined
          : columnStatusFor(column, current, allowed)
      return status === undefined ? undefined : { [groupByKey]: status, space: doc.space }
    }
    const groupValue =
      typeof category === 'object' ? category.values.find((it) => it.space === doc.space)?._id : category
    if (groupValue === undefined) {
      return undefined
    }
    return {
      [groupByKey]: groupValue,
      space: doc.space
    }
  }

  // Conditions of the board lanes and card colors: ids of the issues that fit each, from live queries.
  let matchesVersion = 0
  const laneMatches = new ConditionMatches(() => {
    matchesVersion++
  })
  const colorMatches = new ConditionMatches(() => {
    matchesVersion++
  })
  onDestroy(() => {
    laneMatches.destroy()
    colorMatches.destroy()
  })
  $: boardScope = board !== undefined ? { space: { $in: board.projects } } : {}
  // The last lane takes the rest and has no condition of its own
  $: void laneMatches.sync(
    client,
    (board?.swimlanes ?? []).slice(0, -1).map((l) => ({ id: l.id, condition: l.condition })),
    boardScope
  )
  $: void colorMatches.sync(
    client,
    (board?.colorRules ?? []).map((r) => ({ id: r.id, condition: r.condition })),
    boardScope
  )
  $: boardLanes = board !== undefined && swimLaneBy === 'none' && board.swimlanes.length > 0
  $: if (boardLanes && board !== undefined) {
    void matchesVersion
    swimLanesBy = 'board'
    swimLanePresenter = undefined
    swimLanes = laneMatches.ready ? board.swimlanes.map((l) => ({ _id: l.id, title: l.title, value: l.id })) : []
  }

  function cardAccent (doc: Doc, _version: number, dark: boolean): ColorDefinition | undefined {
    const rule = board?.colorRules.find((r) => colorMatches.has(r.id, doc._id))
    return rule !== undefined ? getPlatformColorDef(rule.color, dark) : undefined
  }

  // Status counts of the column: shown on hover over its title
  // The statuses of a board column open by a click: a hover popup got in the way of the cards
  function openColumnStatuses (e: MouseEvent, column: BoardColumn | undefined): void {
    showPopup(BoardColumnStatuses, { statuses: columnStatuses(column, tasks) }, e.currentTarget as HTMLElement)
  }

  function columnStatuses (column: BoardColumn | undefined, docs: DocWithRank[]): { status: Status, count: number }[] {
    return (column?.statuses ?? []).flatMap((id) => {
      const status = $statusStore.byId.get(id)
      return status !== undefined
        ? [{ status, count: docs.filter((d) => (d as DocWithRank & { status?: Ref<Status> }).status === id).length }]
        : []
    })
  }

  // The color of a column is the color of its category: a column may have no statuses at all.
  let statusCategoryDocs = new Map<Ref<StatusCategory>, StatusCategory>()
  createQuery().query(core.class.StatusCategory, {}, (res) => {
    statusCategoryDocs = new Map(res.map((c) => [c._id, c]))
  })
  function columnColor (
    column: BoardColumn | undefined,
    dark: boolean,
    cats: typeof statusCategoryDocs
  ): ColorDefinition {
    const category = column !== undefined ? cats.get(column.category) : undefined
    return getPlatformColorDef(category?.color ?? 0, dark)
  }

  // The last lane takes the rest: it has no condition to show
  function laneCondition (laneId: string): string {
    return board?.swimlanes.slice(0, -1).find((l) => l.id === laneId)?.condition ?? ''
  }

  // SwimLane support (generic by attribute name).
  let swimLanes: SwimLane[] = []
  // The field the lanes were built for: old lanes under a new field query {attachedTo: 3} and a
  // drop on them writes it.
  let swimLanesBy = 'none'
  // Generic lane header presenter, set together with the lanes it renders.
  let swimLanePresenter: AttributeModel | undefined
  let emptyLabel = ''
  const EMPTY_LABEL_BY_FIELD: Record<string, IntlString> = {
    assignee: tracker.string.NoAssignee,
    component: tracker.string.NoComponent,
    milestone: tracker.string.NoMilestone,
    attachedTo: tracker.string.NoParent
  }
  $: {
    const intl = EMPTY_LABEL_BY_FIELD[swimLaneBy] ?? tracker.string.NoAssignee
    void translate(intl, {}, $themeStore.language).then((v) => {
      emptyLabel = v
    })
  }

  // A wrapper keeps the store and the label out of the reactive deps: their change does not re-sort the lanes.
  function buildGenericLanes (field: string, tasks: DocWithRank[]): SwimLane[] {
    return buildSwimLanes(field, tasks, $componentStore, emptyLabel)
  }

  // Order of the lanes without a sort function for the field: components by label, employees by name,
  // the rest by value id (stable, no lane jumps on task reorder).
  function laneFallbackKey (lane: SwimLane): string {
    if (swimLaneBy === 'assignee') {
      const emp = $employeeByIdStore.get(lane.value as Ref<Employee>)
      if (emp !== undefined) return getName(client.getHierarchy(), emp)
    }
    return lane.title !== '' ? lane.title : lane._id
  }

  // The empty lane stays first; the rest follow the field's sort function (statuses by category and task
  // type, priorities, milestones) and fall back to `laneFallbackKey`. The previous lanes stay on screen
  // until the new order is known, and only the latest request may apply.
  let laneOrderSeq = 0
  async function orderLanes (field: string, lanes: SwimLane[]): Promise<void> {
    const seq = ++laneOrderSeq
    const ordered = await sortSwimLanes(
      lanes,
      async (values) => await sortSwimLaneValues(client, _class, space, field, values, viewlet.descriptor),
      laneFallbackKey
    )
    const presenter =
      field === 'none' || field === ''
        ? undefined
        : await getPresenter(client, _class, { key: field }, { key: field }).catch(() => undefined)
    if (seq !== laneOrderSeq) return
    swimLanesBy = field
    swimLanePresenter = presenter
    swimLanes = ordered
  }

  $: if (!boardLanes) void orderLanes(swimLaneBy, buildGenericLanes(swimLaneBy, effectiveTasks))

  function getSwimLaneOfDoc (doc: Doc): string | undefined {
    if (swimLanesBy === 'board') {
      return pickSwimlane(board?.swimlanes.map((l) => ({ id: l.id })) ?? [], (l) => laneMatches.has(l.id, doc._id))?.id
    }
    if (swimLanesBy === 'none' || swimLanesBy === '') return undefined
    const raw = getObjectValue(swimLanesBy, doc)
    return normalizeSwimValue(swimLanesBy, raw, $componentStore).key
  }

  // Parent issues of the lanes are loaded by the board query, not by a header query per lane.
  function getSwimLaneDocId (swimLane: SwimLane): Ref<Doc> | undefined {
    return swimLanesBy === 'attachedTo' && swimLane._id !== UNASSIGNED_SWIM ? (swimLane.value as Ref<Doc>) : undefined
  }

  function getSwimLaneUpdateProps (doc: Doc, swimLane: SwimLane): DocumentUpdate<Item> | undefined {
    return swimLaneUpdateProps(swimLanesBy, doc, swimLane, $componentStore)
  }

  let swimLaneAccents = new Map<string, ColorDefinition>()
  function setSwimLaneAccent (id: string, ev: CustomEvent<ColorDefinition>): void {
    const prev = swimLaneAccents.get(id)
    if (prev?.name === ev.detail?.name && prev?.background === ev.detail?.background) return
    swimLaneAccents.set(id, ev.detail)
    swimLaneAccents = swimLaneAccents
  }

  $: showColors = (viewOptions as any).shouldShowColors !== false

  $: getSwimLaneHeaderStyle = (swimLane: SwimLane): { background?: string, color?: string } | undefined => {
    void swimLaneAccents
    if (!showColors) return undefined
    if (swimLanesBy === 'priority') {
      const color = getPlatformColorDef(
        IssuePriorityColor[(swimLane.value as IssuePriority) ?? IssuePriority.NoPriority],
        $themeStore.dark
      )
      return { background: color.background, color: color.title }
    }
    if (swimLanesBy === 'assignee') {
      const emp = $employeeByIdStore.get(swimLane._id as Ref<Employee>)
      if (emp != null) {
        const name = getName(client.getHierarchy(), emp)
        const color = getPlatformAvatarColorForTextDef(name, $themeStore.dark)
        return { background: color.background, color: color.title }
      }
    }
    const accent = swimLaneAccents.get(swimLane._id)
    if (accent !== undefined) {
      return { background: accent.background, color: accent.title }
    }
    return undefined
  }

  $: swimLaneStorageKey = boardLanes
    ? `board-${String(board?._id)}-lanes`
    : viewlet?._id != null
      ? `${String(viewlet._id)}-${swimLaneBy}`
      : undefined

  async function getWorkflowTransitions (
    spaceId: Ref<Project>,
    kind: Ref<TaskType>
  ): Promise<WorkflowTransition[] | null> {
    const space = await client.findOne(tracker.class.Project, { _id: spaceId })
    if (space == null) return null

    const hierarchy = client.getHierarchy()
    if (!hierarchy.hasMixin(space, workflow.mixin.ProjectWorkflow)) return null

    const projectWf = hierarchy.as<TaskProject, ProjectWorkflow>(space, workflow.mixin.ProjectWorkflow)
    const wfId = projectWf?.workflows?.[kind]
    if (wfId == null) return null

    const wfDoc = await client.findOne<Workflow>(
      workflow.class.Workflow,
      { _id: wfId },
      {
        lookup: {
          _id: { transitions: workflow.class.WorkflowTransition }
        }
      }
    )
    return (wfDoc?.$lookup?.transitions ?? []) as WorkflowTransition[]
  }

  // Statuses the issue may move to: its task type statuses narrowed by the workflow of the project.
  async function allowedStatuses (issue: Issue): Promise<Ref<Status>[] | undefined> {
    if (issue.kind != null) {
      const taskType =
        $taskTypeStore.get(issue.kind) ?? (await client.findOne(task.class.TaskType, { _id: issue.kind }))
      if (taskType?.statuses != null && taskType.statuses.length > 0) {
        if (issue.space != null) {
          const transitions = await getWorkflowTransitions(issue.space, issue.kind)
          if (transitions != null) {
            const allowed = new Set<string>()
            if (issue.status != null) {
              allowed.add(issue.status)
            }
            for (const t of transitions) {
              if (t.from == null || t.from.length === 0 || (issue.status != null && t.from.includes(issue.status))) {
                allowed.add(t.to)
              }
            }
            return taskType.statuses.filter((s) => allowed.has(s))
          }
        }
        return taskType.statuses
      }
    }

    if (issue.space != null) {
      const space = await client.findOne(tracker.class.Project, { _id: issue.space })
      if (space != null) {
        return getStates(space, $typeStore, $statusStore.byId).map(({ _id }) => _id)
      }
    }
    return undefined
  }

  const getAvailableCategories = async (doc: Doc): Promise<CategoryType[]> => {
    const issue = toIssue(doc)

    if (board !== undefined) {
      const currentBoard = board
      const allowed = await allowedStatuses(issue)
      allowedByDoc.set(doc._id, allowed)
      dropTargets = buildDropTargets(currentBoard, doc, allowed)
      return categories.filter((c) => {
        const statuses = boardColumn(c)?.statuses ?? []
        return statuses.includes(issue.status) || allowed === undefined || statuses.some((s) => allowed.includes(s))
      })
    }

    if ([IssuesGrouping.Component, IssuesGrouping.Milestone].includes(groupByKey)) {
      const availableCategories = []
      const clazz = client.getHierarchy().getAttribute(tracker.class.Issue, groupByKey)

      for (const category of categories) {
        if (!category || (issue as any)[groupByKey] === category) {
          availableCategories.push(category)
        } else if (clazz !== undefined && 'to' in clazz.type) {
          const categoryDoc = await client.findOne(clazz.type.to as Ref<Class<Doc>>, {
            _id: category as Ref<Doc>,
            space: issue.space
          })

          if (categoryDoc) {
            availableCategories.push(category)
          }
        }
      }

      return availableCategories
    }

    if (groupByKey === IssuesGrouping.Status) {
      const statuses = await allowedStatuses(issue)
      if (statuses !== undefined) return statuses
    }

    return categories
  }
</script>

{#if loadCategories}
  <Loading />
{:else if emptyState !== undefined && docsLoaded && categories.length === 0}
  <div class="flex-col-center flex-grow">
    <BlankView {...emptyState} />
  </div>
{:else}
  <ActionContext
    context={{
      mode: 'browser'
    }}
  />
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <KanbanUI
    bind:this={kanbanUI}
    limitScale={density === 'dense' ? 2 : 1}
    overLimit={board !== undefined ? (state, count) => isOverLimit(count, boardColumn(state)?.limit) : undefined}
    --kanban-column-inset={grid?.inset}
    --kanban-padding-top={grid?.padding}
    --kanban-padding-x={grid?.padding}
    --kanban-header-gap={grid?.headerGap}
    {categories}
    {dontUpdateRank}
    {orderBy}
    onMoveCommit={(id, fields) => {
      registerPendingMove(id, fields)
    }}
    onMoveRollback={(id) => {
      clearPendingMove(id)
    }}
    {_class}
    query={resultQuery}
    options={resultOptions}
    objects={tasks}
    getGroupByValues={(groupByDocs, category) =>
      groupByKey === noCategory ? tasks : getGroupByValues(groupByDocs, category)}
    {setGroupByValues}
    {getUpdateProps}
    {dropTargets}
    {groupByDocs}
    {groupByKey}
    on:obj-focus={(evt) => {
      listProvider.updateFocus(evt.detail)
    }}
    {getAvailableCategories}
    {swimLanes}
    swimLaneKey={swimLaneBy !== 'none' ? swimLaneBy : boardLanes ? 'board' : undefined}
    {getSwimLaneOfDoc}
    {getSwimLaneDocId}
    {getSwimLaneUpdateProps}
    {getSwimLaneHeaderStyle}
    getCategoryGroup={groupByKey === 'status' ? statusCategory : undefined}
    modern
    storageKey={swimLaneStorageKey}
    controlKey={board !== undefined ? `board-${board._id}` : viewlet?._id != null ? String(viewlet._id) : undefined}
    selection={listProvider.current($focusStore)}
    checked={$selection ?? []}
    on:check={(evt) => {
      listProvider.updateSelection(evt.detail.docs, evt.detail.value)
    }}
    on:contextmenu={(evt) => {
      showMenu(evt.detail.evt, { object: evt.detail.objects, baseMenuClass })
    }}
  >
    <svelte:fragment slot="swimLaneHeader" let:swimLane let:count let:collapsed let:laneDoc let:docsLoaded let:toggle>
      <div class="swimlane-header-inner">
        {#if swimLane._id === UNASSIGNED_SWIM || swimLanePresenter === undefined}
          <span class="swimlane-title">{swimLane.title || emptyLabel}</span>
        {:else if swimLanesBy === 'attachedTo' && laneDoc === undefined && !docsLoaded}
          <span class="swimlane-title" />
        {:else}
          <svelte:component
            this={swimLanePresenter.presenter}
            value={swimLane.value}
            object={laneDoc}
            kind="list-header"
            size="small"
            {space}
            accent
            colorInherit={!$themeStore.dark}
            on:accent-color={(ev) => {
              setSwimLaneAccent(swimLane._id, ev)
            }}
          />
        {/if}
        <span class="swimlane-count">{count}</span>
        {#if swimLanesBy === 'board'}
          <BoardConditionHint condition={laneCondition(swimLane._id)} />
        {/if}
      </div>
    </svelte:fragment>
    <svelte:fragment slot="header" let:state let:count let:index let:collapsed let:toggle let:members let:merge>
      {@const column = boardColumn(state)}
      {@const color =
        board !== undefined
          ? columnColor(column, $themeStore.dark, statusCategoryDocs)
          : accentColors.get(`${index}${$themeStore.dark}${groupByKey}`)}
      {@const headerBGColor = color?.background ?? defaultBackground($themeStore.dark)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        style:background={headerBGColor}
        class="header flex-between"
        class:merged={members.length > 1}
        class:collapsed
        use:tooltip={board !== undefined && !collapsed
          ? { label: tracker.string.ColumnStatusesHint, direction: 'top' }
          : undefined}
        on:click={(e) => {
          if (collapsed) toggle()
          else if (board !== undefined) openColumnStatuses(e, column)
        }}
      >
        <div class="flex-row-center gap-1 flex-grow clear-mins">
          <div class="names">
            <span
              class="clear-mins fs-bold"
              class:pointer-events-none={members.length === 1}
              class:overflow-label={members.length === 1}
              class:merged-names={members.length > 1}
              style:color={color?.title ?? 'var(--theme-caption-color)'}
            >
              {#if board !== undefined}
                <span class="column-title">
                  <StatusCategoryIcon
                    value={column !== undefined ? statusCategoryDocs.get(column.category) : undefined}
                    size="small"
                  />
                  <span class="overflow-label">{column?.title ?? ''}</span>
                </span>
              {:else if groupByKey === noCategory}
                <Label label={view.string.NoGrouping} />
              {:else if headerComponent}
                {#each expandedHeaders.has(String(state)) ? members : members.slice(0, MERGED_NAMES) as member, mi}
                  <div class="pointer-events-none">
                    <svelte:component
                      this={headerComponent.presenter}
                      value={member}
                      {space}
                      size="small"
                      kind="list-header"
                      display="kanban"
                      colorInherit={!$themeStore.dark}
                      accent
                      on:accent-color={(ev) => {
                        if (mi === 0) setAccentColor(index, ev)
                      }}
                    />
                  </div>
                {/each}
              {/if}
            </span>
            {#if members.length > MERGED_NAMES}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="more-members"
                class:expanded={expandedHeaders.has(String(state))}
                on:click|stopPropagation={() => {
                  toggleHeaderNames(String(state))
                }}
              >
                <Icon icon={ui.icon.ChevronDown} size="small" />
                {#if !expandedHeaders.has(String(state))}<span>+{members.length - MERGED_NAMES}</span>{/if}
              </div>
            {/if}
          </div>
          <span class="counter ml-1">
            {count}
          </span>
          {#if column?.limit !== undefined && column.limit > 0}
            <span class="limit ml-1" class:over={isOverLimit(count, column.limit)} data-id="kanban-wip-limit">
              / {column.limit}
            </span>
          {/if}
        </div>
        {#if !collapsed && board === undefined}
          <div class="tools flex-row-center flex-no-shrink gap-1">
            <Button
              icon={ui.icon.ChevronRight}
              kind="ghost"
              showTooltip={{ label: tracker.string.CollapseColumn, direction: 'left' }}
              on:click={toggle}
            />
            <Button
              icon={ui.icon.LayoutSplit}
              kind="ghost"
              showTooltip={{ label: tracker.string.MergeColumns, direction: 'left' }}
              on:click={(ev) => {
                showMergePopup(ev, state, members, merge)
              }}
            />
            <Button
              icon={ui.icon.Plus}
              kind="ghost"
              showTooltip={{ label: tracker.string.AddIssueTooltip, direction: 'left' }}
              on:click={() => {
                showPopup(CreateIssue, { space: currentSpace, [groupByKey]: state }, 'top')
              }}
            />
          </div>
        {/if}
      </div>
    </svelte:fragment>
    <svelte:fragment slot="card" let:object>
      {#key object._id}
        <IssueKanbanCard
          issue={toIssue(object)}
          {density}
          shown={cardFieldShown}
          {customAttrModels}
          accent={cardAccent(object, matchesVersion, $themeStore.dark)?.color}
          {space}
          {currentProject}
          {fullFilled}
        />
      {/key}
    </svelte:fragment>
    <svelte:fragment slot="dropTarget" let:target let:dragCard>
      {@const status = dropTargetStatus(target)}
      {#if status !== undefined}
        <IssueStatusIcon value={status} size="small" space={toIssue(dragCard).space} />
        <span class="drop-target-name">{status.name}</span>
      {/if}
    </svelte:fragment>
  </KanbanUI>
{/if}

<style lang="scss">
  .swimlane-header-inner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
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
  .header {
    margin: 0 var(--kanban-col-inset, 0.75rem) var(--kanban-header-gap, 1.0625rem);
    // Headers of a row stretch to the tallest one; their text sits at the middle of the height.
    align-items: center;
    padding: 0 0.5rem 0 1.25rem;
    min-height: 2.5rem;
    position: relative;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;

    .counter {
      color: var(--theme-dark-color);
    }
    .column-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      font-weight: 500;
      pointer-events: auto;
    }
    // Only the limit turns red, the fill of the header stays
    .limit {
      color: var(--theme-darker-color);

      &.over {
        color: var(--theme-state-negative-color);
      }
    }
    // Shown over the header on hover: hidden buttons must not take the names' width.
    .tools {
      position: absolute;
      top: 0.25rem;
      right: 0.25rem;
      border-radius: 0.25rem;
      background: inherit;
      opacity: 0;
      pointer-events: none;
    }
    &:hover .tools {
      opacity: 1;
      pointer-events: auto;
    }
    &.collapsed {
      margin: 0;
      cursor: pointer;
    }
    // A merged column names every status: the header grows instead of clipping them.
    &.merged {
      // In the column's flex layout the header would shrink and the names spill over the cards.
      flex-shrink: 0;
      align-items: flex-start;
      padding: 0.375rem 0.5rem 0.375rem 1.25rem;

      & > div {
        align-items: flex-start;
      }
    }
    .merged-names {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      // Long lists scroll inside the header; the count and the toggle stay in view.
      max-height: min(20rem, 40vh);
      overflow-y: auto;
    }
    // The toggle stays below the names, also when the expanded list scrolls.
    .names {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .more-members {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      width: fit-content;
      padding: 0 0.25rem;
      border-radius: 0.25rem;
      font-weight: 400;
      color: var(--theme-dark-color);
      cursor: pointer;

      &:hover {
        background-color: var(--theme-button-hovered);
      }
      &.expanded :global(svg) {
        transform: rotate(180deg);
      }
    }
  }
  .drop-target-name {
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-content-color);
  }
</style>
