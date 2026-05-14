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
  import { Floor, MeetingMinutes, Room } from '@hcengineering/love'
  import { Component, SearchInput } from '@hcengineering/ui'
  import view, { Viewlet, ViewletPreference, ViewOptions } from '@hcengineering/view'
  import core, { DocumentQuery, FindOptions, WithLookup } from '@hcengineering/core'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import {
    FilterBar,
    FilterButton,
    getDefaults,
    getResultOptions,
    ViewletSettingButton
  } from '@hcengineering/view-resources'

  import lovePlg from '../plugin'

  export let floor: Floor
  export let rooms: Room[] = []

  const client = getClient()
  let viewlet: WithLookup<Viewlet> | undefined
  let viewOptions: ViewOptions | undefined
  let preference: ViewletPreference | undefined

  let search: string = ''
  let baseQuery: DocumentQuery<MeetingMinutes>
  $: baseQuery =
    search.trim() === ''
      ? { roomId: { $in: rooms.map((p) => p._id) } }
      : { roomId: { $in: rooms.map((p) => p._id) }, $search: search }
  let resultQuery: DocumentQuery<MeetingMinutes>
  $: resultQuery = { ...baseQuery }

  let resultOptions: FindOptions<MeetingMinutes> | undefined

  $: void getResultOptions<MeetingMinutes>(undefined, viewlet?.viewOptions?.other, viewOptions).then((opts) => {
    resultOptions = opts
  })

  $: effectiveViewOptions = viewOptions ?? getDefaults(viewlet?.viewOptions)

  const preferenceQuery = createQuery()

  void client
    .findAll(
      view.class.Viewlet,
      { _id: lovePlg.viewlet.ListMeetingMinutes },
      { lookup: { descriptor: view.class.ViewletDescriptor } }
    )
    .then((res) => {
      viewlet = res[0]
    })

  $: preferenceQuery.query(
    view.class.ViewletPreference,
    {
      space: core.space.Workspace,
      attachedTo: lovePlg.viewlet.ListMeetingMinutes
    },
    (res) => {
      preference = res[0]
    },
    { limit: 1 }
  )
</script>

{#if viewlet?.$lookup?.descriptor?.component}
  <div class="meetings-list-wrapper">
    <div class="meetings-list-header">
      <FilterButton _class={lovePlg.class.MeetingMinutes} />
      <SearchInput bind:value={search} collapsed />
      <div class="header-spacer" />
      <ViewletSettingButton kind={'tertiary'} {viewlet} bind:viewOptions />
    </div>
    <FilterBar
      _class={lovePlg.class.MeetingMinutes}
      space={undefined}
      query={baseQuery}
      viewOptions={effectiveViewOptions}
      on:change={(e) => (resultQuery = e.detail)}
    />
    <div class="meetings-list-body">
      <Component
        is={viewlet.$lookup.descriptor.component}
        props={{
          _class: lovePlg.class.MeetingMinutes,
          config: preference?.config ?? viewlet.config,
          options: resultOptions,
          query: resultQuery,
          viewlet,
          viewOptions: effectiveViewOptions,
          viewOptionsConfig: viewlet.viewOptions?.other,
          enableChecking: false,
          preferredSorting: 'createdOn'
        }}
      />
    </div>
  </div>
{/if}

<style lang="scss">
  .meetings-list-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .meetings-list-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    flex: 0 0 auto;
  }

  .header-spacer {
    flex: 1 1 auto;
  }

  .meetings-list-body {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
