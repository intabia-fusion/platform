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
<script lang="ts">
  import type { Ref, Status } from '@hcengineering/core'
  import { setPlatformStatus, unknownError } from '@hcengineering/platform'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { clearSettingsStore, settingsStore } from '@hcengineering/setting-resources'
  import type { ProjectType, ProjectTypeDescriptor, TaskType } from '@hcengineering/task'
  import task, {
    countTasksByStatus,
    createStatusesAtomic,
    findDuplicateStatusGroups,
    findStatusAttr,
    getOrphanStatuses,
    getProjectStatusRank,
    getProjectTypeStates,
    getStatusCategoryOrder,
    resolveStatusReuse
  } from '@hcengineering/task'
  import ui, {
    type Action,
    type PopupAlignment,
    Button,
    eventToHTMLElement,
    getEventPositionElement,
    Label,
    Menu,
    showPopup
  } from '@hcengineering/ui'
  import { IconButton } from '@hcengineering/ui/kit'
  import { FixedColumn, statusStore } from '@hcengineering/view-resources'

  import { taskTypeStore, typeStore } from '../..'
  import plugin from '../../plugin'
  import { deleteProjectTypeStatus } from '../../statusDelete'
  import { confirmStatusMerge, pickStatusForMerge } from '../../statusMergeFlow'
  import { loadWorkflowUsage } from '../../statusUsage'
  import StatePresenter from '../state/StatePresenter.svelte'
  import StatesProjectEditor from '../state/StatesProjectEditor.svelte'

  export let type: ProjectType | undefined
  export let descriptor: ProjectTypeDescriptor | undefined
  export let disabled: boolean = true

  // Counting is client-side over one projected query, so it is bounded
  const COUNT_LIMIT = 5000

  const client = getClient()

  let taskTypes: TaskType[] = []
  const taskTypesQuery = createQuery()
  $: taskTypesQuery.query(task.class.TaskType, { _id: { $in: type?.tasks ?? [] } }, (res) => {
    taskTypes = res
  })

  $: currentType = type !== undefined ? ($typeStore.get(type._id) ?? type) : undefined
  $: statuses = getProjectTypeStates(currentType?._id, $typeStore, $statusStore.byId)

  let counts = new Map<Ref<Status>, number>()
  let counted = 0
  let total = 0

  async function loadCounts (tasksKey: string): Promise<void> {
    if (tasksKey === '') return
    const res = await client.findAll(
      task.class.Task,
      { kind: { $in: tasksKey.split(',') as Array<Ref<TaskType>> } },
      { limit: COUNT_LIMIT, total: true, projection: { status: 1, kind: 1 } }
    )
    counts = countTasksByStatus(res)
    counted = res.length
    total = res.total
  }
  $: void loadCounts((type?.tasks ?? []).join(','))

  let workflowCounts = new Map<Ref<Status>, number>()

  async function loadWorkflows (typeId: Ref<ProjectType> | undefined, types: TaskType[]): Promise<void> {
    if (typeId === undefined) return
    const used = await loadWorkflowUsage(client, typeId, types)
    workflowCounts = new Map([...used].map(([status, list]) => [status, list.length]))
  }
  $: void loadWorkflows(type?._id, taskTypes)

  // Category order of the settings screens, then the order of the project type (as the icons and groups use)
  $: categoryOrder = getStatusCategoryOrder()
  $: rank = getProjectStatusRank(currentType !== undefined ? [currentType] : [], $taskTypeStore)
  $: sorted = statuses
    .map((status, index) => ({ status, index }))
    .sort((a, b) => {
      const byCategory = categoryIndex(a.status) - categoryIndex(b.status)
      if (byCategory !== 0) return byCategory
      const byRank = (rank.get(a.status._id) ?? rank.size) - (rank.get(b.status._id) ?? rank.size)
      return byRank !== 0 ? byRank : a.index - b.index
    })
    .map((it) => it.status)
  $: categoryIds = [...new Set(sorted.map((it) => it.category))].filter((it) => it !== undefined)

  function categoryIndex (status: Status): number {
    const idx = status.category !== undefined ? categoryOrder.indexOf(status.category) : -1
    return idx >= 0 ? idx : categoryOrder.length
  }

  // Same name and category: merged automatically on update. Same name, several categories: a user decision.
  $: duplicates = new Map(
    [...findDuplicateStatusGroups(statuses).values()].flatMap((members) => {
      const list = sorted.filter((it) => members.some((m) => m._id === it._id))
      const sameCategory = members.every((it) => it.category === members[0].category)
      return list.map((it) => [it._id, { sameCategory, list }] as const)
    })
  )

  // Statuses of the status attribute of this project type that nothing lists
  $: statusAttributes = new Set(taskTypes.map((it) => findStatusAttr(client.getHierarchy(), it.ofClass)._id))
  $: orphans = getOrphanStatuses(
    $statusStore.byId.values(),
    $typeStore.values(),
    $taskTypeStore.values(),
    statusAttributes
  ).sort((a, b) => a.name.localeCompare(b.name))

  // Statuses of the same category the given one can be merged into
  function sameCategoryStatuses (status: Status): Status[] {
    return statuses.filter((it) => it.category === status.category && it.ofAttribute === status.ofAttribute)
  }

  function reload (): void {
    void loadWorkflows(type?._id, taskTypes)
    void loadCounts((type?.tasks ?? []).join(','))
  }

  // Right click on a row, the same pattern as the attribute lists of the settings
  function showRowMenu (ev: MouseEvent, status: Status): void {
    const anchor = getEventPositionElement(ev) ?? eventToHTMLElement(ev)
    const actions: Action[] = [
      {
        label: plugin.string.StatusOpen,
        icon: ui.icon.PencilLine,
        action: async () => {
          edit(status)
        }
      }
    ]
    if (!disabled && sameCategoryStatuses(status).length > 1) {
      actions.push({
        label: plugin.string.MergeStatusesRowAction,
        icon: ui.icon.ChevronRightSmall,
        action: async () => {
          mergeInto(anchor, status)
        }
      })
    }
    if (!disabled) {
      actions.push({
        label: plugin.string.Delete,
        icon: ui.icon.Trash,
        action: async () => {
          await remove(status)
        }
      })
    }
    showPopup(Menu, { actions }, anchor)
  }

  // Orphan rows whose add or delete is still loading
  let busyOrphans = new Set<Ref<Status>>()
  async function withOrphanBusy (status: Status, op: () => Promise<void>): Promise<void> {
    if (busyOrphans.has(status._id)) return
    busyOrphans.add(status._id)
    busyOrphans = busyOrphans
    try {
      await op()
    } finally {
      busyOrphans.delete(status._id)
      busyOrphans = busyOrphans
    }
  }

  async function remove (status: Status): Promise<void> {
    if (currentType === undefined) return
    await deleteProjectTypeStatus(currentType, status, () => {
      // Another status may be open for editing: only the deleted one closes
      if ($settingsStore.id === status._id) clearSettingsStore()
      reload()
    })
  }

  // Row action: the status is merged into the one picked from the other statuses of its category
  function mergeInto (anchor: PopupAlignment, status: Status): void {
    if (currentType === undefined) return
    const targetType = currentType
    pickStatusForMerge(
      anchor,
      targetType,
      sameCategoryStatuses(status).filter((it) => it._id !== status._id),
      taskTypes,
      'into',
      (id) => {
        const target = statuses.find((it) => it._id === id)
        if (target !== undefined) confirmStatusMerge(targetType, [status], target, taskTypes, reload)
      }
    )
  }

  // Group action: the status picked from the group stays, the others are merged into it (transfer: across categories)
  function mergeGroup (ev: MouseEvent, list: Status[], transfer: boolean): void {
    if (currentType === undefined) return
    const targetType = currentType
    pickStatusForMerge(eventToHTMLElement(ev), targetType, list, taskTypes, 'keep', (id) => {
      const target = list.find((it) => it._id === id)
      if (target !== undefined) {
        confirmStatusMerge(
          targetType,
          list.filter((it) => it._id !== id),
          target,
          taskTypes,
          reload,
          { transfer }
        )
      }
    })
  }

  function edit (status: Status): void {
    if (currentType === undefined) return
    const projectStatus = currentType.statuses.find((it) => it._id === status._id)
    $settingsStore = {
      id: status._id,
      component: plugin.component.CreateStatePopup,
      props: {
        status,
        taskType: undefined,
        type: currentType,
        ofAttribute: status.ofAttribute,
        icon: projectStatus?.icon,
        color: projectStatus?.color ?? status.color,
        icons: [],
        canDelete: true,
        selectableStates: sameCategoryStatuses(status).filter((it) => it._id !== status._id),
        readonly: disabled
      }
    }
  }

  function create (): void {
    const taskType = taskTypes[0]
    if (disabled || currentType === undefined || taskType === undefined) return
    $settingsStore = {
      id: '#',
      component: plugin.component.CreateStatePopup,
      props: {
        status: undefined,
        taskType: undefined,
        _class: taskType.statusClass,
        category: task.statusCategory.Active,
        type: currentType,
        ofAttribute: findStatusAttr(client.getHierarchy(), taskType.ofClass)._id,
        icon: undefined,
        color: 0,
        icons: [],
        readonly: disabled
      }
    }
  }

  async function move (order: Array<Ref<Status>>): Promise<void> {
    if (disabled || currentType === undefined) return
    await client.update(currentType, { statusOrder: order.filter((it, idx, arr) => arr.indexOf(it) === idx) })
  }

  async function addToType (status: Status): Promise<void> {
    if (currentType === undefined) return
    const found = resolveStatusReuse(statuses, status, status._id)
    const existing = found.action === 'create' ? undefined : statuses.find((it) => it._id === found.status._id)
    if (existing !== undefined) {
      // The name is taken in the project type: the orphan is merged into that status
      confirmStatusMerge(currentType, [status], existing, taskTypes, reload, { transfer: true })
      return
    }
    try {
      await createStatusesAtomic(
        client,
        currentType._id,
        status._class,
        [
          {
            id: status._id,
            attachExisting: true,
            data: { name: status.name, ofAttribute: status.ofAttribute, category: status.category }
          }
        ],
        { projectOnly: true }
      )
    } catch (err) {
      await setPlatformStatus(unknownError(err))
    }
  }
