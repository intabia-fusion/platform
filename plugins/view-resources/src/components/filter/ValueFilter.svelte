<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { Class, Doc, FindResult, Ref, RefTo, Space } from '@hcengineering/core'
  import core, { getObjectValue, SortingOrder, type WithLookup } from '@hcengineering/core'
  import presentation, { getClient } from '@hcengineering/presentation'
  import ui, {
    Button,
    deviceOptionsStore,
    EditWithIcon,
    Icon,
    IconCheck,
    IconSearch,
    Label,
    Loading,
    resizeObserver
  } from '@hcengineering/ui'
  import type { Filter, ViewOptions } from '@hcengineering/view'
  import { createEventDispatcher } from 'svelte'
  import { FILTER_DEBOUNCE_MS, sortFilterValues } from '../../filter'
  import view from '../../plugin'
  import { getPresenter } from '../../utils'

  const dispatch = createEventDispatcher()

  export let _class: Ref<Class<Doc>>
  export let space: Ref<Space> | undefined = undefined
  export let filter: Filter
  export let onChange: (e: Filter) => void
  export let viewOptions: ViewOptions | undefined = undefined

  const client = getClient()
  const hierarchy = client.getHierarchy()

  const isStringType = hierarchy.isDerived(filter.key.attribute.type._class, core.class.TypeString)

  filter.modes = isStringType
    ? [view.filter.FilterValueIn, view.filter.FilterValueNin, view.filter.FilterContains]
    : [view.filter.FilterValueIn, view.filter.FilterValueNin]
  if (filter.mode === undefined || !filter.modes.includes(filter.mode)) {
    filter.mode = isStringType ? view.filter.FilterContains : view.filter.FilterValueIn
  }

  if (filter.mode === view.filter.FilterContains) {
    if (filter.value.length > 0 && Array.isArray(filter.value[0])) filter.value = []
  } else if (filter.value.length > 0 && !Array.isArray(filter.value[0])) {
    filter.value = []
  }

  $: isSearchable =
    isStringType || [core.class.TypeNumber, core.class.EnumOf].includes(filter.key.attribute.type._class)

  const key = { key: filter.key.key }
  const promise = getPresenter(client, filter.key._class, key, key)

  let values = new Set<any>()
  let sortedValues: any[] = []
  let selectedValues = new Set<any>(filter.value.map((p) => p[0]))
  const realValues = new Map<any, Set<any>>()

  let objectsPromise: Promise<FindResult<Doc>> | undefined
  let filterUpdateTimeout: any | undefined

  let search: string =
    filter.mode === view.filter.FilterContains && typeof filter.value[0] === 'string' ? filter.value[0] : ''

  async function getValues (searchText: string): Promise<void> {
    if (objectsPromise != null) {
      await objectsPromise
    }
    values.clear()
    realValues.clear()
    let prefix = ''
    const attr = hierarchy.getAttribute(filter.key._class, filter.key.key)
    if (hierarchy.isMixin(attr.attributeOf)) {
      prefix = attr.attributeOf + '.'
    }

    const resultQuery =
      isSearchable && searchText !== ''
        ? {
            [prefix + filter.key.key]: { $like: '%' + searchText + '%' }
          }
        : {}

    async function doQuery (limit: number | undefined, exclude: any[] | undefined): Promise<boolean> {
      const p = client.findAll(
        _class,
        {
          ...resultQuery,
          ...(space !== undefined ? { space } : {}),
          ...(exclude !== undefined ? { [prefix + filter.key.key]: { $nin: exclude } } : {})
        },
        {
          sort: { modifiedOn: SortingOrder.Descending },
          projection: { [prefix + filter.key.key]: 1 },
          ...(limit !== undefined ? { limit } : {}),
          showArchived: viewOptions?.hideArchived === false
        }
      )
      if (limit !== undefined) {
        objectsPromise = p
      }
      const res: WithLookup<Doc>[] = await p
      for (const object of res) {
        let asDoc = object
        if (hierarchy.isMixin(filter.key._class)) {
          asDoc = hierarchy.as(object, filter.key._class)
        }
        const realValue = getObjectValue(filter.key.key, asDoc)
        const value = getValue(realValue)
        values.add(value)
        realValues.set(value, (realValues.get(value) ?? new Set()).add(realValue))
      }
      return res.length >= (limit ?? 0)
    }

    const hasMore = await doQuery(1000, undefined)
    for (const p of filter.value) {
      if (Array.isArray(p)) {
        values.add(p[0])
        realValues.set(p[0], new Set(p[1]))
      }
    }
    values = values
    sortedValues = sortFilterValues([...values.keys()], (v) => isSelected(v, selectedValues))
    objectsPromise = undefined

    if (hasMore) {
      await doQuery(undefined, Array.from(values))
      sortedValues = sortFilterValues([...values.keys()], (v) => isSelected(v, selectedValues))
      objectsPromise = undefined
    }
  }

  function getValue (obj: any): any {
    if (typeof obj === 'string') {
      const trim = obj.trim()
      return trim.length > 0 ? trim.toUpperCase() : null
    }
    return obj ?? null
  }

  function isSelected (value: any, vals: Set<any>): boolean {
    return vals.has(value)
  }

  function handleFilterToggle (value: any): void {
    if (filter.mode === view.filter.FilterContains) {
      filter.mode = view.filter.FilterValueIn
      filter.value = []
      selectedValues = new Set()
      search = ''
    }
    if (isSelected(value, selectedValues)) {
      selectedValues.delete(value)
    } else {
      selectedValues.add(value)
    }
    selectedValues = selectedValues

    updateFilter(selectedValues)
  }

  function updateFilter (newValues: Set<any>): void {
    clearTimeout(filterUpdateTimeout)

    filterUpdateTimeout = setTimeout(() => {
      filter.value = [...newValues.values()].map((v) => {
        const realVals = realValues.get(v)
        return v === null ? [null, [null]] : [v, [...(realVals ?? [])]]
      })

      onChange(filter)
    }, FILTER_DEBOUNCE_MS)
  }

  export function onKeyDown (event: KeyboardEvent): boolean {
    if (event.key === 'Enter' && isStringType && search !== '') {
      event.preventDefault()
      event.stopPropagation()
      save()
      return true
    }
    return false
  }

  function save (): void {
    if (search == null || search === '') return
    filter.mode = view.filter.FilterContains
    filter.value = [search]
    onChange(filter)
    dispatch('close')
  }

  $: void getValues(search)
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="selectPopup" use:resizeObserver={() => dispatch('changeContent')} on:keydown={onKeyDown}>
  {#if isSearchable}
    <div class="header">
      <EditWithIcon
        icon={IconSearch}
        size={'large'}
        width={'100%'}
        autoFocus={!$deviceOptionsStore.isMobile}
        bind:value={search}
        placeholder={filter.key.label}
      />
    </div>
  {:else}
    <div class="menu-space" />
  {/if}
  {#if isStringType && search !== ''}
    <Button shape="filter" label={view.string.Apply} on:click={save} />
  {/if}
  <div class="scroll">
    <div class="box">
      {#await promise then attribute}
        {#if objectsPromise}
          <Loading />
        {:else}
          {#each sortedValues as value}
            {@const realValue = [...(realValues.get(value) ?? [])][0]}
            <button
              class="menu-item no-focus content-pointer-events-none"
              on:click={() => {
                handleFilterToggle(value)
              }}
            >
              {#if value != null}
                <div class="clear-mins flex-grow">
                  <svelte:component
                    this={attribute.presenter}
                    value={typeof value === 'string' ? realValue : value}
                    {...attribute.props}
                    oneLine
                  />
                </div>
              {:else}
                <span class="overflow-label flex-grow"><Label label={ui.string.NotSelected} /></span>
              {/if}
              <div class="check pointer-events-none">
                {#if isSelected(value, selectedValues)}
                  <Icon icon={IconCheck} size={'small'} />
                {/if}
              </div>
            </button>
          {/each}
        {/if}
      {/await}
    </div>
  </div>
  <div class="menu-space" />
</div>
