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
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import { Ref } from '@hcengineering/core'
  import { TaskType } from '@hcengineering/task'
  import { ButtonIcon, DropdownTextItem, IconClose, Label, ModernPopupLabels, showPopup } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import TaskTypeIcon from './TaskTypeIcon.svelte'
  import task from '../../plugin'

  export let value: Ref<TaskType>[] = []
  export let onChange: (value: Ref<TaskType>[]) => void
  export let types: TaskType[]
  export let readonly: boolean = false

  $: items = types.map(
    (p): DropdownTextItem => ({ id: p._id, label: p.name, icon: TaskTypeIcon, iconProps: { value: p } })
  )
  $: selectedItems = types.filter((p) => value?.includes(p._id))

  const dispatch = createEventDispatcher()
  let labelEl: HTMLElement | undefined

  function removeItem (id: Ref<TaskType>): void {
    if (readonly) return
    value = value.filter((v) => v !== id)
    onChange(value)
    dispatch('selected', value)
  }

  function handleAdd (target: HTMLElement | undefined): void {
    if (readonly || target == null) return

    showPopup(
      ModernPopupLabels,
      {
        placeholder: task.string.TaskParent,
        items,
        multiselect: true,
        selected: value,
        enableSearch: false
      },
      target,
      (result) => {
        if (result != null) {
          value = result
          onChange(value)
          dispatch('selected', value)
        }
      },
      (result) => {
        if (result != null) {
          value = result
          onChange(value)
          dispatch('selected', value)
        }
      }
    )
  }
</script>

{#if selectedItems.length > 0}
  <div class="hulyTableAttr-content task parent-list">
    {#each selectedItems as item (item._id)}
      <div class="hulyTableAttr-content__row row-with-hover">
        <div class="hulyTableAttr-content__row-icon-wrapper">
          <TaskTypeIcon value={item} size="small" />
        </div>
        <div class="hulyTableAttr-content__row-label grow font-medium-14 overflow-label">
          {item.name}
        </div>
        {#if !readonly}
          <div class="delete-action">
            <ButtonIcon
              icon={IconClose}
              kind="tertiary"
              size="small"
              on:click={(e) => {
                e.stopPropagation()
                removeItem(item._id)
              }}
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

{#if !readonly}
  <button
    type="button"
    class="add-parent-btn font-normal-14 text-secondary"
    on:click={() => {
      handleAdd(labelEl)
    }}
  >
    <span bind:this={labelEl} class="font-normal-14 text-secondary flex-center">
      + <Label label={task.string.TaskParent} />
    </span>
  </button>
{/if}

<style lang="scss">
  .parent-list {
    border-top: 1px solid var(--theme-divider-color);
  }

  .row-with-hover {
    .delete-action {
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
      margin-left: auto;
    }

    &:hover .delete-action {
      opacity: 1;
    }
  }

  .add-parent-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: var(--spacing-2);
    background: transparent;
    border: none;
    border-top: 1px solid var(--theme-divider-color);
    border-radius: 0 0 var(--large-BorderRadius) var(--large-BorderRadius);
    cursor: pointer;
    color: inherit;
    transition: background-color 0.15s ease-in-out;

    &:hover:not(:disabled) {
      background-color: var(--theme-table-header-color);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
</style>
