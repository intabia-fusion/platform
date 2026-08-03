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
  import { createEventDispatcher } from 'svelte'
  import core, { Ref, Status } from '@hcengineering/core'
  import task, { getAllowedChildTaskTypes, TaskType } from '@hcengineering/task'
  import { translate } from '@hcengineering/platform'
  import ui, { DropdownTextItem, Icon, Label, languageStore, ModernDropdownLabels } from '@hcengineering/ui'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { SubtaskStatusesProps, SubtaskStatusesValidatorConfig } from '@hcengineering/workflow'
  import { getClient, IconWithEmoji, reduceCalls } from '@hcengineering/presentation'
  import view from '@hcengineering/view'

  import plugin from '../../../plugin'

  type StatusId = Ref<Status> | 'null'

  export let taskType: TaskType
  export let config: SubtaskStatusesValidatorConfig | undefined = undefined
  export let canSave = false

  const client = getClient()
  const dispatch = createEventDispatcher<{ update: SubtaskStatusesProps }>()

  const allTaskTypes: TaskType[] = client.getModel().findAllSync(task.class.TaskType, {})
  const allStatuses: Status[] = client.getModel().findAllSync(core.class.Status, {})

  let statusesByTaskType: Record<Ref<TaskType>, StatusId[]> = {}
  let dropdownItemsByTaskType: Record<Ref<TaskType>, DropdownTextItem[]> = {}
  let result: SubtaskStatusesProps['statuses'] = {}

  $: projectTypeId = taskType.parent
  $: taskTypeId = taskType._id
  $: relevantTaskTypes = getAllowedChildTaskTypes(projectTypeId, taskTypeId, allTaskTypes)

  $: {
    const updatedStatuses: Record<Ref<TaskType>, StatusId[]> = { ...statusesByTaskType }
    let changed = false
    for (const tt of relevantTaskTypes) {
      if (updatedStatuses[tt._id] == null) {
        changed = true
        const saved = config?.props?.statuses?.[tt._id]
        if (saved === null || saved === undefined) {
          updatedStatuses[tt._id] = ['null']
        } else if (Array.isArray(saved)) {
          updatedStatuses[tt._id] = [...saved]
        }
      }
    }
    if (changed) {
      statusesByTaskType = updatedStatuses
    }
  }

  const updateDropdownItems = reduceCalls(async (taskTypes: TaskType[]): Promise<void> => {
    const map: Record<Ref<TaskType>, DropdownTextItem[]> = {}
    for (const tt of taskTypes) {
      map[tt._id] = await getStatusItems(tt._id)
    }
    dropdownItemsByTaskType = map
  })

  $: void updateDropdownItems(relevantTaskTypes)

  $: {
    const _result: SubtaskStatusesProps['statuses'] = {}
    for (const _taskType of relevantTaskTypes) {
      const selected = statusesByTaskType[_taskType._id]
      if (Array.isArray(selected) && selected.includes('null')) {
        _result[_taskType._id] = null
      } else if (Array.isArray(selected) && selected.length > 0) {
        _result[_taskType._id] = selected as Ref<Status>[]
      }
    }
    result = _result
    canSave = relevantTaskTypes.length > 0 && Object.keys(result).length === relevantTaskTypes.length
    dispatch('update', { statuses: result })
  }

  async function getStatusItems (taskId: Ref<TaskType>): Promise<DropdownTextItem[]> {
    const _taskType = allTaskTypes.find((t) => t._id === taskId)
    const taskStatuses =
      (_taskType?.statuses?.length ?? 0) > 0 ? allStatuses.filter((s) => _taskType?.statuses.includes(s._id)) : []
    return [
      {
        id: 'null',
        label: await translate(plugin.string.AnyStatus, {}, $languageStore),
        exclusive: true
      },
      ...taskStatuses.map(
        (s): DropdownTextItem => ({
          id: s._id,
          label: s.name,
          icon: StatePresenter,
          iconProps: { value: s, shouldShowName: false }
        })
      )
    ]
  }

  function handleStatusChange (ttId: Ref<TaskType>, selected: string[]): void {
    statusesByTaskType = {
      ...statusesByTaskType,
      [ttId]: selected
    }
  }
</script>

<div class="subtask-status">
  <div class="subtask-status--header">
    <span class="subtask-status--column-title">
      <Label label={task.string.TaskType} />
    </span>
    <span class="subtask-status--column-title">
      <Label label={plugin.string.SubtaskStatusRequired} />
    </span>
  </div>

  <div class="subtask-status--rows">
    {#each relevantTaskTypes as tt (tt._id)}
      <div class="subtask-status--row">
        <div class="subtask-status--task-type">
          <Icon
            icon={tt.icon === view.ids.IconWithEmoji ? IconWithEmoji : (tt.icon ?? task.icon.Task)}
            iconProps={tt.icon === view.ids.IconWithEmoji ? { icon: tt.color } : {}}
            size="small"
          />
          <span class="subtask-status--task-type-name">{tt.name}</span>
        </div>
        <div class="subtask-status--statuses">
          <ModernDropdownLabels
            items={dropdownItemsByTaskType[tt._id] ?? []}
            selected={statusesByTaskType[tt._id] ?? []}
            multiselect={true}
            wrap={true}
            autoSelect={false}
            placeholder={ui.string.NotSelected}
            justify="left"
            width="100%"
            on:selected={(ev) => {
              handleStatusChange(tt._id, ev.detail)
            }}
          />
        </div>
      </div>
    {/each}
  </div>
</div>

<style lang="scss">
  .subtask-status {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;

    &--header {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 1rem;
      align-items: center;
      padding-bottom: 0.375rem;
      border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
    }

    &--column-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--global-secondary-TextColor);
    }

    &--rows {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    &--row {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 1rem;
      align-items: center;
    }

    &--task-type {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    &--task-type-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--global-primary-TextColor);
    }

    &--statuses {
      display: flex;
      width: 100%;
    }
  }
</style>
