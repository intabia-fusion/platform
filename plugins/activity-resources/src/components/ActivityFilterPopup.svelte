<!--
// Copyright © 2025 Anticrm Platform Contributors.
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
  import { createEventDispatcher, onMount } from 'svelte'
  import { CheckBox, Label, MiniToggle, resizeObserver } from '@hcengineering/ui'
  import { ActivityMessagesFilter } from '@hcengineering/activity'
  import { Ref } from '@hcengineering/core'

  import activity from '../plugin'
  import { activityDirectionStore } from '../stores'
  import { ActivityDirection } from '../types'

  export let enabledFilters: Ref<ActivityMessagesFilter>[] = []
  export let filters: ActivityMessagesFilter[] = []
  export let showDirectionSetting = true

  const dispatch = createEventDispatcher()

  let popup: HTMLElement
  $: popup?.focus()

  const btns: HTMLElement[] = []
  let activeElement: HTMLElement

  const keyDown = (ev: KeyboardEvent): void => {
    const n = btns.indexOf(activeElement) ?? 0
    if (ev.key === ' ' || ev.key === 'Enter') {
      ev.preventDefault()
      ev.stopPropagation()
      btns[n].focus()
      btns[n].click()
    }
    if (ev.key === 'ArrowDown') {
      if (n < btns.length - 1) {
        activeElement = btns[n + 1]
      }
      ev.preventDefault()
      ev.stopPropagation()
    }
    if (ev.key === 'ArrowUp') {
      if (n > 0) {
        activeElement = btns[n - 1]
      }
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  function toggleItem (id: Ref<ActivityMessagesFilter>): void {
    if (enabledFilters.includes(id)) {
      enabledFilters = enabledFilters.filter((it) => it !== id)
    } else {
      enabledFilters = [...enabledFilters, id]
    }
    dispatch('update', enabledFilters)
  }

  onMount(() => {
    if (btns[0] != null) {
      btns[0].focus()
    }
  })
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="antiPopup"
  use:resizeObserver={() => {
    dispatch('changeContent')
  }}
  on:keydown={keyDown}
>
  <div class="ap-space" />
  <div class="ap-scroll">
    <div class="ap-box" bind:this={popup}>
      {#if showDirectionSetting}
        <div class="ml-3 mt-2 mb-2 mr-3">
          <MiniToggle
            on={$activityDirectionStore === ActivityDirection.Backward}
            label={activity.string.NewestFirst}
            on:change={() => {
              activityDirectionStore.set(
                $activityDirectionStore === ActivityDirection.Backward
                  ? ActivityDirection.Forward
                  : ActivityDirection.Backward
              )
            }}
          />
        </div>
      {/if}
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      {#each filters as item, i}
        <button
          bind:this={btns[i]}
          class="ap-menuItem flex-row-center withIcon"
          class:hover={btns[i] === activeElement}
          on:mousemove={() => {
            if (btns[i] !== activeElement) activeElement = btns[i]
          }}
          on:click={() => {
            toggleItem(item._id)
          }}
        >
          <span class="flex-center justify-end mr-3 pointer-events-none">
            <CheckBox
              checked={enabledFilters.includes(item._id)}
              symbol={!enabledFilters.includes(item._id) ? 'minus' : 'check'}
            />
          </span>
          <span class="overflow-label">
            <Label label={item.label} />
          </span>
        </button>
      {/each}
    </div>
  </div>
  <div class="ap-space" />
</div>
