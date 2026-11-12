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
  The body of the calendar event form: one checkbox that turns the event into a meeting, and the room
  the meeting takes place in. Without a room the session runs in the workspace service room, which is
  what every meeting did before rooms could be picked.
-->
<script lang="ts">
  import type { Ref } from '@hcengineering/core'
  import type { Room } from '@hcengineering/love'
  import { Button, CheckBox, Label } from '@hcengineering/ui'
  import type { Writable } from 'svelte/store'
  import love from '../plugin'
  import RoomSelector from './RoomSelector.svelte'
  import { myOffice, rooms } from '../stores'

  export let state: Writable<Record<string, any>>

  let isMeeting = $state.isMeeting === true

  $: selectedRoom = $rooms.find((r) => r._id === $state.room)
  $: isPrivateRoom = selectedRoom?.startPrivate ?? false

  function changeIsMeeting (val: boolean): void {
    $state.isMeeting = val
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
      isMeeting = !isMeeting
      changeIsMeeting(isMeeting)
      // The own office is where a person usually sits, so it is the default the room list opens on.
      if (isMeeting && $state.room === undefined) {
        $state.room = $myOffice?._id
      }
    }}
  />
</div>
{#if isMeeting}
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
