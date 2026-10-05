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
  import { deviceOptionsStore as deviceInfo } from '@hcengineering/ui'
  import { onDestroy } from 'svelte'
  import { currentFloor, ensureOfficeDetailsLoaded, officeView, rooms } from '../stores'

  import Floor from './Floor.svelte'
  import FloorConfigure from './FloorConfigure.svelte'

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
    <SpecialView _class={love.mixin.MeetingEventLink} label={love.string.Meetings} icon={love.icon.Cam} />
  {:else if $officeView === 'permanent'}
    <SpecialView
      _class={love.class.PermanentMeeting}
      label={love.string.PermanentMeetings}
      icon={love.icon.MeetingMinutes}
      createLabel={love.string.NewMeeting}
      createComponent={love.component.CreatePermanentMeetingPopup}
    />
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
