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
<!--
  Panel header of a scheduled meeting. Time, participants and the recurrence rule belong to the
  calendar event and are edited in the calendar editor (Edit -> "Повторить"), not here. The header
  shows the live title and the meeting controls only; the rest of the panel is the generic one.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import { meetingMasterQuery, type MeetingEventLink, type PermanentMeeting } from '@hcengineering/love'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { CheckBox, Label, showPopup } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { joinMeetingBySession } from '../meetings'
  import { DEFAULT_MEETING_REMINDER } from '../utils'

  export let object: Event
  export let readonly: boolean = false

  const dispatch = createEventDispatcher()
  const client = getClient()

  // A meeting card opened in the calendar can be a single occurrence, not the series. The title
  // follows the master, so it refreshes when the calendar editor renames or moves the meeting.
  let master: Event = object
  let live: Event = object
  const query = createQuery(true)

  async function resolveMaster (): Promise<void> {
    const found = await client.findOne(calendar.class.Event, meetingMasterQuery(object))
    if (found !== undefined) master = found
  }

  $: void resolveMaster()

  $: query.query(master._class, { _id: master._id }, (res) => {
    if (res.length > 0) live = res[0]
  })

  // Absent means the default lead, 0 means the meeting keeps quiet.
  $: reminderBefore = (live as MeetingEventLink & Event).reminderBefore ?? DEFAULT_MEETING_REMINDER
  $: reminderOn = reminderBefore > 0

  async function toggleReminder (on: boolean): Promise<void> {
    await client.updateMixin(live._id, live._class, live.space, love.mixin.MeetingEventLink, {
      reminderBefore: on ? DEFAULT_MEETING_REMINDER : 0
    })
  }

  onMount(() => {
    dispatch('open', { ignoreKeys: ['title', 'reminderBefore', 'rules'] })
  })

  // A meeting is edited through the window that created it: the calendar editor would ask on save
  // whether the change is the occurrence or the series, and for a meeting that is one document.
  let settings: PermanentMeeting | undefined = undefined
  const settingsQuery = createQuery(true)

  $: {
    const id = (live as MeetingEventLink).permanentMeeting
    if (id !== undefined) {
      settingsQuery.query(love.class.PermanentMeeting, { _id: id }, (res) => {
        settings = res[0]
      })
    }
  }

  function openEditor (): void {
    if (settings !== undefined) showPopup(love.component.PermanentMeetingForm, { object: settings })
    else showPopup(calendar.component.EditEvent, { object: live }, 'content')
  }
</script>

<div class="flex-col gap-1 mb-4">
  <div class="flex-row-center flex-between flex-gap-2">
    <div class="title overflow-label flex-grow">{live.title}</div>
    {#if !readonly}
      <Button label={presentation.string.Edit} size="small" on:click={openEditor} />
    {/if}
    <Button
      label={love.string.JoinMeeting}
      size="large"
      kind="primary"
      on:click={() => {
        void joinMeetingBySession(live.eventId, 'event')
      }}
    />
  </div>
  {#if !readonly}
    <div class="flex-row-center gap-1-5">
      <CheckBox
        checked={reminderOn}
        kind="primary"
        on:value={(ev) => {
          void toggleReminder(ev.detail)
        }}
      />
      <span class="text-sm text-content-color"><Label label={love.string.RemindBefore} /></span>
    </div>
  {/if}
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
</style>
