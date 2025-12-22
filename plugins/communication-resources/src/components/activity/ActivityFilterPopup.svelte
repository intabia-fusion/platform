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
  import { IntlString } from '@hcengineering/platform'
  import { CheckBox, Label, resizeObserver } from '@hcengineering/ui'

  interface ActionMenu {
    id: string
    label: IntlString
  }

  export let enabledItems: string[] = []
  export let items: ActionMenu[] = []

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

  function toggleItem (id: string): void {
    if (enabledItems.includes(id)) {
      enabledItems = enabledItems.filter((it) => it !== id)
    } else {
      enabledItems = [...enabledItems, id]
    }
    dispatch('update', enabledItems)
  }

  $: console.log('enabled', enabledItems)

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
      <!-- svelte-ignore a11y-mouse-events-have-key-events -->
      {#each items as item, i}
        <button
          bind:this={btns[i]}
          class="ap-menuItem flex-row-center withIcon"
          class:hover={btns[i] === activeElement}
          on:mousemove={() => {
            if (btns[i] !== activeElement) activeElement = btns[i]
          }}
          on:click={() => {
            toggleItem(item.id)
          }}
        >
          <span class="flex-center justify-end mr-3 pointer-events-none">
            <CheckBox
              checked={enabledItems.includes(item.id)}
              symbol={!enabledItems.includes(item.id) ? 'minus' : 'check'}
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
