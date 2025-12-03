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

  import ActivityFilterPopup from './ActivityFilterPopup.svelte'
  import OrderAsc from '../icons/OrderAsc.svelte'
  import { ActivityDirection, ActivityFilter } from '../../types'
  import OrderDesc from '../icons/OrderDesc.svelte'
  import { activityDirectionStore } from '../../stores'
  import { defaultEnabledFilters, filtersDef } from '../../activity'

  const dispatch = createEventDispatcher()

  let enabledFilters: ActivityFilter[] | null = null

  onMount(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('activity-filters') ?? '')
      if (Array.isArray(parsed)) {
        enabledFilters = parsed as ActivityFilter[]
      } else {
        enabledFilters = defaultEnabledFilters
      }
    } catch (e) {
      enabledFilters = defaultEnabledFilters
    }

    dispatch('update', enabledFilters)
  })

  const handleOptions = (ev: MouseEvent): void => {
    showPopup(
      ActivityFilterPopup,
      { enabledItems: enabledFilters, items: filtersDef },
      eventToHTMLElement(ev),
      () => {},
      (res) => {
        if (res == null) return
        enabledFilters = res
        localStorage.setItem('activity-filters', JSON.stringify(enabledFilters))
        dispatch('update', enabledFilters)
      }
    )
  }

  function togglePosition (): void {
    if ($activityDirectionStore === ActivityDirection.Forward) {
      activityDirectionStore.set(ActivityDirection.Backward)
    } else {
      activityDirectionStore.set(ActivityDirection.Forward)
    }
  }
</script>

<div class="buttons-group small-gap pr-2">
  <Button icon={$activityDirectionStore === ActivityDirection.Forward ? OrderAsc : OrderDesc} size={'small'} kind={'ghost'} on:click={togglePosition} />
</div>
<div class="buttons-group small-gap pr-2">
  <Button icon={view.icon.Configure} size={'small'} kind={'ghost'} on:click={handleOptions} />
</div>
