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
  import task, { getAllowedParentTaskTypes, TaskType } from '@hcengineering/task'
  import { translate } from '@hcengineering/platform'
  import ui, { DropdownTextItem, Icon, Label, languageStore, ModernDropdownLabels } from '@hcengineering/ui'
  import { StatePresenter } from '@hcengineering/task-resources'
  import { WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { getClient, reduceCalls } from '@hcengineering/presentation'

  import plugin from '../../../plugin'

  interface Props {
    statuses: Record<Ref<TaskType>, Ref<Status>[] | null>
  }

  type StatusId = Ref<Status> | 'null'

  export let taskType: TaskType
  export let config: WorkflowValidatorConfig | undefined = undefined
  export let canSave = false

  const client = getClient()
  const dispatch = createEventDispatcher<{ update: Props }>()

  const allTaskTypes: TaskType[] = client.getModel().findAllSync(task.class.TaskType, {})
  const allStatuses: Status[] = client.getModel().findAllSync(core.class.Status, {})

  let statusesMap: Record<Ref<TaskType>, StatusId[]> = {}
  let statusItemsMap: Record<Ref<TaskType>, DropdownTextItem[]> = {}

  $: projectTypeId = taskType.parent
  $: taskTypeId = taskType._id

  $: relevantTaskTypes = getAllowedParentTaskTypes(projectTypeId, taskTypeId, allTaskTypes)

  $: {
    const updated: Record<Ref<TaskType>, StatusId[]> = { ...statusesMap }
    let changed = false
    for (const tt of relevantTaskTypes) {
      if (updated[tt._id] == null) {
        changed = true
        const saved = config?.props?.statuses?.[tt._id]
        if (saved === null || saved === undefined) {
          updated[tt._id] = ['null']
        } else if (Array.isArray(saved)) {
          updated[tt._id] = [...saved]
        }
      }
    }
    if (changed) {
      statusesMap = updated
    }
  }

  $: void updateStatusItems(relevantTaskTypes)

  $: {
    const result: Props['statuses'] = {}
    for (const tt of relevantTaskTypes) {
      const selected = statusesMap[tt._id]
      if (Array.isArray(selected) && selected.includes('null')) {
        result[tt._id] = null
      } else if (Array.isArray(selected) && selected.length > 0) {
        result[tt._id] = selected as Ref<Status>[]
      }
    }
    canSave = relevantTaskTypes.length > 0 && Object.keys(result).length === relevantTaskTypes.length
    dispatch('update', { statuses: result })
  }

  async function getStatusItems (taskId: Ref<TaskType>): Promise<DropdownTextItem[]> {
    const tt = allTaskTypes.find((t) => t._id === taskId)
    const list = allStatuses.filter((s) => tt?.statuses.includes(s._id))
    return [
      {
        id: 'null',
        label: await translate(plugin.string.AnyStatus, {}, $languageStore),
        exclusive: true
      },
      ...list.map(
        (s): DropdownTextItem => ({
          id: s._id,
          label: s.name,
          icon: StatePresenter,
          iconProps: { value: s, shouldShowName: false }
        })
      )
    ]
  }

  const updateStatusItems = reduceCalls(async (taskTypes: TaskType[]): Promise<void> => {
    const map: Record<Ref<TaskType>, DropdownTextItem[]> = {}
    for (const tt of taskTypes) {
      map[tt._id] = await getStatusItems(tt._id)
    }
    statusItemsMap = map
  })

  function handleStatusChange (ttId: Ref<TaskType>, selected: string[]): void {
    statusesMap = {
      ...statusesMap,
      [ttId]: selected
    }
  }
</script>

<div class="parent-status">
  <div class="parent-status--header">
    <span class="parent-status--column-title">
      <Label label={task.string.TaskType} />
    </span>
    <span class="parent-status--column-title">
      <Label label={plugin.string.ParentStatusRequired} />
    </span>
  </div>

  <div class="parent-status--rows">
    {#each relevantTaskTypes as tt (tt._id)}
      <div class="parent-status--row">
        <div class="parent-status--task-type">
          {#if tt.icon}
            <Icon icon={tt.icon} size="small" />
          {/if}
          <span class="parent-status--task-type-name">{tt.name}</span>
        </div>
        <div class="parent-status--statuses">
          <ModernDropdownLabels
            items={statusItemsMap[tt._id] ?? []}
            selected={statusesMap[tt._id] ?? []}
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
  .parent-status {
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
