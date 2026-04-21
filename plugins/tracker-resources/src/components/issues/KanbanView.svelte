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
  import { AttachmentsPresenter } from '@hcengineering/attachment-resources'
  import {
    CategoryType,
    Class,
    Doc,
    DocumentQuery,
    DocumentUpdate,
    FindOptions,
    generateId,
    getObjectValue,
    Lookup,
    mergeQueries,
    Ref,
    WithLookup
  } from '@hcengineering/core'
  import { Item, Kanban as KanbanUI, SwimLane } from '@hcengineering/kanban'
  import { employeeByIdStore } from '@hcengineering/contact-resources'
  import { Employee, getName } from '@hcengineering/contact'
  import { componentStore } from '../../component'
  import { defaultPriorities, issuePriorities } from '../../types'
  import { translate } from '@hcengineering/platform'
  import notification from '@hcengineering/notification'
  import { ActionContext, createQuery, getClient, reduceCalls } from '@hcengineering/presentation'
  import tags from '@hcengineering/tags'
  import { DocWithRank, getStates, TaskType } from '@hcengineering/task'
  import {
    getTaskKanbanResultQuery,
    taskTypeStore,
    typeStore,
    updateTaskKanbanCategories
  } from '@hcengineering/task-resources'
  import {
    Component as TrackerComponent,
    Issue,
    IssuePriority,
    IssuesGrouping,
    IssuesOrdering,
    IssueStatus,
    Milestone,
    Project,
    reduceChildInfoTree
  } from '@hcengineering/tracker'
  import {
    Button,
    ColorDefinition,
    Component,
    defaultBackground,
    getPlatformAvatarColorForTextDef,
    getPlatformColorDef,
    IconAdd,
    Label,
    Loading,
    showPopup,
    themeStore
  } from '@hcengineering/ui'
  import view, { AttributeModel, BuildModelKey, Viewlet, ViewOptionModel, ViewOptions } from '@hcengineering/view'
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
    ListPresenter,
    ListSelectionProvider,
    noCategory,
    openDoc,
    SelectDirection,
    setGroupByValues,
    showMenu,
    statusStore
  } from '@hcengineering/view-resources'
  import { ChatMessagesPresenter } from '@hcengineering/chunter-resources'
  import { onMount } from 'svelte'

  import tracker from '../../plugin'
  import { activeProjects, IssuePriorityColor } from '../../utils'
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

  $: groupByKey = (viewOptions.groupBy[0] ?? noCategory) as IssuesGrouping
  $: orderBy = viewOptions.orderBy
  $: compactMode = viewOptions.compactMode === true

  let customAttrModels: AttributeModel[] = []
  const buildCustomAttrModels = reduceCalls(async function (cfg: (string | BuildModelKey)[]): Promise<void> {
    const customKeys = cfg.filter((c): c is BuildModelKey => typeof c !== 'string' && c.displayProps?.custom === true)
    if (customKeys.length === 0) {
      customAttrModels = []
      return
    }
    customAttrModels = await buildModel({ client, _class, keys: customKeys, ignoreMissing: true })
  })
  $: void buildCustomAttrModels(config)

  let accentColors = new Map<string, ColorDefinition>()
  const setAccentColor = (n: number, ev: CustomEvent<ColorDefinition>) => {
    accentColors.set(`${n}${$themeStore.dark}${groupByKey}`, ev.detail)
    accentColors = accentColors
  }

  $: dontUpdateRank = orderBy[0] !== IssuesOrdering.Manual

  $: currentSpace = space ?? tracker.project.DefaultProject
  let currentProject: Project | undefined
  $: currentProject = $activeProjects.get(currentSpace) as Project

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

  $: groupByDocs = groupBy(tasks, groupByKey, categories)

  let fastDocs: DocWithRank[] = []
  let slowDocs: DocWithRank[] = []

  const docsQuery = createQuery()
  const docsQuerySlow = createQuery()

  let fastQueryIds = new Set<Ref<DocWithRank>>()

  let categoryQueryOptions: Partial<FindOptions<DocWithRank>>
  $: categoryQueryOptions = {
    ...getCategoryQueryNoLookupOptions(resultOptions),
    projection: {
      ...resultOptions.projection,
      _id: 1,
      _class: 1,
      rank: 1,
      ...getCategoryQueryProjection(client.getHierarchy(), _class, queryNoLookup, viewOptions.groupBy),
      ...(swimLaneBy !== 'none' ? { [swimLaneBy]: 1 } : {})
    }
  }

  $: docsQuery.query(
    _class,
    queryNoLookup,
    (res) => {
      fastDocs = res
      fastQueryIds = new Set(res.map((it) => it._id))
    },
    { ...categoryQueryOptions, limit: 1000 }
  )
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
  let loadCategories = true

  const queryId = generateId()

  function update (): void {
    void updateTaskKanbanCategories(
      client,
      viewlet,
      _class,
      space,
      tasks,
      groupByKey,
      viewOptions,
      viewOptionsConfig,
      update,
      queryId
    ).then((res) => {
      categories = res
      loadCategories = false
    })
  }

  $: void updateTaskKanbanCategories(
    client,
    viewlet,
    _class,
    space,
    tasks,
    groupByKey,
    viewOptions,
    viewOptionsConfig,
    update,
    queryId
  ).then((res) => {
    categories = res
    loadCategories = false
  })

  const fullFilled: Record<string, boolean> = {}

  function getHeader (_class: Ref<Class<Doc>>, groupByKey: string): void {
    if (groupByKey === noCategory) {
      headerComponent = undefined
    } else {
      void getPresenter(client, _class, { key: groupByKey }, { key: groupByKey }).then((p) => {
        headerComponent = p
      })
    }
  }

  let headerComponent: AttributeModel | undefined
  $: getHeader(_class, groupByKey)

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

  // SwimLane support
  const UNASSIGNED_SWIM = '__swim_unassigned__'
  $: swimLaneBy = (viewOptions.swimLaneBy as string) ?? 'none'

  let swimLanes: SwimLane[] = []
  let unassignedLabel = ''
  $: void translate(tracker.string.NoAssignee, {}, $themeStore.language).then((v) => {
    unassignedLabel = v
  })

  function buildPriorityLanes (): SwimLane[] {
    return defaultPriorities
      .map((p) => ({
        _id: String(p),
        title: '',
        value: p,
        icon: issuePriorities[p].icon
      }))
      .reverse()
  }

  function buildAssigneeLanes (tasks: Issue[], employees: typeof $employeeByIdStore): SwimLane[] {
    const ids = new Set<Ref<Employee>>()
    let hasUnassigned = false
    for (const t of tasks) {
      if (t.assignee == null) hasUnassigned = true
      else ids.add(t.assignee as Ref<Employee>)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const emp = employees.get(id)
      lanes.push({
        _id: id,
        title: emp !== undefined ? getName(client.getHierarchy(), emp) : id,
        value: id
      })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    if (hasUnassigned) {
      lanes.unshift({ _id: UNASSIGNED_SWIM, title: unassignedLabel, value: null })
    }
    return lanes
  }

  function buildComponentLanes (tasks: Issue[], compStore: typeof $componentStore): SwimLane[] {
    const ids = new Set<Ref<TrackerComponent>>()
    let hasEmpty = false
    for (const t of tasks) {
      if (t.component == null) hasEmpty = true
      else ids.add(t.component)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const comp = compStore.get(id)
      lanes.push({ _id: id, title: comp !== undefined ? comp.label : id, value: id })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    if (hasEmpty) {
      lanes.unshift({ _id: UNASSIGNED_SWIM, title: unassignedLabel, value: null })
    }
    return lanes
  }

  function buildProjectLanes (tasks: Issue[], projects: typeof $activeProjects): SwimLane[] {
    const ids = new Set<Ref<Project>>()
    for (const t of tasks) {
      if (t.space != null) ids.add(t.space)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const p = projects.get(id)
      lanes.push({ _id: id, title: p !== undefined ? (p.name ?? id) : id, value: id })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    return lanes
  }

  function buildKindLanes (tasks: Issue[], types: typeof $taskTypeStore): SwimLane[] {
    const ids = new Set<Ref<TaskType>>()
    let hasEmpty = false
    for (const t of tasks) {
      if (t.kind == null) hasEmpty = true
      else ids.add(t.kind)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const tt = types.get(id)
      lanes.push({ _id: id, title: tt !== undefined ? (tt.name ?? id) : id, value: id })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    if (hasEmpty) {
      lanes.unshift({ _id: UNASSIGNED_SWIM, title: unassignedLabel, value: null })
    }
    return lanes
  }

  function buildStatusLanes (tasks: Issue[], statuses: typeof $statusStore): SwimLane[] {
    const ids = new Set<Ref<IssueStatus>>()
    for (const t of tasks) {
      if (t.status != null) ids.add(t.status)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const st = statuses.byId.get(id)
      lanes.push({ _id: id, title: st !== undefined ? (st.name ?? id) : id, value: id })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    return lanes
  }

  function buildMilestoneLanes (tasks: Issue[], milestones: Map<Ref<Milestone>, { label: string }>): SwimLane[] {
    const ids = new Set<Ref<Milestone>>()
    let hasEmpty = false
    for (const t of tasks) {
      if (t.milestone == null) hasEmpty = true
      else ids.add(t.milestone)
    }
    const lanes: SwimLane[] = []
    for (const id of ids) {
      const m = milestones.get(id)
      lanes.push({ _id: id, title: m !== undefined ? m.label : id, value: id })
    }
    lanes.sort((a, b) => a.title.localeCompare(b.title))
    if (hasEmpty) {
      lanes.unshift({ _id: UNASSIGNED_SWIM, title: unassignedLabel, value: null })
    }
    return lanes
  }

  // Load milestones on-demand when swimLaneBy=milestone.
  let milestoneMap = new Map<Ref<Milestone>, { label: string }>()
  const milestoneQuery = createQuery()
  $: if (swimLaneBy === 'milestone') {
    milestoneQuery.query(tracker.class.Milestone, {}, (res) => {
      milestoneMap = new Map(res.map((m) => [m._id, { label: m.label }]))
    })
  } else {
    milestoneQuery.unsubscribe()
  }

  async function resolvePriorityTitles (lanes: SwimLane[], lang: string): Promise<SwimLane[]> {
    const resolved = await Promise.all(
      lanes.map(async (lane) => {
        const p = lane.value as number
        const info = issuePriorities[p as keyof typeof issuePriorities]
        const title = await translate(info.label, {}, lang)
        return { ...lane, title }
      })
    )
    return resolved
  }

  $: issueTasks = tasks as Issue[]

  $: {
    if (swimLaneBy === 'priority') {
      void resolvePriorityTitles(buildPriorityLanes(), $themeStore.language).then((r) => {
        swimLanes = r
      })
    } else if (swimLaneBy === 'assignee') {
      swimLanes = buildAssigneeLanes(issueTasks, $employeeByIdStore)
    } else if (swimLaneBy === 'component') {
      swimLanes = buildComponentLanes(issueTasks, $componentStore)
    } else if (swimLaneBy === 'space') {
      swimLanes = buildProjectLanes(issueTasks, $activeProjects)
    } else if (swimLaneBy === 'kind') {
      swimLanes = buildKindLanes(issueTasks, $taskTypeStore)
    } else if (swimLaneBy === 'status') {
      swimLanes = buildStatusLanes(issueTasks, $statusStore)
    } else if (swimLaneBy === 'milestone') {
      swimLanes = buildMilestoneLanes(issueTasks, milestoneMap)
    } else {
      swimLanes = []
    }
  }

  function getSwimLaneOfDoc (doc: Doc): string | undefined {
    const issue = doc as Issue
    if (swimLaneBy === 'priority') {
      return String(issue.priority ?? 0)
    }
    if (swimLaneBy === 'assignee') {
      return issue.assignee ?? UNASSIGNED_SWIM
    }
    if (swimLaneBy === 'component') {
      return issue.component ?? UNASSIGNED_SWIM
    }
    if (swimLaneBy === 'space') {
      return issue.space ?? undefined
    }
    if (swimLaneBy === 'kind') {
      return issue.kind ?? UNASSIGNED_SWIM
    }
    if (swimLaneBy === 'status') {
      return issue.status ?? undefined
    }
    if (swimLaneBy === 'milestone') {
      return issue.milestone ?? UNASSIGNED_SWIM
    }
    return undefined
  }

  function getSwimLaneQuery (swimLane: SwimLane): DocumentQuery<any> {
    if (swimLaneBy === 'priority') return { priority: swimLane.value }
    if (swimLaneBy === 'assignee') return { assignee: swimLane.value }
    if (swimLaneBy === 'component') return { component: swimLane.value }
    if (swimLaneBy === 'space') return { space: swimLane.value }
    if (swimLaneBy === 'kind') return { kind: swimLane.value }
    if (swimLaneBy === 'status') return { status: swimLane.value }
    if (swimLaneBy === 'milestone') return { milestone: swimLane.value }
    return {}
  }

  function getSwimLaneUpdateProps (doc: Doc, swimLane: SwimLane): DocumentUpdate<Item> | undefined {
    const v = swimLane.value
    let update: DocumentUpdate<Issue> | undefined
    if (swimLaneBy === 'priority') update = { priority: v as IssuePriority }
    else if (swimLaneBy === 'assignee') update = { assignee: v as Ref<Employee> | null }
    else if (swimLaneBy === 'component') update = { component: v as Ref<TrackerComponent> | null }
    // space (project) is immutable on existing docs via drag -> do not allow cross-project drop.
    else if (swimLaneBy === 'space') return undefined
    else if (swimLaneBy === 'kind') update = { kind: v as Ref<TaskType> }
    else if (swimLaneBy === 'status') update = { status: v as Ref<IssueStatus> }
    else if (swimLaneBy === 'milestone') update = { milestone: v as Ref<Milestone> | null }
    return update as DocumentUpdate<Item> | undefined
  }

  function getSwimLaneHeaderStyle (swimLane: SwimLane): { background?: string, color?: string } | undefined {
    if (swimLaneBy === 'priority') {
      const color = getPlatformColorDef(
        IssuePriorityColor[(swimLane.value as IssuePriority) ?? IssuePriority.NoPriority],
        $themeStore.dark
      )
      return { background: color.background, color: color.title }
    }
    if (swimLaneBy === 'assignee') {
      const emp = $employeeByIdStore.get(swimLane._id as Ref<Employee>)
      if (emp == null) return undefined
      const name = getName(client.getHierarchy(), emp)
      const color = getPlatformAvatarColorForTextDef(name, $themeStore.dark)
      return { background: color.background, color: color.title }
    }
    if (swimLaneBy === 'space') {
      const color = getPlatformAvatarColorForTextDef(swimLane.title, $themeStore.dark)
      return { background: color.background, color: color.title }
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
      const space = await client.findOne(tracker.class.Project, { _id: issue.space })
      return getStates(space, $typeStore, $statusStore.byId).map(({ _id }) => _id)
    }

    return categories
  }
</script>

{#if loadCategories}
  <Loading />
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
    {getSwimLaneQuery}
    {getSwimLaneUpdateProps}
    {getSwimLaneHeaderStyle}
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
    <svelte:fragment slot="header" let:state let:count let:index>
      {@const color = accentColors.get(`${index}${$themeStore.dark}${groupByKey}`)}
      {@const headerBGColor = color?.background ?? defaultBackground($themeStore.dark)}
      <div style:background={headerBGColor} class="header flex-between">
        <div class="flex-row-center gap-1">
          <span
            class="clear-mins fs-bold overflow-label pointer-events-none"
            style:color={color?.title ?? 'var(--theme-caption-color)'}
          >
            {#if groupByKey === noCategory}
              <Label label={view.string.NoGrouping} />
            {:else if headerComponent}
              <svelte:component
                this={headerComponent.presenter}
                value={state}
                {space}
                size={'small'}
                kind={'list-header'}
                display={'kanban'}
                colorInherit={!$themeStore.dark}
                accent
                on:accent-color={(ev) => {
                  setAccentColor(index, ev)
                }}
              />
            {/if}
          </span>
          <span class="counter ml-1">
            {count}
          </span>
        </div>
        <div class="tools gap-1">
          <Button
            icon={IconAdd}
            kind={'ghost'}
            showTooltip={{ label: tracker.string.AddIssueTooltip, direction: 'left' }}
            on:click={() => {
              showPopup(CreateIssue, { space: currentSpace, [groupByKey]: state }, 'top')
            }}
          />
        </div>
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
              <AssigneeEditor object={issue} avatarSize={'card'} shouldShowName={false} />
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
              <PriorityEditor
                value={issue}
                isEditable={true}
                kind={'link-bordered'}
                size={'small'}
                justify={'center'}
              />
            {/if}
            {#if enabledConfig(config, 'subIssues') && issue && issue.subIssues > 0}
              <SubIssuesSelector value={issue} {currentProject} size={'small'} />
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
                customStyle={'square'}
              />
            {/each}
            {#if enabledConfig(config, 'dueDate') && (!compactMode || issue.dueDate != null)}
              <DueDatePresenter value={issue} size={'small'} kind={'link-bordered'} />
            {/if}
            {#if compactMode}
              {#if enabledConfig(config, 'estimation') && (estimations > 0 || reports > 0)}
                <EstimationEditor kind={'link-bordered'} size={'small'} value={issue} />
              {/if}
              {#if enabledConfig(config, 'attachments') && (object.attachments ?? 0) > 0}
                <AttachmentsPresenter value={object.attachments} {object} kind={'link-bordered'} size={'small'} />
              {/if}
              {#if enabledConfig(config, 'comments') && (object.comments ?? 0) > 0}
                <ChatMessagesPresenter value={object.comments} {object} kind={'link-bordered'} size={'small'} />
              {/if}
              {#if enabledConfig(config, 'comments') && (object.$lookup?.attachedTo?.comments ?? 0) > 0}
                <ChatMessagesPresenter
                  object={object.$lookup?.attachedTo}
                  value={object.$lookup?.attachedTo?.comments}
                  withInput={false}
                  kind={'link-bordered'}
                  size={'small'}
                />
              {/if}
            {:else}
              {#if enabledConfig(config, 'component')}
                <div class:icon-only={issue.component == null}>
                  <ComponentEditor
                    value={issue}
                    {space}
                    isEditable={true}
                    kind={'link-bordered'}
                    size={'small'}
                    justify={'center'}
                  />
                </div>
              {/if}
              {#if enabledConfig(config, 'milestone')}
                <div class:icon-only={issue.milestone == null}>
                  <MilestoneEditor
                    value={issue}
                    {space}
                    isEditable={true}
                    kind={'link-bordered'}
                    size={'small'}
                    maxWidth={'7rem'}
                    justify={'center'}
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
                  ckeckFilled: fullFilled[issueId],
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
                    <EstimationEditor kind={'list'} size={'small'} value={issue} />
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
  .header {
    margin: 0 0.75rem 0.5rem;
    padding: 0 0.5rem 0 1.25rem;
    height: 2.5rem;
    min-height: 2.5rem;
    border: 1px solid var(--theme-divider-color);
    border-radius: 0.25rem;

    .counter {
      color: var(--theme-dark-color);
    }
    .tools {
      opacity: 0;
    }
    &:hover .tools {
      opacity: 1;
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
