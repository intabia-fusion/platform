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
  import core, { type IdMap, type Ref, type Status, type StatusCategory } from '@hcengineering/core'
  import task, { type TaskType } from '@hcengineering/task'
  import type { TaskStatusesProps, WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { getClient, IconWithEmoji } from '@hcengineering/presentation'
  import { Icon, Label } from '@hcengineering/ui'
  import { StatePresenter, StatusCategoryIcon, taskTypeStore } from '@hcengineering/task-resources'
  import view from '@hcengineering/view'

  import plugin from '../../../plugin'
  import AnyStatusIcon from '../../icon/AnyStatus.svelte'

  export let config: WorkflowValidatorConfig<TaskStatusesProps>

  const client = getClient()
  const allStatuses: Status[] = client.getModel().findAllSync(core.class.Status, {})
  const allCategories: StatusCategory[] = client
    .getModel()
    .findAllSync(core.class.StatusCategory, {})
    .sort((a, b) => a.order - b.order)

  interface RowData {
    id: Ref<TaskType>
    taskType: TaskType | undefined
    taskTypeName: string
    statuses: Status[]
    categories: StatusCategory[]
    isAny: boolean
  }

  $: rows = getRows(config?.props, $taskTypeStore)
  $: defaultCategories = getCategories(config?.props?.defaultCategories)

  function getCategories (ids: unknown): StatusCategory[] {
    return Array.isArray(ids) ? allCategories.filter((c) => ids.includes(c._id)) : []
  }

  function getRows (props: TaskStatusesProps | undefined, taskTypes: IdMap<TaskType>): RowData[] {
    const ids = new Set<Ref<TaskType>>([
      ...(Object.keys(props?.statuses ?? {}) as Array<Ref<TaskType>>),
      ...(Object.keys(props?.categories ?? {}) as Array<Ref<TaskType>>)
    ])
    // A task type with an empty setting is checked like all task types, so it gets no row of its own
    const hasOwn = (ttId: Ref<TaskType>): boolean => {
      const stIds = props?.statuses?.[ttId]
      const catIds = props?.categories?.[ttId]
      return (
        stIds === null || (Array.isArray(stIds) && stIds.length > 0) || (Array.isArray(catIds) && catIds.length > 0)
      )
    }
    return Array.from(ids)
      .filter(hasOwn)
      .map((ttId) => {
        const tt = taskTypes.get(ttId)
        const stIds = props?.statuses?.[ttId]
        const isAny = stIds === null || (Array.isArray(stIds) && stIds.includes('null' as Ref<Status>))
        return {
          id: ttId,
          taskType: tt,
          taskTypeName: tt?.name ?? ttId,
          statuses: Array.isArray(stIds) && !isAny ? allStatuses.filter((s) => stIds.includes(s._id)) : [],
          categories: isAny ? [] : getCategories(props?.categories?.[ttId]),
          isAny
        }
      })
  }
</script>

<div class="task-statuses-presenter">
  {#if defaultCategories.length > 0}
    <div class="task-statuses-presenter--row">
      <div class="task-statuses-presenter--label">
        <span><Label label={plugin.string.AllTaskTypes} />:</span>
      </div>
      <div class="task-statuses-presenter--status-list">
        {#each defaultCategories as cat (cat._id)}
          <span class="task-statuses-presenter--item">
            <StatusCategoryIcon value={cat} />
            <Label label={cat.label} />
          </span>
        {/each}
      </div>
    </div>
  {/if}

  {#each rows as row (row.id)}
    <div class="task-statuses-presenter--row">
      <div class="task-statuses-presenter--label">
        {#if row.taskType?.icon}
          <Icon
            icon={row.taskType.icon === view.ids.IconWithEmoji ? IconWithEmoji : (row.taskType.icon ?? task.icon.Task)}
            iconProps={row.taskType.icon === view.ids.IconWithEmoji ? { icon: row.taskType.color } : {}}
            size="small"
          />
        {/if}
        <span>{row.taskTypeName}:</span>
      </div>

      <div class="task-statuses-presenter--status-list">
        {#if row.isAny}
          <span class="task-statuses-presenter--item">
            <AnyStatusIcon />
            <Label label={plugin.string.AnyStatus} />
          </span>
        {:else if row.statuses.length > 0 || row.categories.length > 0}
          {#each row.categories as cat (cat._id)}
            <span class="task-statuses-presenter--item">
              <StatusCategoryIcon value={cat} />
              <Label label={cat.label} />
            </span>
          {/each}
          {#each row.statuses as st (st._id)}
            <span class="task-statuses-presenter--item">
              <StatePresenter value={st} shouldShowName={false} taskType={row.id} />
              <span>{st.name}</span>
            </span>
          {/each}
        {:else}
          <span class="task-statuses-presenter--none-badge">—</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style lang="scss">
  .task-statuses-presenter {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;

    &--row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    &--label {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--global-secondary-TextColor);

      :global(svg) {
        width: 0.875rem !important;
        height: 0.875rem !important;
        min-width: 0.875rem !important;
        min-height: 0.875rem !important;
        max-width: 0.875rem !important;
        max-height: 0.875rem !important;
        flex-shrink: 0;
      }
    }

    &--status-list {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem 0.75rem;
      flex-wrap: wrap;
    }

    &--item {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.75rem;
      color: var(--global-primary-TextColor);
    }

    &--none-badge {
      font-size: 0.75rem;
      color: var(--global-tertiary-TextColor);
    }
  }
</style>
