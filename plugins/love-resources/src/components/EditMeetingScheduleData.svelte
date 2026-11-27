<!--
// Copyright © 2025 Hardcore Engineering Inc.
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
  import type { Schedule } from '@hcengineering/calendar'
  import love from '../plugin'
  import RoomSelector from './RoomSelector.svelte'
  import { getClient } from '@hcengineering/presentation'
  import type { Ref } from '@hcengineering/core'
  import type { Room } from '@hcengineering/love'
  import { Button } from '@hcengineering/ui'
  import { openDoc } from '@hcengineering/view-resources'

  export let value: Schedule

  const client = getClient()

  $: isMeetingSchedule = client.getHierarchy().hasMixin(value, love.mixin.MeetingSchedule)
  $: meetingSchedule = isMeetingSchedule ? client.getHierarchy().as(value, love.mixin.MeetingSchedule) : null

  async function changeRoom (val: Ref<Room>): Promise<void> {
    const schedules = await client.findAll(value._class, { _id: value._id }, { projection: { _id: 1 } })
    for (const schedule of schedules) {
      await client.updateMixin(schedule._id, schedule._class, schedule.space, love.mixin.MeetingSchedule, { room: val })
    }
  }

  // The schedule owns the meeting it created; the row is the way to its settings and sessions.
  async function openMeeting (): Promise<void> {
    const id = meetingSchedule?.meetingId
    if (id === undefined) return
    const meeting = await client.findOne(love.class.PermanentMeeting, { _id: id })
    if (meeting === undefined) return
    await openDoc(client.getHierarchy(), meeting)
  }
</script>

{#if isMeetingSchedule && meetingSchedule}
  <div class="flex-col gap-2">
    <RoomSelector value={meetingSchedule?.room} on:change={(ev) => changeRoom(ev.detail)} />
    {#if meetingSchedule.meetingId !== undefined}
      <Button
        label={love.string.PermanentMeeting}
        kind="ghost"
        justify="left"
        icon={love.icon.MeetingMinutes}
        on:click={openMeeting}
      />
    {/if}
  </div>
{/if}
