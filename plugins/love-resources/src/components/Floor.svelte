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
  import type { Ref, WithLookup } from '@hcengineering/core'
  import { AccountRole, getCurrentAccount, hasAccountRole } from '@hcengineering/core'
  import type { Floor, Room } from '@hcengineering/love'
  import ui, { Component, DropdownLabels, eventToHTMLElement, Header, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import type { Viewlet, ViewletPreference } from '@hcengineering/view'
  import { ViewletSelector } from '@hcengineering/view-resources'
  import { createEventDispatcher } from 'svelte'

  import lovePlg from '../plugin'
  import { ensureOfficeDetailsLoaded, floors, selectedFloor } from '../stores'
  import AddRoomPopup from './AddRoomPopup.svelte'

  export let rooms: Room[] = []
  export let floor: Ref<Floor>

  const dispatch = createEventDispatcher()

  void ensureOfficeDetailsLoaded()

  let viewlet: WithLookup<Viewlet> | undefined
  let preference: ViewletPreference | undefined
  let loading = false

  let selected = $floors.filter((fl) => fl._id === floor)[0]
  $: selected = $floors.filter((fl) => fl._id === floor)[0]

  const me = getCurrentAccount()

  let editable: boolean = false
  $: editable = hasAccountRole(me, AccountRole.Maintainer)
  // A meeting needs a room, and adding one is a per-meeting action, not office layout editing.
  $: canAddRoom = hasAccountRole(me, AccountRole.User)

  let items = $floors.map((p) => {
    return { id: p._id, label: p.name }
  })
  $: items = $floors.map((p) => {
    return { id: p._id, label: p.name }
  })

  function changeFloor (event: CustomEvent<Ref<Floor>>) {
    if (event.detail) {
      selectedFloor.set(event.detail)
    }
  }

  function openAddRoom (event: MouseEvent | TouchEvent): void {
    showPopup(AddRoomPopup, { floor }, eventToHTMLElement(event))
  }
</script>

<div class="hulyComponent">
  <Header adaptive="disabled">
    <DropdownLabels
      {items}
      selected={selected?._id}
      size="large"
      kind="ghost"
      enableSearch={false}
      autoSelect={false}
      on:selected={changeFloor}
    />
    <svelte:fragment slot="beforeTitle">
      <ViewletSelector bind:viewlet bind:preference bind:loading viewletQuery={{ attachTo: lovePlg.class.Floor }} />
    </svelte:fragment>
    <svelte:fragment slot="actions">
      {#if canAddRoom}
        <Button
          icon={ui.icon.Plus}
          label={lovePlg.string.AddRoom}
          size="small"
          on:click={openAddRoom}
        />
      {/if}
      {#if editable}
        <Button
          icon={ui.icon.PencilLine}
          label={lovePlg.string.EditOffice}
          size="small"
          on:click={() => dispatch('configure')}
        />
      {/if}
    </svelte:fragment>
  </Header>
  <div class="hulyComponent-content__column content">
    {#if viewlet?.$lookup?.descriptor?.component}
      <Component is={viewlet.$lookup.descriptor.component} props={{ floor, rooms }} on:open />
    {/if}
  </div>
</div>
