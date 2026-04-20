<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import { Button, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import view from '@hcengineering/view'
  import { ActivityMessagesFilter } from '@hcengineering/activity'
  import { Ref } from '@hcengineering/core'

  import ActivityFilterPopup from './ActivityFilterPopup.svelte'

  export let filters: ActivityMessagesFilter[] = []

  const dispatch = createEventDispatcher()
  const enabledFiltersLocalStorageKey = 'activity-filters_v2'

  let enabledFilters: Ref<ActivityMessagesFilter>[] | null = null

  onMount(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(enabledFiltersLocalStorageKey) ?? '')
      if (Array.isArray(parsed)) {
        enabledFilters = parsed as Ref<ActivityMessagesFilter>[]
      } else {
        enabledFilters = filters.map((it) => it._id)
      }
    } catch (e) {
      enabledFilters = filters.map((it) => it._id)
    }
    dispatch('update', enabledFilters)
  })

  const handleOptions = (ev: MouseEvent): void => {
    showPopup(
      ActivityFilterPopup,
      { enabledFilters, filters },
      eventToHTMLElement(ev),
      () => {},
      (res) => {
        if (res == null) return
        enabledFilters = res
        localStorage.setItem(enabledFiltersLocalStorageKey, JSON.stringify(enabledFilters))
        dispatch('update', enabledFilters)
      }
    )
  }
</script>

<div class="buttons-group small-gap pr-2 relative">
  <Button icon={view.icon.Configure} size={'small'} kind={'ghost'} on:click={handleOptions}>
    <svelte:fragment slot="iconRight">
      {#if enabledFilters != null && !filters.every((it) => enabledFilters?.includes(it._id))}
        <span class="marker" />
      {/if}
    </svelte:fragment>
  </Button>
</div>

<style lang="scss">
  .marker {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    font-weight: 700;
    background-color: var(--global-accent-IconColor);
    opacity: 0.5;
    width: 0.375rem;
    height: 0.375rem;
    right: 0.625rem;
    top: 0.125rem;
  }
</style>
