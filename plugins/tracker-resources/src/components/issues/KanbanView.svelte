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
  import { AttachmentsPresenter } from '@hcengineering/attachment-resources'
  import type {
    CategoryType,
    Class,
    Doc,
    DocumentQuery,
    DocumentUpdate,
    FindOptions,
    Lookup,
    Ref,
    SortingQuery,
    Status,
    WithLookup
  } from '@hcengineering/core'
  import { generateId, getObjectValue, groupByArray, mergeQueries } from '@hcengineering/core'
  import type { Item, SwimLane } from '@hcengineering/kanban'
  import { Kanban as KanbanUI } from '@hcengineering/kanban'
  import { employeeByIdStore } from '@hcengineering/contact-resources'
  import type { Employee } from '@hcengineering/contact'
  import { getName } from '@hcengineering/contact'
  import type { IntlString } from '@hcengineering/platform'
  import { translate } from '@hcengineering/platform'
  import notification from '@hcengineering/notification'
  import { ActionContext, createQuery, getClient, reduceCalls } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import type { DocWithRank, TaskType, Project as TaskProject } from '@hcengineering/task'
  import task, { getStates } from '@hcengineering/task'
  import {
    getTaskKanbanResultQuery,
    taskTypeStore,
    typeStore,
    updateTaskKanbanCategories
  } from '@hcengineering/task-resources'
  import type { Issue, Project } from '@hcengineering/tracker'
  import { IssuePriority, IssuesGrouping, IssuesOrdering, reduceChildInfoTree } from '@hcengineering/tracker'
  import type { BlankViewProps, ColorDefinition, SelectPopupValueType } from '@hcengineering/ui'
  import ui, {
    Button,
    Component,
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
    Icon
  } from '@hcengineering/ui'
  import type {
    AttributeModel,
    BuildModelKey,
    OrderOption,
    Viewlet,
    ViewOptionModel,
    ViewOptions
  } from '@hcengineering/view'
  import view from '@hcengineering/view'
  import type { SelectDirection } from '@hcengineering/view-resources'
  import {
    buildModel,
    buildSortRules,
    enabledConfig,
    focusStore,
    getCategoryQueryNoLookup,
    getCategoryQueryNoLookupOptions,
    getCategoryQueryProjection,
    getGroupByValues,
    getPresenter,
    groupBy,
    hasSortRules,
    ListPresenter,
    ListSelectionProvider,
    noCategory,
    provideCategoryValues,
    provideStatusIconScope,
    openDoc,
    setGroupByValues,
    showMenu,
    statusStore
  } from '@hcengineering/view-resources'
  import { ChatMessagesPresenter } from '@hcengineering/chunter-resources'
  import type { ProjectWorkflow, Workflow, WorkflowTransition } from '@hcengineering/workflow'
  import workflow from '@hcengineering/workflow'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'
  import { componentStore } from '../../component'
  import { activeProjects, IssuePriorityColor, sortSwimLaneValues } from '../../utils'
  import {
    buildSwimLanes,
    normalizeSwimValue,
    sortSwimLanes,
    swimLaneUpdateProps,
    UNASSIGNED_SWIM
  } from '../../swimLanes'
  import ComponentEditor from '../components/ComponentEditor.svelte'
  import CreateIssue from '../CreateIssue.svelte'
  import AssigneeEditor from './AssigneeEditor.svelte'
  import DueDatePresenter from './DueDatePresenter.svelte'
  import SubIssuesSelector from './edit/SubIssuesSelector.svelte'
  import IssuePresenter from './IssuePresenter.svelte'
  import ParentNamesPresenter from './ParentNamesPresenter.svelte'
  import PriorityEditor from './PriorityEditor.svelte'
  import StatusEditor from './StatusEditor.svelte'
  import EstimationEditor from './timereport/EstimationEditor.svelte'
  import MilestoneEditor from '../milestones/MilestoneEditor.svelte'

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

  $: requestedGroupByKey = (viewOptions.groupBy[0] ?? noCategory) as IssuesGrouping
  // Set together with categories: columns of the old grouping under a new key query {space: 0}.
  let groupByKey = (viewOptions.groupBy[0] ?? noCategory) as IssuesGrouping
  $: orderBy = viewOptions.orderBy
  $: compactMode = viewOptions.compactMode === true

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

  $: currentSpace = space ?? tracker.project.DefaultProject
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

  const lookup: Lookup<Issue> = {
    ...(options?.lookup ?? {}),
    attachedTo: tracker.class.Issue,
    _id: {
      subIssues: tracker.class.Issue
    }
  }

  let sortValue: SortingQuery<DocWithRank> | undefined = undefined
  let sortReady = true
  let sortRequest = 0
  let sortSignature = ''

  const updateSort = reduceCalls(async function (orderBy: OrderOption | undefined, request: number) {
    if (orderBy === undefined) return
    let rules
    try {
      rules = await buildSortRules(client, _class, orderBy[0], orderBy[1], space, viewlet.descriptor)
    } catch (err: any) {
      console.error('Sort rules build failed', err)
    }
    if (request !== sortRequest) return
    sortValue = { [orderBy[0]]: rules ?? orderBy[1] }
    sortReady = true
  })

  $: {
    const signature =
      orderBy === undefined ? '' : `${_class}|${orderBy[0]}|${orderBy[1]}|${space ?? ''}|${viewlet.descriptor}`
    if (signature !== sortSignature) {
      sortSignature = signature
      if (orderBy === undefined) {
        sortValue = undefined
        sortReady = true
      } else if (hasSortRules(client, _class, orderBy[0])) {
        sortRequest++
        sortReady = false
        void updateSort(orderBy, sortRequest)
      } else {
        sortValue = { [orderBy[0]]: orderBy[1] }
        sortReady = true
      }
    }
  }

  $: resultOptions = { ...options, lookup, ...(sortValue !== undefined ? { sort: sortValue } : {}) }

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

  $: swimLaneBy = (viewOptions.swimLaneBy as string) ?? 'none'

  let categoryQueryOptions: Partial<FindOptions<DocWithRank>>
  $: categoryQueryOptions = {
    ...getCategoryQueryNoLookupOptions(resultOptions),
    projection: {
      ...resultOptions.projection,
      _id: 1,
      _class: 1,
      rank: 1,
      ...getCategoryQueryProjection(client.getHierarchy(), _class, queryNoLookup, viewOptions.groupBy),
      ...(swimLaneBy !== 'none' && swimLaneBy !== '' ? { [swimLaneBy]: 1 } : {})
    }
  }

  let docsLoaded = false
  $: if (sortReady) {
    docsQuery.query(
      _class,
      queryNoLookup,
      (res) => {
        fastDocs = res
        fastQueryIds = new Set(res.map((it) => it._id))
        docsLoaded = true
      },
      { ...categoryQueryOptions, limit: 1000 }
    )
    docsQuerySlow.query(
      _class,
      queryNoLookup,
      (res) => {
        slowDocs = res
      },
      categoryQueryOptions
    )
  }

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

  const updateCategories = reduceCalls(async function (
    key: IssuesGrouping,
    space: Ref<Project> | undefined,
    tasks: DocWithRank[],
    viewOptions: ViewOptions,
    viewOptionsConfig: ViewOptionModel[] | undefined
  ): Promise<void> {
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

  const getUpdateProps = (doc: Doc, category: CategoryType): DocumentUpdate<Item> | undefined => {
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

  $: void orderLanes(swimLaneBy, buildGenericLanes(swimLaneBy, effectiveTasks))

  function getSwimLaneOfDoc (doc: Doc): string | undefined {
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

  $: swimLaneStorageKey = viewlet?._id != null ? `${String(viewlet._id)}-${swimLaneBy}` : undefined

  async function shouldShowFooter (
    config: (string | BuildModelKey)[],
    reports: number,
    estimations: number,
    issue: WithLookup<Issue>
  ): Promise<boolean> {
    if (enabledConfig(config, 'estimation') && (reports > 0 || estimations > 0)) return true
    if (enabledConfig(config, 'comments')) {
      if ((issue.comments ?? 0) > 0) return true
      if ((issue.$lookup?.attachedTo?.comments ?? 0) > 0) return true
    }
    if (enabledConfig(config, 'attachments') && (issue.attachments ?? 0) > 0) return true
    return false
  }

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

  const getAvailableCategories = async (doc: Doc): Promise<CategoryType[]> => {
    const issue = toIssue(doc)

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
    {groupByDocs}
    {groupByKey}
    on:obj-focus={(evt) => {
      listProvider.updateFocus(evt.detail)
    }}
    {getAvailableCategories}
    {swimLanes}
    swimLaneKey={swimLaneBy !== 'none' ? swimLaneBy : undefined}
    {getSwimLaneOfDoc}
    {getSwimLaneDocId}
    {getSwimLaneUpdateProps}
    {getSwimLaneHeaderStyle}
    getCategoryGroup={groupByKey === 'status' ? statusCategory : undefined}
    compact={compactMode}
    storageKey={swimLaneStorageKey}
    controlKey={viewlet?._id != null ? String(viewlet._id) : undefined}
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
      </div>
    </svelte:fragment>
    <svelte:fragment slot="header" let:state let:count let:index let:collapsed let:toggle let:members let:merge>
      {@const color = accentColors.get(`${index}${$themeStore.dark}${groupByKey}`)}
      {@const headerBGColor = color?.background ?? defaultBackground($themeStore.dark)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        style:background={headerBGColor}
        class="header flex-between"
        class:merged={members.length > 1}
        class:collapsed
        on:click={() => {
          if (collapsed) toggle()
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
              {#if groupByKey === noCategory}
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
        </div>
        {#if !collapsed}
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
      {@const issue = toIssue(object)}
      {@const issueId = object._id}
      {@const treeResult = reduceChildInfoTree(issue.childInfo ?? [], issue.estimation, issue.reportedTime)}
      {@const reports = treeResult.totalReportedTime}
      {@const estimations = treeResult.totalEstimation}
      {#key issueId}
        <div
          class="tracker-card"
          class:compact={compactMode}
          on:click={() => {
            void openDoc(client.getHierarchy(), issue)
          }}
        >
          <div class="card-header flex-between">
            <div class="flex-row-center text-sm min-w-0">
              <div class="mr-1 flex-no-shrink">
                <StatusEditor value={issue} kind="list" isEditable={false} />
              </div>
              <div class="flex-no-shrink">
                <IssuePresenter value={issue} />
              </div>
              {#if !compactMode}
                <ParentNamesPresenter value={issue} />
              {/if}
            </div>
            <div class="flex-row-center gap-2 reverse flex-no-shrink">
              <Component is={notification.component.NotificationPresenter} props={{ value: object }} />
              <AssigneeEditor object={issue} avatarSize="card" shouldShowName={false} />
            </div>
          </div>
          <div
            class="card-content caption-color"
            class:text-md={!compactMode}
            class:text-sm={compactMode}
            class:lines-limit-2={!compactMode}
          >
            {object.title}
          </div>
          <div class="card-labels meta">
            {#if enabledConfig(config, 'priority') && (!compactMode || issue.priority !== IssuePriority.NoPriority)}
              <PriorityEditor value={issue} isEditable={true} kind="link-bordered" size="small" justify="center" />
            {/if}
            {#if enabledConfig(config, 'subIssues') && issue && issue.subIssues > 0}
              <SubIssuesSelector value={issue} {currentProject} size="small" />
            {/if}
            {#each customAttrModels as attrModel (attrModel.key)}
              <ListPresenter
                docObject={issue}
                attributeModel={attrModel}
                value={getObjectValue(attrModel.key, issue)}
                onChange={undefined}
                props={{}}
                hideDivider={true}
                compactMode={true}
                customStyle="square"
              />
            {/each}
            {#if enabledConfig(config, 'dueDate') && (!compactMode || issue.dueDate != null)}
              <DueDatePresenter value={issue} size="small" kind="link-bordered" />
            {/if}
            {#if compactMode}
              {#if enabledConfig(config, 'estimation') && (estimations > 0 || reports > 0)}
                <EstimationEditor kind="link-bordered" size="small" value={issue} />
              {/if}
              {#if enabledConfig(config, 'attachments') && (object.attachments ?? 0) > 0}
                <AttachmentsPresenter value={object.attachments} {object} kind="link-bordered" size="small" />
              {/if}
              {#if enabledConfig(config, 'comments') && (object.comments ?? 0) > 0}
                <ChatMessagesPresenter value={object.comments} {object} kind="link-bordered" size="small" />
              {/if}
              {#if enabledConfig(config, 'comments') && (object.$lookup?.attachedTo?.comments ?? 0) > 0}
                <ChatMessagesPresenter
                  object={object.$lookup?.attachedTo}
                  value={object.$lookup?.attachedTo?.comments}
                  withInput={false}
                  kind="link-bordered"
                  size="small"
                />
              {/if}
            {:else}
              {#if enabledConfig(config, 'component')}
                <div class:icon-only={issue.component == null}>
                  <ComponentEditor
                    value={issue}
                    {space}
                    isEditable={true}
                    kind="link-bordered"
                    size="small"
                    justify="center"
                  />
                </div>
              {/if}
              {#if enabledConfig(config, 'milestone')}
                <div class:icon-only={issue.milestone == null}>
                  <MilestoneEditor
                    value={issue}
                    {space}
                    isEditable={true}
                    kind="link-bordered"
                    size="small"
                    maxWidth="7rem"
                    justify="center"
                  />
                </div>
              {/if}
            {/if}
          </div>
          {#if !compactMode && enabledConfig(config, 'labels')}
            <div class="card-labels labels">
              <Component
                is={tags.component.LabelsPresenter}
                props={{
                  value: issue.labels,
                  object: issue,
                  checkFilled: fullFilled[issueId],
                  kind: 'link',
                  compression: true
                }}
                on:change={(res) => {
                  if (res.detail.full) fullFilled[issueId] = true
                }}
              />
            </div>
          {/if}
          {#if !compactMode}
            {#await shouldShowFooter(config, reports, estimations, object) then withFooter}
              {#if withFooter}
                <div class="card-footer flex-between">
                  {#if enabledConfig(config, 'estimation')}
                    <EstimationEditor kind="list" size="small" value={issue} />
                  {/if}
                  <div class="flex-row-center gap-3 reverse">
                    {#if enabledConfig(config, 'attachments') && (object.attachments ?? 0) > 0}
                      <AttachmentsPresenter value={object.attachments} {object} />
                    {/if}
                    <ChatMessagesPresenter value={object.comments} {object} />
                    <ChatMessagesPresenter
                      object={object.$lookup?.attachedTo}
                      value={object.$lookup?.attachedTo?.comments}
                      withInput={false}
                    />
                  </div>
                </div>
              {:else}
                <div class="min-h-4 max-h-4 h-4" />
              {/if}
            {/await}
          {/if}
        </div>
      {/key}
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
    font-size: 0.8125rem;
    padding: 0 0.375rem;
    background: var(--theme-button-hovered);
    border-radius: 0.5rem;
    line-height: 1.25rem;
  }
  .header {
    margin: 0 0.75rem 0.5rem;
    // Headers of a row stretch to the tallest one; their content stays at the top.
    align-items: flex-start;
    padding: 0.375rem 0.5rem 0 1.25rem;
    min-height: 2.5rem;
    position: relative;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;

    .counter {
      color: var(--theme-dark-color);
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
      padding-bottom: 0.375rem;

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
  .tracker-card {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 6.5rem;
    border-radius: 0.25rem;

    &.compact {
      min-height: 0;

      .card-content {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .card-header {
        padding: 0.375rem 0.5rem 0;
      }
      .card-content {
        margin: 0.125rem 0.5rem;
        line-height: 1.15rem;
      }
      .card-labels {
        margin: 0.125rem 0.375rem 0.375rem 0.5rem;
        gap: 0.25rem;

        &.meta {
          flex-wrap: wrap;
        }
      }
    }

    .card-header {
      padding: 0.75rem 1rem 0;
    }
    .card-content {
      margin: 0.5rem 1rem;
    }
    /* Global styles in components.scss */
    .card-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin: 0 0.75rem 0 1rem;
      min-width: 0;

      &.meta {
        flex-wrap: wrap;
        gap: 0.375rem;
      }

      :global(.icon-only span.label.nowrap),
      :global(.icon-only button.iconL > span.label) {
        display: none;
      }
      :global(.icon-only button) {
        padding: 0 0.375rem !important;
        width: auto !important;
      }
      :global(.icon-only .flex-presenter) {
        margin: 0;
      }
      :global(.icon-only .icon),
      :global(.icon-only .btn-icon) {
        margin: 0 !important;
      }

      &.labels {
        overflow: hidden;
        flex-shrink: 1;
        margin: 0 1rem;
        width: calc(100% - 2rem);
        border-radius: 0 0.24rem 0.24rem 0;
      }
    }
    .card-footer {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background-color: var(--theme-kanban-card-footer);
      border-radius: 0 0 0.25rem 0.25rem;
    }
  }
</style>
