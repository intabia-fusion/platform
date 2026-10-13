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
  import type { TaskType } from '@hcengineering/task'
  import { getAllowedParentTaskTypes } from '@hcengineering/task'
  import { Icon, IconInfo, IconOpenedArrow, Label } from '@hcengineering/ui'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { ParentStatusesValidatorConfig } from '@hcengineering/workflow'

  import { navigateToTaskType } from '../../../location'
  import plugin from '../../../plugin'
  import TaskStatusesEditor from './TaskStatusesEditor.svelte'

  export let taskType: TaskType
  export let config: ParentStatusesValidatorConfig | undefined = undefined
  export let canSave = false

  $: relevantTaskTypes = getAllowedParentTaskTypes(taskType.parent, taskType._id, Array.from($taskTypeStore.values()))
  $: if (relevantTaskTypes.length === 0) canSave = false

  function handleConfigureTaskType (): void {
    if (taskType?._id != null) {
      navigateToTaskType(taskType._id, true)
    }
  }
</script>

{#if relevantTaskTypes.length > 0}
  <TaskStatusesEditor taskTypes={relevantTaskTypes} {config} bind:canSave on:update />
{:else}
  <button type="button" class="parent-status--hint" on:click={handleConfigureTaskType}>
    <span class="parent-status--hint-icon">
      <Icon icon={IconInfo} size="small" />
    </span>
    <span class="parent-status--hint-text">
      <Label label={plugin.string.NoParentTaskTypesDescription} />
    </span>
    <span class="parent-status--hint-action">
      <span>
        <Label label={plugin.string.ConfigureTaskType} params={{ name: taskType.name }} />
      </span>
      <span class="parent-status--hint-arrow">
        <Icon icon={IconOpenedArrow} size="x-small" />
      </span>
    </span>
  </button>
{/if}

<style lang="scss">
  .parent-status {
    &--hint {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.625rem 0.875rem;
      border: 1px solid var(--global-subtle-ui-BorderColor);
      border-radius: var(--medium-BorderRadius);
      background-color: var(--global-ui-highlight-BackgroundColor);
      box-sizing: border-box;
      width: 100%;
      text-align: left;
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        border-color 0.15s ease;

      &:hover {
        background-color: var(--global-ui-active-BackgroundColor);
        border-color: var(--global-subtle-ui-BorderColor);

        .parent-status--hint-action {
          color: var(--primary-color-purple-01, #513ecd);
        }

        .parent-status--hint-arrow {
          transform: translateX(2px);
        }
      }
    }

    &--hint-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--global-secondary-TextColor);
      flex-shrink: 0;
    }

    &--hint-text {
      font-size: 0.8125rem;
      line-height: 1.35;
      color: var(--global-secondary-TextColor);
      flex: 1;
      min-width: 0;
    }

    &--hint-action {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--primary-color-purple-02, #6452db);
      white-space: nowrap;
      flex-shrink: 0;
      transition: color 0.15s ease;
    }

    &--hint-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
  }
</style>
