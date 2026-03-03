<!--
// Copyright © 2026 Intabia Fusion.
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
  import { Class, Doc, DocumentQuery, FindOptions, Ref, WithLookup, mergeQueries } from '@hcengineering/core'
  import { Asset, IntlString } from '@hcengineering/platform'
  import { getClient } from '@hcengineering/presentation'
  import { AnySvelteComponent, Breadcrumb, Component, Header, Loading } from '@hcengineering/ui'
  import { Viewlet, ViewletPreference, ViewOptions } from '@hcengineering/view'
  import {
    getResultOptions,
    getResultQuery,
    getViewletSpecialActions,
    ViewletSelector,
    ViewletSettingButton
  } from '@hcengineering/view-resources'
  import { deepEqual } from 'fast-equals'
  import { ComponentType } from 'svelte'
  import { ChunterSpace } from '@hcengineering/chunter'

  export let _class: Ref<Class<ChunterSpace>>
  export let icon: Asset | AnySvelteComponent | ComponentType | undefined = undefined
  export let iconProps: any | undefined = undefined
  export let label: IntlString
  export let filterQuery: DocumentQuery<ChunterSpace> = {}
  export let search: string = ''

  const client = getClient()
  const hierarchy = client.getHierarchy()

  let viewlet: WithLookup<Viewlet> | undefined
  let preference: ViewletPreference | undefined
  let viewlets: Array<WithLookup<Viewlet>> = []
  let viewOptions: ViewOptions | undefined

  let isQueryLoaded = true

  $: _baseQuery = mergeQueries(mergeQueries({}, {}), viewlet?.baseQuery ?? {})
  $: query = { ..._baseQuery }
  $: searchQuery = search === '' ? query : { ...query, $search: `${search}*` }
  $: resultQuery = isQueryLoaded ? { ...searchQuery } : undefined

  let options = viewlet?.options
  let _options = viewlet?.options ?? {}

  $: if (!deepEqual(viewlet?.options ?? {}, _options)) {
    _options = viewlet?.options ?? {}
    options = viewlet?.options
  }

  $: void updateQuery(_baseQuery, viewOptions, viewlet)
  $: void updateOptions(viewlet?.options, viewOptions, viewlet)

  $: viewletActions = viewlet != null ? getViewletSpecialActions(client, viewlet) : []

  async function updateOptions (
    _options: FindOptions<Doc> | undefined,
    viewOptions: ViewOptions | undefined,
    viewlet: Viewlet | undefined
  ): Promise<void> {
    options = await getResultOptions(_options, viewlet?.viewOptions?.other, viewOptions)
  }

  async function updateQuery (
    initialQuery: DocumentQuery<Doc>,
    viewOptions: ViewOptions | undefined,
    viewlet: Viewlet | undefined
  ): Promise<void> {
    query =
      viewOptions !== undefined && viewlet !== undefined
        ? await getResultQuery(hierarchy, initialQuery, viewlet.viewOptions?.other, viewOptions)
        : initialQuery
    isQueryLoaded = true
  }

  $: console.log({ resultQuery, filterQuery })
</script>

<Header
  adaptive={'disabled'}
  hideActions={viewletActions == null || viewletActions.length === 0}
  hideExtra
  freezeBefore
>
  <svelte:fragment slot="beforeTitle">
    <ViewletSelector
      bind:viewlet
      bind:preference
      bind:viewlets
      ignoreFragment
      viewletQuery={{
        attachTo: _class,
        variant: { $exists: false }
      }}
    />
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>

  <Breadcrumb {label} size={'large'} isCurrent />
</Header>

{#if !viewlet?.$lookup?.descriptor?.component || viewlet?.attachTo !== _class || (preference !== undefined && viewlet?._id !== preference.attachedTo)}
  <Loading />
{:else if viewOptions && viewlet}
  <Component
    is={viewlet.$lookup.descriptor.component}
    props={{
      _class,
      options,
      config: preference?.config ?? viewlet.config,
      viewlet,
      viewOptions,
      viewOptionsConfig: viewlet.viewOptions?.other,
      query: resultQuery,
      totalQuery: query,
      ...viewlet.props
    }}
  />
{/if}
