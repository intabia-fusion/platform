<!--
// Copyright © 2020, 2021 Anticrm Platform Contributors.
// Copyright © 2021, 2022, 2023, 2024 Hardcore Engineering Inc.
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
  import { Ref, SortingOrder, Status } from '@hcengineering/core'
  import { Asset, getResource } from '@hcengineering/platform'
  import { AttributeEditor, MessageBox, createQuery, getClient } from '@hcengineering/presentation'
  import { ClassAttributes, settingsStore } from '@hcengineering/setting-resources'
  import task, { ProjectType, TaskType, calculateStatuses, findStatusAttr } from '@hcengineering/task'
  import {
    ButtonIcon,
    Icon,
    IconAdd,
    IconDelete,
    IconSquareExpand,
    Label,
    ModernButton,
    Scroller,
    ToggleWithLabel,
    CheckBox,
    getCurrentLocation,
    navigate,
    showPopup
  } from '@hcengineering/ui'
  import { IconPicker, deleteObjects, statusStore } from '@hcengineering/view-resources'
  import { taskTypeStore } from '../..'
  import plugin from '../../plugin'
  import StatesProjectEditor from '../state/StatesProjectEditor.svelte'
  import TaskTypeIcon from './TaskTypeIcon.svelte'
  import TaskTypeRefEditorTable from './TaskTypeRefEditorTable.svelte'

  export let spaceType: ProjectType
  export let objectId: Ref<TaskType>
  export let name: string | undefined
  export let icon: Asset | undefined
  export let color: number | number[] | undefined
  export let readonly: boolean = true

  const client = getClient()

  let taskTypes: TaskType[] = []
  const taskTypesQuery = createQuery()
  $: taskTypesQuery.query(
    task.class.TaskType,
    { _id: { $in: spaceType?.tasks ?? [] } },
    (res) => {
      taskTypes = res
    },
    { sort: { _id: SortingOrder.Ascending } }
  )

  $: taskType = taskTypes.find((tt) => tt._id === objectId)
  $: name = taskType?.name
  $: icon = taskType?.icon
  $: color = taskType?.color !== undefined && typeof taskType?.color !== 'string' ? taskType?.color : undefined
  $: descriptor = client.getModel().findAllSync(task.class.TaskTypeDescriptor, { _id: taskType?.descriptor })
  $: states = (taskType?.statuses.map((p) => $statusStore.byId.get(p)).filter((p) => p !== undefined) as Status[]) ?? []
  $: selectableTaskTypes = taskTypes.filter(
    (tt) => tt._id === objectId || !(tt.allowedAsChildOf ?? []).includes(objectId)
  )

  let isRootTaskType = false
  let initialValueApplied = false

  $: if (!initialValueApplied && taskType !== undefined) {
    isRootTaskType = taskType.isRootTaskType ?? false
    initialValueApplied = true
  }

  $: if (initialValueApplied && taskType !== undefined && isRootTaskType !== (taskType.isRootTaskType ?? false)) {
    void handleIsRootTaskTypeChange(isRootTaskType)
  }

  let tasksCounter: number = 0
  let loading: boolean = true
  const tasksCounterQuery = createQuery()
  $: if (taskType !== undefined) {
    loading = tasksCounterQuery.query(
      task.class.Task,
      { kind: taskType._id },
      (res) => {
        tasksCounter = res.total
        loading = false
      },
      {
        total: true,
        limit: 1,
        projection: {
          _id: 1
        }
      }
    )
  }

  let lastValidName: string | undefined
  $: if (taskType !== undefined) {
    const isDuplicate = taskTypes.some((tt) => tt._id !== taskType._id && isSameString(tt.name, taskType.name))
    if (!isDuplicate) {
      lastValidName = taskType.name
    } else if (lastValidName !== undefined) {
      showPopup(MessageBox, {
        label: plugin.string.TaskType,
        message: plugin.string.TaskTypeNameAlreadyExists
      })
      void client.diffUpdate(taskType, { name: lastValidName })
    }
  }

  async function handleIsRootTaskTypeChange (isRoot: boolean): Promise<void> {
    if (taskType === undefined || readonly) {
      return
    }

    const updates: Partial<TaskType> = { isRootTaskType: isRoot }

    if (isRoot && (taskType.allowedAsChildOf?.length ?? 0) > 0) {
      updates.allowedAsChildOf = []
    }

    await client.diffUpdate(taskType, updates)
  }

  function isSameString (a: string, b: string): boolean {
    return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()
  }

  function selectIcon (el: MouseEvent): void {
    if (readonly) {
      return
    }
    // TODO: Be aware icon equal to descriptor one will not be shown in lists.
    const icons: Asset[] = [descriptor[0].icon]

    showPopup(
      IconPicker,
      { icon: taskType?.icon, color: taskType?.color, icons, showColor: false },
      el.target as HTMLElement,
      async (result) => {
        if (result !== undefined && result !== null && taskType !== undefined) {
          await client.update(taskType, { color: result.color, icon: result.icon })
        }
      }
    )
  }

  function handleAddStatus (): void {
    if (taskType === undefined || readonly) {
      return
    }

    const icons: Asset[] = []
    const attr = findStatusAttr(getClient().getHierarchy(), taskType.ofClass)
    $settingsStore = {
      id: '#',
      component: task.component.CreateStatePopup,
      props: {
        status: undefined,
        taskType,
        _class: taskType.statusClass,
        category: task.statusCategory.Active,
        type: spaceType,
        ofAttribute: attr._id,
        icon: undefined,
        color: 0,
        icons,
        readonly
      }
    }
  }

  $: canDelete = !loading && tasksCounter === 0 && taskTypes.length > 1

  async function handleDelete (): Promise<void> {
    if (!canDelete || readonly || taskType == null) {
      return
    }

    showPopup(MessageBox, {
      label: plugin.string.Delete,
      message: plugin.string.Delete,
      action: async () => {
        if (taskType == null) {
          return
        }

        await deleteObjects(client, [taskType])

        const loc = getCurrentLocation()
        loc.path.length -= 2
        navigate(loc)
      }
    })
  }
  async function showIssuesOfTaskType (): Promise<void> {
    if (taskType == null) return
    const descriptor = client
      .getModel()
      .findAllSync(task.class.TaskTypeDescriptor, { _id: taskType?.descriptor })
      .shift()
    if (descriptor?.openTasks !== undefined) {
      const f = await getResource(descriptor.openTasks)
      await f?.(taskType)
    }
  }
