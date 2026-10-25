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
  import type { Class, Doc, Ref, Space } from '@hcengineering/core'
  import type { IntlString } from '@hcengineering/platform'
  import { IconAdd, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  import { Button, IconButton } from '@hcengineering/ui/kit'
  import type { Filter } from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import { parseFilters, serializeFilters } from '../../filter'
  import FilterSection from './FilterSection.svelte'
  import FilterTypePopup from './FilterTypePopup.svelte'
  import view from '../../plugin'

  // Conditions as JSON of `Filter[]`, the form a saved view keeps.
  export let value: string
  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined = undefined
  export let disabled: boolean = false
  // Conditions carry a remove cross
  export let removable: boolean = false
  // Text of the add button; an icon-only button without it
  export let addLabel: IntlString | undefined = undefined
  // Attributes not offered for a new condition; saved conditions on them still show
  export let hiddenKeys: string[] = []

  const dispatch = createEventDispatcher<{ change: string }>()

  let filters: Filter[] = parseFilters(value)
  let lastEmitted = value
  // Value changed from outside: the editor emitted other JSON.
  $: if (value !== lastEmitted) {
    filters = parseFilters(value)
    lastEmitted = value
  }

  function emit (): void {
    filters = filters
    lastEmitted = serializeFilters(filters)
    dispatch('change', lastEmitted)
  }

  function remove (filter: Filter): void {
    filters = filters.filter((f) => f !== filter)
    emit()
  }

  function add (e: MouseEvent): void {
    const target = eventToHTMLElement(e)
    showPopup(
      FilterTypePopup,
      {
        _class,
        target,
        space,
        hiddenKeys,
        // Indexes key the live queries of nested filters: conditions of different rows must not collide.
        index: Math.floor(Math.random() * 1_000_000_000) + 1,
        onChange: (f: Filter) => {
          filters.push(f)
          emit()
        }
      },
      target
    )
  }
</script>

<div class="conditions" data-id="filterConditions">
  {#each filters as filter (filter.index)}
    <FilterSection
      {filter}
      {space}
      hideRemove={!removable}
      on:change={emit}
      on:remove={() => {
        remove(filter)
      }}
    />
  {/each}
  {#if !disabled}
    <div class="add">
      {#if addLabel !== undefined}
        <Button
          size="extra-small"
          icon={IconAdd}
          kind="ghost"
          label={addLabel}
          data-id="filterConditionsAdd"
          on:click={add}
        />
      {:else}
        <IconButton
          size="small"
          icon={IconAdd}
          kind="ghost"
          tooltip={{ label: view.string.Filter }}
          data-id="filterConditionsAdd"
          on:click={add}
        />
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .conditions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
  }
</style>
