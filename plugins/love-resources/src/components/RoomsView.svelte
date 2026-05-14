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
  import { DocumentQuery, Ref, WithLookup } from '@hcengineering/core'
  import { Asset, IntlString, translateCB } from '@hcengineering/platform'
  import { Floor, Room } from '@hcengineering/love'
  import { IModeSelector, themeStore } from '@hcengineering/ui'
  import { ViewOptions, Viewlet } from '@hcengineering/view'
  import { FilterBar, SpaceHeader, ViewletContentView, ViewletSettingButton } from '@hcengineering/view-resources'

  import love from '../plugin'

  export let floor: Ref<Floor> | undefined = undefined
  export let query: DocumentQuery<Room> = {}
  export let title: IntlString | undefined = undefined
  export let label: string = ''
  export let icon: Asset | undefined = undefined
  export let modeSelectorProps: IModeSelector | undefined = undefined

  export let viewlet: WithLookup<Viewlet> | undefined = undefined
  const viewlets: WithLookup<Viewlet>[] | undefined = undefined
  let viewOptions: ViewOptions | undefined

  let search = ''
  let searchQuery: DocumentQuery<Room> = { ...query }

  function updateSearchQuery (search: string): void {
    searchQuery = search === '' ? { ...query } : { ...query, $search: search }
  }

  $: if (query !== undefined) updateSearchQuery(search)
  let resultQuery: DocumentQuery<Room> = { ...searchQuery }

  $: if (title !== undefined) {
    translateCB(title, {}, $themeStore.language, (res) => {
      label = res
    })
  }

  $: floorQuery = floor !== undefined ? { ...query, floor } : query
  $: updateSearchQuery(search)
</script>

<SpaceHeader
  _class={love.class.Room}
  {icon}
  bind:viewlet
  bind:search
  viewletQuery={{ attachTo: love.class.Room }}
  {viewlets}
  {label}
  {modeSelectorProps}
  {resultQuery}
>
  <svelte:fragment slot="header-tools">
    <ViewletSettingButton bind:viewOptions bind:viewlet />
  </svelte:fragment>
</SpaceHeader>
<FilterBar
  _class={love.class.Room}
  space={undefined}
  query={searchQuery}
  {viewOptions}
  on:change={(e) => (resultQuery = e.detail)}
/>
{#if viewlet !== undefined && viewOptions !== undefined}
  <ViewletContentView _class={love.class.Room} space={undefined} {viewlet} query={resultQuery} {viewOptions} />
{/if}