</script>

{#if descriptor !== undefined && type !== undefined}
  {@const col = `statuses-${type._id}`}
  <div class="hulyTableAttr-header font-medium-12">
    <span><Label label={plugin.string.Statuses} /></span>
    <IconButton
      kind="primary"
      icon={ui.icon.Plus}
      size="small"
      data-id="btnAddProjectTypeStatus"
      tooltip={{ label: presentation.string.Add }}
      on:click={create}
      disabled={disabled || taskTypes.length === 0}
    />
  </div>
  {#if total > counted}
    <div class="hulyTableAttr-content task">
      <div class="hulyTableAttr-content__row disableMouseOver font-regular-12 secondary">
        <Label label={plugin.string.StatusesCountPartial} params={{ counted, total }} />
      </div>
    </div>
  {/if}
  <!-- Same container as the category blocks of the editor, so the headers sit above the numbers -->
  <div class="hulyTableAttr-content class withTitle">
    <div class="hulyTableAttr-content__title" />
    <div class="hulyTableAttr-content__wrapper">
      <div class="hulyTableAttr-content__row disableMouseOver secondary font-medium-12">
        <span class="flex-grow" />
        <FixedColumn key={`${col}-tasks`} justify="right"><Label label={plugin.string.Tasks} /></FixedColumn>
        <FixedColumn key={`${col}-workflows`} justify="right">
          <Label label={plugin.string.StatusesColumnWorkflows} />
        </FixedColumn>
      </div>
    </div>
  </div>
  <StatesProjectEditor
    type={currentType ?? type}
    states={sorted}
    {categoryIds}
    readonly={disabled}
    on:select={(evt) => {
      edit(evt.detail)
    }}
    on:rowmenu={(evt) => {
      showRowMenu(evt.detail.event, evt.detail.state)
    }}
    on:move={(evt) => {
      void move(evt.detail.order)
    }}
  >
    <svelte:fragment slot="end" let:state>
      {@const duplicate = duplicates.get(state._id)}
      {#if duplicate !== undefined}
        <IconButton
          kind="tertiary"
          size="extra-small"
          icon={ui.icon.ExclamationCircle}
          iconProps={{ fill: 'var(--theme-error-color)' }}
          {disabled}
          tooltip={{
            label: duplicate.sameCategory
              ? plugin.string.StatusesDuplicatesHeader
              : plugin.string.StatusDuplicatesOtherCategories,
            props: { count: duplicate.list.length, name: state.name }
          }}
          on:click={(ev) => {
            ev.stopPropagation()
            mergeGroup(ev, duplicate.list, !duplicate.sameCategory)
          }}
        />
      {/if}
      <FixedColumn key={`${col}-tasks`} justify="right">
        <span class="font-medium-14">{counts.get(state._id) ?? 0}</span>
      </FixedColumn>
      <FixedColumn key={`${col}-workflows`} justify="right">
        <span class="font-medium-14">{workflowCounts.get(state._id) ?? 0}</span>
      </FixedColumn>
    </svelte:fragment>
  </StatesProjectEditor>
  {#if orphans.length > 0}
    <div class="orphans">
      <div class="hulyTableAttr-header font-medium-12">
        <span><Label label={plugin.string.StatusOrphansTitle} params={{ count: orphans.length }} /></span>
      </div>
      <div class="hulyTableAttr-content class withTitle">
        <div class="hulyTableAttr-content__title" />
        <div class="hulyTableAttr-content__wrapper">
          {#each orphans as status (status._id)}
            <div class="hulyTableAttr-content__row disableMouseOver">
              <div class="hulyTableAttr-content__row-dragMenu" />
              <StatePresenter value={status} projectType={type._id} kind="table-attrs" size="medium" />
              <div class="flex-row-center flex-gap-2 ml-auto">
                <Button
                  kind="regular"
                  size="small"
                  label={plugin.string.StatusOrphanAdd}
                  {disabled}
                  loading={busyOrphans.has(status._id)}
                  on:click={() => {
                    void withOrphanBusy(status, async () => {
                      await addToType(status)
                    })
                  }}
                />
                <!-- A status of the model is never deleted, the row would stay -->
                {#if !status._id.includes(':')}
                  <Button
                    kind="regular"
                    size="small"
                    label={plugin.string.Delete}
                    {disabled}
                    loading={busyOrphans.has(status._id)}
                    on:click={() => {
                      void withOrphanBusy(status, async () => {
                        await remove(status)
                      })
                    }}
                  />
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style lang="scss">
  .orphans {
    margin-top: var(--spacing-4);
    border-top: 1px solid var(--theme-divider-color);
  }
  .secondary {
    color: var(--global-secondary-TextColor);
  }
</style>
