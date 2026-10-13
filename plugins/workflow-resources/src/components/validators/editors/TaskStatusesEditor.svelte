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
  import core, { type Ref, type Status, type StatusCategory } from '@hcengineering/core'
  import task, { type TaskType } from '@hcengineering/task'
  import { translate } from '@hcengineering/platform'
  import type { DropdownTextItem } from '@hcengineering/ui'
  import { Icon, Label, languageStore, ModernDropdownLabels } from '@hcengineering/ui'
  import { StatePresenter, StatusCategoryIcon } from '@hcengineering/task-resources'
  import type { TaskStatusesProps, WorkflowValidatorConfig } from '@hcengineering/workflow'
  import { getClient, IconWithEmoji, reduceCalls } from '@hcengineering/presentation'
  import view from '@hcengineering/view'

  import plugin from '../../../plugin'
  import AnyStatusIcon from '../../icon/AnyStatus.svelte'
  import SameAsAllIcon from '../../icon/SameAsAll.svelte'
  import SelectedStatuses from './SelectedStatuses.svelte'

  type ItemId = DropdownTextItem['id']

  export let taskTypes: TaskType[]
  export let config: WorkflowValidatorConfig<TaskStatusesProps> | undefined = undefined
  export let canSave = false

  const anyStatusId = 'null'
  const inheritId = 'inherit'

  const client = getClient()
  const dispatch = createEventDispatcher<{ update: TaskStatusesProps }>()

  const allStatuses: Status[] = client.getModel().findAllSync(core.class.Status, {})
  const allCategories: StatusCategory[] = client
    .getModel()
    .findAllSync(core.class.StatusCategory, {})
    .sort((a, b) => a.order - b.order)
  const categoryIds = new Set<ItemId>(allCategories.map((c) => c._id))

  let selectedByTaskType: Record<Ref<TaskType>, ItemId[]> = {}
  let defaultSelected: ItemId[] = [...(config?.props?.defaultCategories ?? [])]
  let itemsByTaskType: Record<Ref<TaskType>, DropdownTextItem[]> = {}
  let defaultItems: DropdownTextItem[] = []
  let inheritLabel = ''

  $: {
    const updated = { ...selectedByTaskType }
    let changed = false
    for (const tt of taskTypes) {
      if (updated[tt._id] !== undefined) continue
      changed = true
      const statuses = config?.props?.statuses?.[tt._id]
      const categories = config?.props?.categories?.[tt._id]
      updated[tt._id] =
        statuses === null
          ? [anyStatusId]
          : [...(Array.isArray(categories) ? categories : []), ...(Array.isArray(statuses) ? statuses : [])]
    }
    if (changed) {
      selectedByTaskType = updated
    }
  }

  const updateItems = reduceCalls(async (taskTypes: TaskType[], lang: string): Promise<void> => {
    const anyStatus: DropdownTextItem = {
      id: anyStatusId,
      label: await translate(plugin.string.AnyStatus, {}, lang),
      icon: AnyStatusIcon,
      exclusive: true
    }
    const inherit: DropdownTextItem = {
      id: inheritId,
      label: await translate(plugin.string.SameAsAllTaskTypes, {}, lang),
      icon: SameAsAllIcon,
      exclusive: true
    }
    const categoryLabels = new Map<Ref<StatusCategory>, string>()
    for (const c of allCategories) {
      categoryLabels.set(c._id, await translate(c.label, {}, lang))
    }
    const toCategoryItems = (categories: StatusCategory[]): DropdownTextItem[] =>
      categories.map((c, i) => ({
        id: c._id,
        label: categoryLabels.get(c._id) ?? c._id,
        icon: StatusCategoryIcon,
        iconProps: { value: c },
        separatorLabel: i === 0 ? plugin.string.StatusCategories : undefined
      }))

    const map: Record<Ref<TaskType>, DropdownTextItem[]> = {}
    for (const tt of taskTypes) {
      const statuses = allStatuses.filter((s) => tt.statuses.includes(s._id))
      // A saved category stays visible, otherwise it could not be removed
      const usedCategories = new Set([
        ...statuses.map((s) => s.category),
        ...(config?.props?.categories?.[tt._id] ?? [])
      ])
      map[tt._id] = [
        inherit,
        anyStatus,
        ...toCategoryItems(allCategories.filter((c) => usedCategories.has(c._id))),
        ...statuses.map(
          (s, i): DropdownTextItem => ({
            id: s._id,
            label: s.name,
            icon: StatePresenter,
            iconProps: { value: s, shouldShowName: false, taskType: tt._id },
            separatorLabel: i === 0 ? plugin.string.Statuses : undefined
          })
        )
      ]
    }
    itemsByTaskType = map
    defaultItems = [anyStatus, ...toCategoryItems(allCategories)]
    inheritLabel = inherit.label
  })

  $: void updateItems(taskTypes, $languageStore)

  $: {
    const statuses: TaskStatusesProps['statuses'] = {}
    const categories: Record<Ref<TaskType>, Ref<StatusCategory>[]> = {}
    for (const tt of taskTypes) {
      const selected = selectedByTaskType[tt._id] ?? []
      if (selected.includes(anyStatusId)) {
        statuses[tt._id] = null
        continue
      }
      const selectedStatuses = selected.filter((id) => !categoryIds.has(id)) as Ref<Status>[]
      const selectedCategories = selected.filter((id) => categoryIds.has(id)) as Ref<StatusCategory>[]
      if (selectedStatuses.length > 0) statuses[tt._id] = selectedStatuses
      if (selectedCategories.length > 0) categories[tt._id] = selectedCategories
    }
    const defaultCategories = defaultSelected.filter((id) => categoryIds.has(id)) as Ref<StatusCategory>[]

    const props: TaskStatusesProps = { statuses }
    if (Object.keys(categories).length > 0) props.categories = categories
    if (defaultCategories.length > 0) props.defaultCategories = defaultCategories

    canSave =
      taskTypes.length > 0 &&
      (Object.keys(statuses).length > 0 || props.categories !== undefined || props.defaultCategories !== undefined)
    dispatch('update', props)
  }

  $: defaultShown = defaultSelected.some((id) => categoryIds.has(id)) ? defaultSelected : [anyStatusId]

  function toList (selected: ItemId | ItemId[] | undefined | null): ItemId[] {
    return Array.isArray(selected) ? selected : selected != null ? [selected] : []
  }

  function pick (items: DropdownTextItem[] | undefined, selected: ItemId[] | undefined): DropdownTextItem[] {
    return (items ?? []).filter((it) => it.id !== inheritId && (selected ?? []).includes(it.id))
  }

  function inheritPrefix (label: string): DropdownTextItem {
    return { id: inheritId, label: `${label}:`, icon: SameAsAllIcon }
  }
