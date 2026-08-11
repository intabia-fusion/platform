<script lang="ts">
  import { Class, Doc, Ref, toIdMap } from '@hcengineering/core'
  import { getEmbeddedLabel } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import task, { ProjectType, TaskType } from '@hcengineering/task'
  import { ButtonKind, ButtonSize, DropdownLabelsIntl, type DropdownIntlItem } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import { taskTypeStore } from '../..'
  import TaskTypeIcon from './TaskTypeIcon.svelte'

  export let value: Ref<TaskType> | undefined
  export let projectType: Ref<ProjectType> | undefined
  export let parentType: Ref<TaskType> | undefined = undefined
  export let focusIndex: number = -1
  export let baseClass: Ref<Class<Doc>> | undefined = undefined
  export let kind: ButtonKind = 'regular'
  export let size: ButtonSize = 'medium'
  export let justify: 'left' | 'center' = 'center'
  export let width: string | undefined = undefined
  export let showAlways: boolean = false

  const client = getClient()

  $: taskTypeDescriptors = toIdMap(client.getModel().findAllSync(task.class.TaskTypeDescriptor, {}))

  $: allItems = Array.from($taskTypeStore.values()).filter(
    (it) =>
      it.parent === projectType &&
      (taskTypeDescriptors.get(it.descriptor)?.allowCreate ?? false) &&
      (baseClass === undefined || client.getHierarchy().isDerived(it.targetClass, baseClass))
  )

  $: childItems = allItems.filter((it) => parentType !== undefined && (it.allowedAsChildOf ?? []).includes(parentType))

  $: freeItems = allItems.filter(
    (it) => (it.allowedAsChildOf ?? []).length === 0 && it.isRootTaskType !== true && it._id !== parentType
  )

  $: items = (parentType === undefined ? allItems : childItems.length > 0 ? childItems : freeItems).map((it) => ({
    id: it._id,
    label: getEmbeddedLabel(it.name),
    icon: TaskTypeIcon,
    iconProps: { value: it }
  })) as DropdownIntlItem[]

  $: if (
    (value === undefined && items.length > 0) ||
    (items.length > 0 && items.find((it) => it.id === value) === undefined)
  ) {
    value = items[0].id as Ref<TaskType>
    change()
  }

  const dispatch = createEventDispatcher()

  function change () {
    dispatch('change', value)
  }
</script>

{#if projectType !== undefined && (items.length > 1 || showAlways)}
  <DropdownLabelsIntl
    {focusIndex}
    {kind}
    {size}
    {items}
    {justify}
    {width}
    icon={TaskTypeIcon}
    iconProps={value !== undefined ? { value: $taskTypeStore.get(value) } : {}}
    dataId={'btnSelectTaskType'}
    bind:selected={value}
    on:selected={change}
  />
{/if}
