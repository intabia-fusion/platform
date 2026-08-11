<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import { Ref } from '@hcengineering/core'
  import { TaskType } from '@hcengineering/task'
  import { DropdownLabels, Icon, IconAdd, IconClose, Label } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import task from '../../plugin'
  import TaskTypeIcon from './TaskTypeIcon.svelte'

  export let value: Ref<TaskType>[] = []
  export let onChange: (value: Ref<TaskType>[]) => void
  export let types: TaskType[]

  $: items = types.map((p) => ({ id: p._id, label: p.name, icon: TaskTypeIcon, iconProps: { value: p } })) ?? []
  $: selectedItems = types.filter((p) => value?.includes(p._id))

  const dispatch = createEventDispatcher()

  function removeItem (id: Ref<TaskType>): void {
    value = value.filter((v) => v !== id)
    onChange(value)
    dispatch('selected', value)
  }

  function handleSelected (evt: CustomEvent<Ref<TaskType>[] | null>): void {
    if (evt.detail != null) {
      value = evt.detail
      onChange(value)
      dispatch('selected', value)
    }
  }
</script>

<!-- Add button row -->
<div class="ref-editor-wrapper">
  <div class="hulyModal-content__settingsSet-line">
    <span class="label">
      <Label label={task.string.TaskParent} />
    </span>
    <DropdownLabels
      kind={'primary'}
      size={'small'}
      icon={IconAdd}
      {items}
      selected={value}
      enableSearch={false}
      multiselect={true}
      on:selected={handleSelected}
    >
      <span slot="content"></span>
    </DropdownLabels>
  </div>
  <!-- Selected items -->
  {#each selectedItems as item (item._id)}
    <div class="ref-editor-selected-item">
      {#if item.icon}
        <div class="icon">
          <TaskTypeIcon value={item} size="small" />
        </div>
      {/if}
      <span class="ref-editor-selected-label">{item.name}</span>
      <button
        class="btn-close"
        on:click={() => {
          removeItem(item._id)
        }}
      >
        <Icon icon={IconClose} size={'x-small'} />
      </button>
    </div>
  {/each}
</div>

<style lang="scss">
  .ref-editor-wrapper {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--theme-divider-color);

    /* The inner settingsSet-line should not draw its own border */
    .hulyModal-content__settingsSet-line {
      border: none;
    }
  }

  .ref-editor-selected-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    /* match horizontal padding of settingsSet-line */
    padding: 1rem;

    .icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      color: var(--global-primary-TextColor);
    }
  }

  .ref-editor-selected-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    color: var(--global-primary-TextColor);
  }
</style>