</script>

<div class="task-statuses">
  <div class="task-statuses--row task-statuses--default">
    <div class="task-statuses--label">
      <span class="task-statuses--name"><Label label={plugin.string.AllTaskTypes} /></span>
      <span class="task-statuses--hint"><Label label={plugin.string.AllTaskTypesHint} /></span>
    </div>
    <ModernDropdownLabels
      items={defaultItems}
      selected={defaultShown}
      multiselect={true}
      wrap={true}
      autoSelect={false}
      showDropdownIcon={true}
      categoryKind="heading"
      justify="left"
      width="100%"
      on:selected={(ev) => {
        defaultSelected = toList(ev.detail)
      }}
    >
      <svelte:fragment slot="content">
        <SelectedStatuses items={pick(defaultItems, defaultShown)} />
      </svelte:fragment>
    </ModernDropdownLabels>
  </div>

  {#each taskTypes as tt (tt._id)}
    {@const selected = selectedByTaskType[tt._id] ?? []}
    <div class="task-statuses--row">
      <div class="task-statuses--label task-statuses--task-type">
        <Icon
          icon={tt.icon === view.ids.IconWithEmoji ? IconWithEmoji : (tt.icon ?? task.icon.Task)}
          iconProps={tt.icon === view.ids.IconWithEmoji ? { icon: tt.color } : {}}
          size="small"
        />
        <span class="task-statuses--name">{tt.name}</span>
      </div>
      <ModernDropdownLabels
        items={itemsByTaskType[tt._id] ?? []}
        selected={selected.length > 0 ? selected : [inheritId]}
        multiselect={true}
        wrap={true}
        autoSelect={false}
        showDropdownIcon={true}
        categoryKind="heading"
        justify="left"
        width="100%"
        on:selected={(ev) => {
          selectedByTaskType = {
            ...selectedByTaskType,
            [tt._id]: toList(ev.detail).filter((id) => id !== inheritId)
          }
        }}
      >
        <svelte:fragment slot="content">
          {#if selected.length > 0}
            <SelectedStatuses items={pick(itemsByTaskType[tt._id], selected)} />
          {:else}
            <SelectedStatuses prefix={inheritPrefix(inheritLabel)} items={pick(defaultItems, defaultShown)} />
          {/if}
        </svelte:fragment>
      </ModernDropdownLabels>
    </div>
  {/each}
</div>

<style lang="scss">
  .task-statuses {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;

    // In wrap mode the dropdown does not stretch its content, so the arrow would stick to the last item
    :global(.dropdown-content-wrapper > .content) {
      flex-grow: 1;
    }

    &--row {
      display: grid;
      grid-template-columns: 180px 1fr;
      gap: 1rem;
      align-items: center;
    }

    &--default {
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--global-subtle-ui-BorderColor);
    }

    &--label {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
    }

    &--task-type {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }

    &--name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--global-primary-TextColor);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--hint {
      font-size: 0.75rem;
      color: var(--global-secondary-TextColor);
    }
  }
</style>
