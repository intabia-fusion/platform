<script lang="ts">
  import { Class } from '@intabiafusion/core'
  import { getClient } from '@intabiafusion/presentation'
  import { Task } from '@intabiafusion/task'
  import task from '../../plugin'
  import { typeStore } from '../..'

  export let value: Class<Task>
  const client = getClient()

  $: asValue = client.getHierarchy().hasMixin(value, task.mixin.TaskTypeClass)
    ? client.getHierarchy().as(value, task.mixin.TaskTypeClass)
    : undefined

  $: typeName = asValue !== undefined ? $typeStore.get(asValue.projectType) : undefined
</script>

{#if typeName}
  ({typeName.name})
{/if}
