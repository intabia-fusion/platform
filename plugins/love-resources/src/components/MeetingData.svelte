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
<!--
  Meeting switch of the event form. A repeating event has no office room: the picker stays out.
-->
<script lang="ts">
  import type { RecurringRule } from '@hcengineering/calendar'
  import type { Ref } from '@hcengineering/core'
  import type { Room } from '@hcengineering/love'
  import { Button, CheckBox, Label } from '@hcengineering/ui'
  import type { Writable } from 'svelte/store'
  import love from '../plugin'
  import RoomSelector from './RoomSelector.svelte'
  import { myOffice, rooms } from '../stores'

  export let state: Writable<Record<string, any>>
  // The repeat rule the calendar form holds. It decides only whether a room can be picked: a series
  // of meetings lives in the workspace meeting room, so there is nothing to choose there.
  export let rules: RecurringRule[] = []

  let isMeeting = $state.isMeeting === true

  $: selectedRoom = $rooms.find((r) => r._id === $state.room)
  $: isPrivateRoom = selectedRoom?.startPrivate ?? false
  $: repeats = rules.length > 0
  // A permanent meeting is an entity of its own: it lives in the workspace's meeting room and owns no
  // office room, so a room picked before the repeat was set must not travel with it.
  $: if (repeats && $state.room !== undefined) $state.room = undefined

  function changeIsMeeting (val: boolean): void {
    $state.isMeeting = val
  }

  // `withRoom`: a one-off meeting is usually held in a place, so the own office is picked for it.
  // A repeating one has nowhere to pick from, and defaulting a room there would create the very
  // setting this form is meant to leave empty.
  function enableMeeting (withRoom: boolean): void {
    isMeeting = true
    changeIsMeeting(true)
    if (withRoom && $state.room === undefined) {
      $state.room = $myOffice?._id
    }
  }

  function changeRoom (val: Ref<Room>): void {
    $state.room = val
  }
</script>

<div class="flex-row-center gap-1-5 mt-1">
  <CheckBox
    bind:checked={isMeeting}
    kind="primary"
    on:value={(ev) => {
      changeIsMeeting(ev.detail)
    }}
  />
  <Button
    label={love.string.CreateMeeting}
    kind="ghost"
    padding="0 .5rem"
    justify="left"
    flex="1"
    on:click={() => {
      if (isMeeting) {
        isMeeting = false
        changeIsMeeting(false)
        return
      }
      enableMeeting(!repeats)
    }}
  />
</div>
{#if isMeeting && !repeats}
  <RoomSelector
    value={$state.room}
    on:change={(ev) => {
      changeRoom(ev.detail)
    }}
  />
  {#if isPrivateRoom}
    <div class="text-sm mt-1 ml-4 text-content-color">
      <Label label={love.string.Private} />
    </div>
  {/if}
{/if}
