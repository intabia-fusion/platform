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
  import type { IntlString } from '@hcengineering/platform'
  import { createEventDispatcher } from 'svelte'

  import { deviceOptionsStore, resizeObserver } from '..'
  import plugin from '../plugin'
  import type { DropdownTextItem } from '../types'
  import IconCheck from './icons/Check.svelte'
  import Icon from './Icon.svelte'
  import Scroller from './Scroller.svelte'
  import ModernEditbox from './ModernEditbox.svelte'

  export let placeholder: IntlString = plugin.string.SearchDots
  export let items: DropdownTextItem[] = []
  export let selected: DropdownTextItem['id'] | Array<DropdownTextItem['id']> | undefined = undefined
  export let multiselect: boolean = false
  export let enableSearch: boolean = true

  let search: string = ''
  const dispatch = createEventDispatcher()
  const btns: HTMLButtonElement[] = []

  $: filteredItems = (items ?? []).filter((x) => {
    if (!search.trim()) return true
    return x.label.toLowerCase().includes(search.toLowerCase().trim())
  })

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

  function handleItemClick (item: DropdownTextItem): void {
    if (multiselect && Array.isArray(selected)) {
      const index = selected.indexOf(item.id)
      if (index !== -1) {
        selected.splice(index, 1)
        selected = [...selected]
      } else {
        selected = [...(selected ?? []), item.id]
      }
      dispatch('update', selected)
    } else {
      dispatch('close', item.id)
    }
  }

  const keyDown = (ev: KeyboardEvent, n: number): void => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault()
      if (n === btns.length - 1) btns[0]?.focus()
      else btns[n + 1]?.focus()
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault()
      if (n === 0) btns[btns.length - 1]?.focus()
      else btns[n - 1]?.focus()
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="hulyPopup-container" use:resizeObserver={() => dispatch('changeContent')}>
  {#if enableSearch}
    <div class="search-wrapper">
      <ModernEditbox
        bind:value={search}
        label={placeholder}
        size="small"
        kind="default"
        autoFocus={!$deviceOptionsStore.isMobile}
      />
    </div>
  {/if}

  <Scroller padding={'var(--spacing-0_5)'} gap={'flex-gap-0-5'}>
    {#each filteredItems as item, i (item.id)}
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      <button
        bind:this={btns[i]}
        class="hulyPopup-row"
        class:selected={isSelected(selected, item)}
        on:mouseover={(ev) => {
          ev.currentTarget.focus()
        }}
        on:keydown={(ev) => {
          keyDown(ev, i)
        }}
        on:click={() => {
          handleItemClick(item)
        }}
      >
        {#if item.icon}
          <span class="hulyPopup-row__icon">
            <Icon icon={item.icon} iconProps={item.iconProps} size="small" />
          </span>
        {/if}

        <span class="hulyPopup-row__label overflow-label">
          {item.label}
        </span>

        {#if isSelected(selected, item)}
          <span class="hulyPopup-row__icon">
            <IconCheck size="small" />
          </span>
        {/if}
      </button>
    {/each}
  </Scroller>
</div>

<style lang="scss">
  .search-wrapper {
    padding: var(--spacing-1) var(--spacing-1_5);
    border-bottom: 1px solid var(--theme-divider-color);
  }
</style>
