<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
  import type { Class, Doc, DocumentQuery, FindOptions, Ref, Space } from '@hcengineering/core'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import { MeetingMinutes } from '@hcengineering/love'
  import { Label, Section, Scroller } from '@hcengineering/ui'
  import {
    FilterBar,
    getDefaults,
    getResultOptions,
    Table,
    ViewletSettingButton,
    ViewletsSettingButton
  } from '@hcengineering/view-resources'
  import { Viewlet, ViewletPreference, ViewOptions } from '@hcengineering/view'

  import love from '../plugin'

  export let objectId: Ref<Doc>
  export let space: Ref<Space>
  export let _class: Ref<Class<Doc>>
  export let readonly: boolean = false
  export let meetings: number

  const me = getCurrentAccount()

  let viewlet: Viewlet | undefined
  let preference: ViewletPreference | undefined
  let loading = true
  let viewOptions: ViewOptions | undefined

  let canViewMinutes: boolean = false
  $: canViewMinutes = hasAccountRole(me, AccountRole.User)

  let resultOptions: FindOptions<MeetingMinutes> | undefined

  $: void getResultOptions<MeetingMinutes>(undefined, viewlet?.viewOptions?.other, viewOptions).then((opts) => {
    resultOptions = opts
  })

  let baseQuery: DocumentQuery<MeetingMinutes>
  $: baseQuery = { attachedTo: objectId }
  let resultQuery: DocumentQuery<MeetingMinutes>
  $: resultQuery = { ...baseQuery }

  $: effectiveViewOptions = viewOptions ?? getDefaults(viewlet?.viewOptions)
</script>

{#if canViewMinutes}
  <Section label={love.string.MeetingMinutes} icon={love.icon.Cam}>
    <svelte:fragment slot="header">
      {#if viewlet}
        <ViewletSettingButton kind={'tertiary'} {viewlet} bind:viewOptions />
      {/if}
      <ViewletsSettingButton
        viewletQuery={{ _id: love.viewlet.TableMeetingMinutesEmbedded }}
        kind={'tertiary'}
        bind:viewlet
        bind:loading
        bind:preference
      />
    </svelte:fragment>

    <svelte:fragment slot="content">
      {#if viewlet}
        <FilterBar
          _class={love.class.MeetingMinutes}
          space={undefined}
          query={baseQuery}
          viewOptions={effectiveViewOptions}
          on:change={(e) => (resultQuery = e.detail)}
        />
        <Scroller horizontal>
          <Table
            _class={love.class.MeetingMinutes}
            config={preference?.config ?? viewlet.config}
            query={resultQuery}
            options={resultOptions}
            loadingProps={{ length: meetings }}
            preferredSorting="createdOn"
            {readonly}
          />
        </Scroller>
      {:else}
        <div class="antiSection-empty solid flex-col mt-3">
          <span class="content-dark-color">
            <Label label={love.string.NoMeetingMinutes} />
          </span>
        </div>
      {/if}
    </svelte:fragment>
  </Section>
{/if}
