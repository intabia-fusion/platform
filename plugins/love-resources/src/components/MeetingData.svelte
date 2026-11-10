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
  The body of the calendar event form: one checkbox that turns the event into a meeting. The meeting
  is a standalone entity - it owns no office room, its session runs in the service room - so there is
  nothing else to pick here; room settings are per room in the office, not per meeting.
-->
<script lang="ts">
  import { Button, CheckBox, Label } from '@hcengineering/ui'
  import type { Writable } from 'svelte/store'
  import love from '../plugin'

  export let state: Writable<Record<string, any>>

  let isMeeting = $state.isMeeting === true

  function changeIsMeeting (val: boolean): void {
    $state.isMeeting = val
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
    }}
  />
</div>
{#if isMeeting}
  <div class="text-sm mt-1 ml-4 content-color">
    <Label label={love.string.MeetingRunsInServiceRoom} />
  </div>
{/if}
