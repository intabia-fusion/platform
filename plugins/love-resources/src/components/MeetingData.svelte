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
  import type { Ref } from '@hcengineering/core'
  import type { Room } from '@hcengineering/love'
  import { Button, CheckBox, Label, ModernToggle } from '@hcengineering/ui'
  import type { Writable } from 'svelte/store'
  import love from '../plugin'
  import RoomSelector from './RoomSelector.svelte'
  import RepeatEveryEditor from './RepeatEveryEditor.svelte'
  import { myOffice, rooms } from '../stores'

  export let state: Writable<Record<string, any>>

  function changeRoom (val: Ref<Room>): void {
    $state.room = val
  }

  function changeIsMeeting (val: boolean): void {
    $state.isMeeting = val
    if (val && $state.room === undefined) {
      $state.room = $myOffice?._id
    }
    if (!val) {
      // A regular meeting is scheduled by an event: without the meeting there is nothing to make
      // regular, and a stale flag would create a meeting nobody asked for.
      changeIsPermanent(false)
    }
  }

  // A meeting is either one-off or regular: the switch replaces the two independent checkboxes that
  // used to allow "a meeting that is also permanent" as a third, meaningless state.
  let isMeeting = false
  let isPermanent = $state.isPermanent === true

  function changeIsPermanent (val: boolean): void {
    isPermanent = val
    $state.isPermanent = val
    // Default period of a regular meeting: a week, the same as the one the editor starts from.
    if (val && $state.repeatEvery === undefined) $state.repeatEvery = 7 * 24 * 60 * 60 * 1000
    if (!val) $state.repeatEvery = undefined
  }

  function changeRepeatEvery (val: number): void {
    $state.repeatEvery = val
  }

  $: selectedRoom = $rooms.find((r) => r._id === $state.room)
  $: isPrivateRoom = selectedRoom?.startPrivate ?? false
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
  <div class="flex-row-center gap-1-5 mt-1">
    <ModernToggle
      size="small"
      checked={isPermanent}
      on:change={() => {
        changeIsPermanent(!isPermanent)
      }}
    />
    <Label label={love.string.RecurringMeeting} />
  </div>
  {#if isPermanent}
    <div class="flex-row-center gap-2 mt-1 ml-4">
      <Label label={love.string.RepeatEvery} />
      <RepeatEveryEditor value={$state.repeatEvery} onChange={changeRepeatEvery} />
    </div>
  {/if}
{/if}
