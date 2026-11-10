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
  import type { Contact, Person } from '@hcengineering/contact'
  import type { Ref } from '@hcengineering/core'
  import type { Floor as FloorType, Office, Room } from '@hcengineering/love'
  import love, { isOffice } from '@hcengineering/love'
  import { SpecialView } from '@hcengineering/workbench-resources'
  import { deviceOptionsStore as deviceInfo, Label, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { onDestroy } from 'svelte'
  import { currentFloor, ensureOfficeDetailsLoaded, officeView, rooms } from '../stores'

  import Floor from './Floor.svelte'
  import FloorConfigure from './FloorConfigure.svelte'
  import MeetingGroupPopup from './MeetingGroupPopup.svelte'
  import PermanentMeetingsList from './PermanentMeetingsList.svelte'

  void ensureOfficeDetailsLoaded()

  function getRooms (rooms: Room[], floor: Ref<FloorType>): Room[] {
    return rooms.filter((p) => p.floor === floor)
  }

  $: floor = $currentFloor
  let configure: boolean = false
  let replacedPanel: HTMLElement

  let excludedPersons: Ref<Contact>[] = []
  $: excludedPersons = $rooms
    .filter((p) => isOffice(p) && p.person !== null)
    .map((p) => (p as Office).person) as Ref<Person>[]

  $: $deviceInfo.replacedPanel = replacedPanel
  onDestroy(() => ($deviceInfo.replacedPanel = undefined))
</script>

<div class="antiPanel-component filledNav" bind:this={replacedPanel}>
  {#if $officeView === 'meetings'}
    <!-- A materialised occurrence keeps the mixin the calendar mirrors onto every copy, so without
         a filter every edited or cancelled occurrence would sit in the list as a second meeting.
         `recurringEventId` is declared on the occurrence class alone: a series master carries
         `originalStartTime` too, and filtering by it would hide every series. -->
    <SpecialView
      _class={love.mixin.MeetingEventLink}
      baseQuery={{ recurringEventId: { $exists: false } }}
      label={love.string.Meetings}
      icon={love.icon.Cam}
    />
  {:else if $officeView === 'floors'}
    <!-- Nothing is picked yet: the floors list is in the navigator, the grid is its detail view. -->
    <div class="flex-col h-full justify-center items-center">
      <span class="content-color"><Label label={love.string.SelectFloor} /></span>
    </div>
  {:else if $officeView === 'permanent'}
    <!-- The list keeps the group order explicit (`order`), which the standard table cannot: a
         dropped header has to stay where it was dropped after a reload. -->
    <div class="flex-col h-full">
      <div class="flex-row-center gap-2 mb-2">
        <Button
          label={love.string.NewMeeting}
          kind="primary"
          size="medium"
          on:click={() => showPopup(love.component.CreatePermanentMeetingPopup, {})}
        />
        <Button
          label={love.string.MergeIntoGroup}
          kind="secondary"
          size="medium"
          on:click={() => showPopup(MeetingGroupPopup, {})}
        />
      </div>
      <PermanentMeetingsList />
    </div>
  {:else if configure}
    <FloorConfigure
      rooms={getRooms($rooms, floor)}
      {floor}
      {excludedPersons}
      on:configure={() => (configure = false)}
    />
  {:else}
    <Floor rooms={getRooms($rooms, floor)} {floor} on:configure={() => (configure = true)} on:open />
  {/if}
</div>
