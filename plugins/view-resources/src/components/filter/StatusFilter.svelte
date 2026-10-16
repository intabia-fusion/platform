<!--
// Copyright © 2026 Hardcore Engineering Inc.
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
  import type { Class, Doc, Ref, RefTo, Space, Status } from '@hcengineering/core'
  import { SortingOrder } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import ui, {
    deviceOptionsStore,
    EditWithIcon,
    Icon,
    IconCheck,
    IconSearch,
    Label,
    resizeObserver
  } from '@hcengineering/ui'
  import type { Filter, ViewOptions } from '@hcengineering/view'
  import type { Project, ProjectType, TaskType } from '@hcengineering/task'
  import task from '@hcengineering/task'
  import { createEventDispatcher } from 'svelte'
  import { FILTER_DEBOUNCE_MS, sortFilterValues } from '../../filter'
  import view from '../../plugin'
  import { buildConfigLookup, getPresenter } from '../../utils'

  export let filter: Filter
  export let space: Ref<Space> | undefined = undefined
  export let onChange: (e: Filter) => void
  export const viewOptions: ViewOptions | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const tkey = '$lookup.' + filter.key.key
  const key = { key: tkey }
  const lookup = buildConfigLookup(hierarchy, filter.key._class, [tkey])
  const promise = getPresenter(client, filter.key._class, key, key, lookup)

  filter.modes = filter.modes ?? [view.filter.FilterObjectIn, view.filter.FilterObjectNin]
  filter.mode = filter.mode ?? filter.modes[0]

  $: targetClass = (filter.key.attribute.type as RefTo<Doc>).to

  let search: string = ''
  let values: Array<Doc | undefined | null> = []
  let selectedValues = new Set<any>(filter.value)
  let filterUpdateTimeout: any

  const dispatch = createEventDispatcher()

  async function getStatusIds (): Promise<Set<Ref<Status>>> {
    const ids = new Set<Ref<Status>>()
    const statusClass = targetClass as Ref<Class<Status>>

    if (space === undefined) {
      const all = await client.findAll<Status>(statusClass, {})
      for (const s of all) {
        ids.add(s._id)
      }
    } else {
      const projects = await client.findAll<Project>(
        task.class.Project,
        { _id: space as Ref<Project> },
        { projection: { type: 1 } }
      )
      if (projects.length > 0) {
        const projectTypes = await client.findAll<ProjectType>(
          task.class.ProjectType,
          { _id: projects[0].type },
          { projection: { tasks: 1 } }
        )
        if (projectTypes.length > 0) {
          const taskTypes = await client.findAll<TaskType>(
            task.class.TaskType,
            { _id: { $in: projectTypes[0].tasks } },
            { projection: { statuses: 1 } }
          )
          for (const tt of taskTypes) {
            for (const s of tt.statuses ?? []) {
              ids.add(s as Ref<Status>)
            }
          }
        }
      }
    }

    for (const v of filter.value) {
      ids.add(v as Ref<Status>)
    }
    return ids
  }

  async function getValues (searchText: string): Promise<void> {
    const ids = await getStatusIds()
    if (ids.size === 0) {
      values = []
      return
    }
    const query: any = { _id: { $in: Array.from(ids) } }
    if (searchText !== '') {
      query.name = { $like: '%' + searchText + '%' }
    }
    const docs = await client.findAll<Status>(targetClass as Ref<Class<Status>>, query, {
      sort: { name: SortingOrder.Ascending }
    })
    values = sortFilterValues(docs, (v) => selectedValues.has(v?._id))
  }

  function isSelected (value: any): boolean {
    return selectedValues.has(value?._id ?? value)
  }

  function handleFilterToggle (value: any): void {
    const id = value?._id ?? value
    if (selectedValues.has(id)) {
      selectedValues.delete(id)
    } else {
      selectedValues.add(id)
    }
    selectedValues = new Set(selectedValues)
    updateFilter()
  }

  function updateFilter (): void {
    clearTimeout(filterUpdateTimeout)
    filterUpdateTimeout = setTimeout(() => {
      filter.value = [...selectedValues]
      onChange(filter)
    }, FILTER_DEBOUNCE_MS)
  }

  $: void getValues(search)
</script>

<div class="selectPopup" use:resizeObserver={() => dispatch('changeContent')}>
  <div class="header">
    <EditWithIcon
      icon={IconSearch}
      size={'large'}
      width={'100%'}
      autoFocus={!$deviceOptionsStore.isMobile}
      bind:value={search}
      placeholder={presentation.string.Search}
    />
  </div>
  <div class="scroll">
    <div class="box">
      {#await promise then attribute}
        {#each values as value}
          <button
            class="menu-item no-focus content-pointer-events-none"
            on:click={() => {
              handleFilterToggle(value)
            }}
          >
            <div class="flex-between w-full">
              <div class="flex-row-center">
                {#if value}
                  {#key value._id}
                    <svelte:component this={attribute.presenter} {value} {...attribute.props} disabled oneLine />
                  {/key}
                {:else}
                  <Label label={ui.string.NotSelected} />
                {/if}
              </div>
              <div class="pointer-events-none">
                {#if isSelected(value)}
                  <Icon icon={IconCheck} size={'small'} />
                {/if}
              </div>
            </div>
          </button>
        {/each}
        {#if values.length === 0}
          <div class="menu-space">
            <Label label={presentation.string.NoResults} />
          </div>
        {/if}
      {/await}
    </div>
  </div>
  <div class="menu-space" />
</div>
