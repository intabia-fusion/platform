<!--
// Copyright © 2022 Hardcore Engineering Inc.
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
  import type { Class, Doc, FindResult, Ref, Space } from '@hcengineering/core'
  import core, { getObjectValue, SortingOrder, type WithLookup } from '@hcengineering/core'
  import { getClient } from '@hcengineering/presentation'
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
  import { createEventDispatcher, onDestroy } from 'svelte'
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

  $: isSearchable =
    isStringType || [core.class.TypeNumber, core.class.EnumOf].includes(filter.key.attribute.type._class)

  const key = { key: filter.key.key }
  const promise = getPresenter(client, filter.key._class, key, key)

  let values = new Set<any>()
  let sortedValues: any[] = []
  let selectedValues = new Set<any>(filter.mode === view.filter.FilterContains ? [] : filter.value.map((p) => p[0]))
  const realValues = new Map<any, Set<any>>()
  // Real values of selected items, kept apart from realValues: a later search re-query clears those
  const selectedReal = new Map<any, Set<any>>(
    filter.mode === view.filter.FilterContains
      ? []
      : filter.value.map((p) => [p[0], new Set<any>(p[1] ?? [])] as [any, Set<any>])
  )

  let objectsPromise: Promise<FindResult<Doc>> | undefined
  let filterUpdateTimeout: any | undefined
  let searchTimeout: any | undefined
  let searchSeq = 0

  let search: string =
    filter.mode === view.filter.FilterContains && typeof filter.value[0] === 'string' ? filter.value[0] : ''

  async function getValues (searchText: string): Promise<void> {
    const seq = ++searchSeq
    if (objectsPromise != null) {
      await objectsPromise
    }
    if (seq !== searchSeq) return

    values.clear()
    realValues.clear()
    let prefix = ''
    const attr = hierarchy.getAttribute(filter.key._class, filter.key.key)
    if (hierarchy.isMixin(attr.attributeOf)) {
      prefix = attr.attributeOf + '.'
    }
    const valueKey = prefix + filter.key.key

    async function doQuery (limit: number | undefined, exclude: any[] | undefined): Promise<boolean> {
      const valueQuery: Record<string, any> = {}

      if (isSearchable && searchText !== '') {
        valueQuery.$like = '%' + searchText + '%'
      }

      if (exclude !== undefined) {
        valueQuery.$nin = exclude
      }
      const p = client.findAll(
        _class,
        {
          ...(Object.keys(valueQuery).length > 0 ? { [valueKey]: valueQuery } : {}),
          ...(space !== undefined ? { space } : {})
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
      if (seq !== searchSeq) return false
      for (const object of res) {
        let asDoc = object
        if (hierarchy.isMixin(filter.key._class)) {
          asDoc = hierarchy.as(object, filter.key._class)
        }
        const realValue = getObjectValue(filter.key.key, asDoc)
        const value = getValue(realValue)
        values.add(value)
        const real = realValues.get(value) ?? new Set<any>()
        real.add(realValue)
        realValues.set(value, real)
      }
      return limit !== undefined && res.length >= limit
    }

    const hasMore = await doQuery(1000, undefined)
    if (seq !== searchSeq) return

    for (const p of filter.value) {
      if (!Array.isArray(p)) continue
      values.add(p[0])
      const real = realValues.get(p[0]) ?? new Set<any>()
      for (const saved of p[1] ?? []) {
        real.add(saved)
      }
      realValues.set(p[0], real)
    }
    values = values
    sortedValues = sortFilterValues([...values.keys()], (v) => isSelected(v, selectedValues))
    objectsPromise = undefined

    if (hasMore && !isStringType) {
      const exclude = [...realValues.values()].flatMap((it) => [...it]).filter((it) => it != null)
      await doQuery(undefined, exclude)
      if (seq !== searchSeq) return
      sortedValues = sortFilterValues([...values.keys()], (v) => isSelected(v, selectedValues))
      objectsPromise = undefined
    }
  }

  function getValue (obj: any): any {
    if (typeof obj === 'string') {
      const trim = obj.trim()
      if (trim.length === 0) return null

      return isStringType ? trim : trim.toUpperCase()
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
      selectedReal.clear()
      search = ''
    }
    if (isSelected(value, selectedValues)) {
      selectedValues.delete(value)
      selectedReal.delete(value)
    } else {
      selectedValues.add(value)
      selectedReal.set(value, new Set(realValues.get(value)))
    }
    selectedValues = selectedValues

    updateFilter(selectedValues)
  }

  function updateFilter (newValues: Set<any>): void {
    clearTimeout(filterUpdateTimeout)

    filterUpdateTimeout = setTimeout(() => {
      filter.value = [...newValues.values()].map((v) => {
        // A re-query that finished in time may have found more raw variants than the click-time snapshot
        const realVals = new Set([...(selectedReal.get(v) ?? []), ...(realValues.get(v) ?? [])])
        return v === null ? [null, [null, ...realVals]] : [v, [...realVals]]
      })

      onChange(filter)
    }, FILTER_DEBOUNCE_MS)
  }

  function onKeyDown (event: KeyboardEvent): void {
    if (event.key === 'Enter' && isStringType && filter.mode === view.filter.FilterContains && search !== '') {
      event.preventDefault()
      event.stopPropagation()
      save()
    }
  }

  function save (): void {
    if (filter.mode !== view.filter.FilterContains || search == null || search === '') return
    filter.value = [search]
    onChange(filter)
    dispatch('close')
  }

  $: scheduleSearch(search)

  function scheduleSearch (searchText: string): void {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(
      () => {
        void getValues(searchText)
      },
      searchText === '' ? 0 : FILTER_DEBOUNCE_MS
    )
  }

  onDestroy(() => {
    clearTimeout(searchTimeout)
  })
</script>

<div class="selectPopup" use:resizeObserver={() => dispatch('changeContent')}>
  {#if isSearchable}
    <div class="header">
      <EditWithIcon
        icon={IconSearch}
        size="large"
        width="100%"
        autoFocus={!$deviceOptionsStore.isMobile}
        bind:value={search}
        placeholder={filter.key.label}
        on:keydown={onKeyDown}
      />
    </div>
  {:else}
    <div class="menu-space" />
  {/if}
  {#if isStringType && filter.mode === view.filter.FilterContains && search !== ''}
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
                  <Icon icon={IconCheck} size="small" />
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
