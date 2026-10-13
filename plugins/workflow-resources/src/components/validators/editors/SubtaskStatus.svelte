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
  import { getAllowedChildTaskTypes } from '@hcengineering/task'
  import { Icon, IconInfo, IconOpenedArrow, Label } from '@hcengineering/ui'
  import { taskTypeStore } from '@hcengineering/task-resources'
  import type { SubtaskStatusesValidatorConfig } from '@hcengineering/workflow'

  import { navigateToTaskTypes } from '../../../location'
  import plugin from '../../../plugin'
  import TaskStatusesEditor from './TaskStatusesEditor.svelte'

  export let taskType: TaskType
  export let config: SubtaskStatusesValidatorConfig | undefined = undefined
  export let canSave = false

  $: relevantTaskTypes = getAllowedChildTaskTypes(taskType.parent, taskType._id, Array.from($taskTypeStore.values()))
  $: if (relevantTaskTypes.length === 0) canSave = false

  function handleConfigureTaskTypes (): void {
    navigateToTaskTypes(true)
  }
</script>

{#if relevantTaskTypes.length > 0}
  <TaskStatusesEditor taskTypes={relevantTaskTypes} {config} bind:canSave on:update />
{:else}
  <button type="button" class="subtask-status--hint" on:click={handleConfigureTaskTypes}>
    <span class="subtask-status--hint-icon">
      <Icon icon={IconInfo} size="small" />
    </span>
    <span class="subtask-status--hint-text">
      <Label label={plugin.string.NoSubtaskTypesDescription} />
    </span>
    <span class="subtask-status--hint-action">
      <span>
        <Label label={plugin.string.ConfigureTaskTypes} />
      </span>
      <span class="subtask-status--hint-arrow">
        <Icon icon={IconOpenedArrow} size="x-small" />
      </span>
    </span>
  </button>
{/if}

<style lang="scss">
  .subtask-status {
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

        .subtask-status--hint-action {
          color: var(--primary-color-purple-01, #513ecd);
        }

        .subtask-status--hint-arrow {
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
