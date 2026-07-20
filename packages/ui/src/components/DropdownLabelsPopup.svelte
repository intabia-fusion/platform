<!--
// Copyright © 2020 Anticrm Platform Contributors.
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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'
  import { deviceOptionsStore, resizeObserver } from '..'
  import plugin from '../plugin'
  import type { DropdownTextItem } from '../types'
  import IconCheck from './icons/Check.svelte'
  import IconSearch from './icons/Search.svelte'
  import ListView from './ListView.svelte'
  import Icon from './Icon.svelte'
  import EditWithIcon from './EditWithIcon.svelte'

  export let placeholder: IntlString = plugin.string.SearchDots
  export let placeholderParam: any | undefined = undefined
  export let items: DropdownTextItem[]
  export let selected: DropdownTextItem['id'] | Array<DropdownTextItem['id']> | undefined = undefined
  export let multiselect: boolean = false
  export let enableSearch = true

  let search: string = ''
  const dispatch = createEventDispatcher()

  let selection = 0
  let list: ListView

  $: objects = items.filter((x) => x.label.toLowerCase().includes(search.toLowerCase()))

  async function handleSelection (evt: Event | undefined, selection: number): Promise<void> {
    const item = objects[selection]
    if (item == null) {
      return
    }
    if (multiselect && Array.isArray(selected)) {
      const set = new Set(selected)
      if (set.has(item.id)) {
        set.delete(item.id)
      } else {
        set.add(item.id)
      }
      selected = Array.from(set)
      dispatch('update', selected)
    } else {
      dispatch('close', item.id)
    }
  }

  function onKeydown (key: KeyboardEvent): void {
    if (key.code === 'ArrowUp') {
      key.stopPropagation()
      key.preventDefault()
      list.select(selection - 1)
    }
    if (key.code === 'ArrowDown') {
      key.stopPropagation()
      key.preventDefault()
      list.select(selection + 1)
    }
    if (key.code === 'Enter') {
      key.preventDefault()
      key.stopPropagation()
      handleSelection(key, selection)
    }
  }

  function isSelected (
    selected: DropdownTextItem['id'] | Array<DropdownTextItem['id']> | undefined,
    item: DropdownTextItem
  ): boolean {
    if (Array.isArray(selected)) {
      return selected.includes(item.id)
    } else {
      return item.id === selected
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="selectPopup"
  on:keydown={onKeydown}
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
>
  {#if enableSearch}
    <div class="header">
      <EditWithIcon
        icon={IconSearch}
        size={'large'}
        width={'100%'}
        autoFocus={!$deviceOptionsStore.isMobile}
        bind:value={search}
        {placeholder}
        {placeholderParam}
        on:change
      />
    </div>
  {/if}
  <div class="scroll" class:mt-2={!enableSearch}>
    <div class="box">
      <ListView bind:this={list} count={objects.length} bind:selection>
        <svelte:fragment slot="item" let:item={idx}>
          {@const item = objects[idx]}

          <button
            class="menu-item withList w-full flex-row-center"
            on:click={() => {
              if (multiselect && Array.isArray(selected)) {
                if (item.exclusive) {
                  const index = selected.indexOf(item.id)
                  if (index !== -1) {
                    selected = []
                  } else {
                    selected = [item.id]
                  }
                } else {
                  const exclusiveIds = items.filter((it) => it.exclusive).map((it) => it.id)
                  const newSelected = selected.filter((id) => !exclusiveIds.includes(id))
                  const index = newSelected.indexOf(item.id)
                  if (index !== -1) {
                    newSelected.splice(index, 1)
                  } else {
                    newSelected.push(item.id)
                  }
                  selected = newSelected
                }
                dispatch('update', selected)
              } else {
                dispatch('close', item.id)
              }
            }}
          >
            {#if item.icon}
              <div
                style="margin-right: 0.75rem; display: flex; align-items: center; justify-content: center; width: 1.25rem; height: 1.25rem; flex-shrink: 0;"
              >
                <Icon icon={item.icon} size={'small'} iconProps={item.iconProps} />
              </div>
            {/if}
            <div class="label overflow-label flex-grow">{item.label}</div>
            <div class="check">
              {#if isSelected(selected, item)}
                <Icon icon={IconCheck} size={'small'} />
              {/if}
            </div>
          </button>
        </svelte:fragment>
      </ListView>
    </div>
  </div>
  <div class="menu-space" />
</div>