</script>

{#if taskType !== undefined}
  <div class="hulyComponent-content__container columns">
    <div class="hulyComponent-content__column content">
      <Scroller align={'center'} padding={'var(--spacing-3)'} bottomPadding={'var(--spacing-3)'}>
        <div class="hulyComponent-content gap">
          <div class="hulyComponent-content__column-group mt-4">
            <div class="hulyComponent-content__header mb-6">
              <div class="flex-row-center gap-1-5">
                {#if !readonly}
                  <ButtonIcon
                    icon={TaskTypeIcon}
                    iconProps={{ value: taskType, size: 'medium' }}
                    size={'large'}
                    kind={'secondary'}
                    dataId={'btnSelectIcon'}
                    disabled={readonly}
                    on:click={selectIcon}
                  />
                {/if}
              </div>
              <div class="flex-row">
                <ModernButton
                  icon={IconSquareExpand}
                  label={plugin.string.CountTasks}
                  labelParams={{ count: tasksCounter }}
                  disabled={tasksCounter === 0}
                  kind={'tertiary'}
                  size={'medium'}
                  hasMenu
                  on:click={() => {
                    showIssuesOfTaskType()
                  }}
                />
                {#if canDelete}
                  <ButtonIcon
                    icon={IconDelete}
                    size="small"
                    kind="secondary"
                    disabled={readonly}
                    on:click={handleDelete}
                  />
                {/if}
              </div>
            </div>

            <div class="name" class:editable={!readonly}>
              <AttributeEditor
                _class={task.class.TaskType}
                object={taskType}
                key="name"
                editKind={'modern-ghost-large'}
                editable={!readonly}
              />
            </div>
          </div>

          <div class="hulyTableAttr-container">
            <div class="hulyTableAttr-header">
              <span class="label">
                <Label label={plugin.string.RootTaskType} />
              </span>
              <CheckBox bind:checked={isRootTaskType} disabled={readonly} />
            </div>

            {#if !isRootTaskType}
              <TaskTypeRefEditorTable
                value={taskType.allowedAsChildOf}
                types={selectableTaskTypes}
                onChange={(evt) => {
                  if (taskType === undefined) {
                    return
                  }
                  void client.diffUpdate(taskType, { allowedAsChildOf: evt })
                }}
              />
            {/if}
          </div>

          <div class="flex-row-center mt-4 ml-4 mr-4 gap-4">
            <ToggleWithLabel
              label={plugin.string.ShowParentTasks}
              on={taskType.showParentTasks ?? false}
              disabled={readonly}
              on:change={(evt) => {
                if (taskType === undefined) {
                  return
                }
                void client.diffUpdate(taskType, { showParentTasks: evt.detail })
              }}
            />
          </div>

          <div class="hulyTableAttr-container">
            <div class="hulyTableAttr-header font-medium-12">
              <Icon icon={task.icon.ManageTemplates} size={'small'} />
              <span><Label label={plugin.string.ProcessStates} /></span>
              <ButtonIcon
                kind={'primary'}
                icon={IconAdd}
                size={'small'}
                on:click={handleAddStatus}
                disabled={readonly}
              />
            </div>
            <StatesProjectEditor
              {taskType}
              type={spaceType}
              {states}
              {readonly}
              on:delete={async (evt) => {
                if (taskType === undefined) {
                  return
                }
                const index = taskType.statuses.findIndex((p) => p === evt.detail.state._id)
                taskType.statuses.splice(index, 1)
                await client.update(taskType, {
                  statuses: taskType.statuses
                })
                await client.update(spaceType, {
                  statuses: calculateStatuses(spaceType, $taskTypeStore, [
                    { taskTypeId: taskType._id, statuses: taskType.statuses }
                  ])
                })
              }}
              on:move={async (evt) => {
                if (taskType === undefined || readonly) {
                  return
                }
                const index = taskType.statuses.findIndex((p) => p === evt.detail.stateID)
                const state = taskType.statuses.splice(index, 1)[0]

                if (evt.detail.newCategory !== undefined) {
                  const stateDoc = $statusStore.byId.get(evt.detail.stateID)
                  if (stateDoc !== undefined) {
                    await client.update(stateDoc, {
                      category: evt.detail.newCategory
                    })
                  }
                }

                const statuses = [
                  ...taskType.statuses.slice(0, evt.detail.position),
                  state,
                  ...taskType.statuses.slice(evt.detail.position)
                ]
                await client.update(taskType, {
                  statuses
                })

                await client.update(spaceType, {
                  statuses: calculateStatuses(spaceType, $taskTypeStore, [{ taskTypeId: taskType._id, statuses }])
                })
              }}
            />
          </div>

          <ClassAttributes _class={taskType.targetClass} showHierarchy showMixins disabled={readonly} />
        </div>
      </Scroller>
    </div>
  </div>
{/if}

<style lang="scss">
  .name {
    width: 100%;
    font-weight: 500;
    margin-left: 1rem;
    display: flex;
    align-items: center;
    font-size: 1.5rem;

    &.editable {
      margin-left: 0;
    }
  }
</style>
