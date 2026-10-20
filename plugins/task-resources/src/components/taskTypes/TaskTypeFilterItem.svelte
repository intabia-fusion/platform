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
  import type { Ref } from '@hcengineering/core'
  import type { TaskType } from '@hcengineering/task'
  import { taskTypeStore, typeStore } from '../../'
  import TaskTypeIcon from './TaskTypeIcon.svelte'

  export let value: TaskType | Ref<TaskType> | undefined

  $: _value = typeof value === 'string' ? $taskTypeStore.get(value) : value
  $: _parent = _value !== undefined ? $typeStore.get(_value.parent) : undefined
</script>

{#if _value !== undefined}
  <span class="item flex-row-center gap-1">
    <TaskTypeIcon value={_value} size="small" />
    <span class="flex-no-shrink">{_value.name}</span>
    {#if _parent?.name !== undefined}
      <span class="project flex-no-shrink">·</span>
      <span class="project overflow-label">{_parent.name}</span>
    {/if}
  </span>
{/if}

<style lang="scss">
  .item {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  // Project type is a secondary detail, the type name comes first and stays visible
  .project {
    color: var(--theme-dark-color);
  }
</style>
