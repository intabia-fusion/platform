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
  import { Ref } from '@hcengineering/core'
  import { TaskType } from '@hcengineering/task'
  import {
    ButtonIcon,
    DropdownLabelsPopup,
    DropdownTextItem,
    getFocusManager,
    Icon,
    IconAdd,
    IconClose,
    Label,
    showPopup
  } from '@hcengineering/ui'
  import { createEventDispatcher } from 'svelte'
  import TaskTypeIcon from './TaskTypeIcon.svelte'
  import task from '../../plugin'

  export let value: Ref<TaskType>[] = []
  export let onChange: (value: Ref<TaskType>[]) => void
  export let types: TaskType[]
  export let readonly: boolean = false

  let container: HTMLElement
  let opened: boolean = false

  $: items = types.map(
    (p): DropdownTextItem => ({ id: p._id, label: p.name, icon: TaskTypeIcon, iconProps: { value: p } })
  )
  $: selectedItems = types.filter((p) => (value as string[])?.includes(p._id))

  const dispatch = createEventDispatcher()
  const mgr = getFocusManager()

  function removeItem (id: Ref<TaskType>): void {
    if (readonly) return
    value = [...value].filter((v) => v !== id)
    onChange(value)
    dispatch('selected', value)
  }

  function openDropdown (): void {
    if (opened || readonly) return
    opened = true
    showPopup(
      DropdownLabelsPopup,
      { items, selected: [...value], enableSearch: false, multiselect: true },
      container,
      () => {
        opened = false
        mgr?.setFocusPos(-1)
      },
      (result) => {
        if (result != null) {
          value = result
          onChange(value)
          dispatch('selected', result)
        }
      }
    )
  }
</script>

<div class="hulyTableAttr-container">
  <div class="hulyTableAttr-header font-medium-12">
    <span><Label label={task.string.TaskParent} /></span>
    {#if !readonly}
      <div bind:this={container}>
        <ButtonIcon kind={'primary'} icon={IconAdd} size={'small'} pressed={opened} on:click={openDropdown} />
      </div>
    {/if}
  </div>

  {#each selectedItems as item (item._id)}
    <div class="hulyTableAttr-content class">
      <div class="hulyTableAttr-content__row disableMouseOver">
        <div class="row-item">
          <svelte:component this={TaskTypeIcon} value={item} size={'small'} />
          <span class="label overflow-label">{item.name}</span>
        </div>
        {#if !readonly}
          <button
            class="btn-close"
            on:click={() => {
              removeItem(item._id)
            }}
          >
            <Icon icon={IconClose} size={'x-small'} />
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style lang="scss">
  .row-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    min-width: 0;
  }
</style>
