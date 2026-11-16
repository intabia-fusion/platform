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
  Card of a scheduled meeting: the strip at the top of its panel. The calendar's own editor (the
  popup a tile click opens) is `EditEvent`, which a meeting extends with its block of room, link and
  "start meeting" controls; this card is what the meeting document is opened with.
  Time, participants and the recurrence rule belong to the calendar event and are edited in the
  calendar editor (Edit -> "Повторить"), not here.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import type { Ref } from '@hcengineering/core'
  import { meetingMasterQuery, type MeetingEventLink, type PermanentMeeting } from '@hcengineering/love'
  import { EventRsvp } from '@hcengineering/calendar-resources'
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { CheckBox, EditBox, Label, showPopup, type PopupOptions } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { findMeetingLink } from '../meetingLink'
  import { joinMeetingBySession, leaveMeeting, seriesIdOf } from '../meetings'
  import { currentMeetingMinutes } from '../stores'
  import { lkSessionConnected } from '../liveKitClient'
  import { DEFAULT_MEETING_REMINDER } from '../utils'

  export let object: Event
  export let readonly: boolean = false
  // Passed by showPopup; declared only so the framework does not warn about an unknown prop.
  export let popupOptions: PopupOptions | undefined = undefined

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
    if (settings !== undefined) showPopup(love.component.PermanentMeetingForm, { object: settings }, 'content')
    else showPopup(calendar.component.EditEvent, { object: live }, 'content')
  }

  // A permanent meeting is joined by itself: its series carries no participants.
  async function joinLive (): Promise<void> {
    const link = await findMeetingLink(client, live)
    const permanent = link?.permanentMeeting
    if (permanent !== undefined) void joinMeetingBySession(permanent, 'meeting')
    else void joinMeetingBySession(seriesIdOf(live), 'event')
  }

  // The card is a session of this meeting while the service has one: by series for a plain meeting,
  // by the permanent meeting behind the series for a scheduled one. A calendar query hands over a
  // bare event with no mixin, so the back-reference is read the same way the tile reads its link.
  let permanentMeeting: Ref<PermanentMeeting> | undefined = undefined

  $: void resolvePermanentMeeting(live)

  async function resolvePermanentMeeting (event: Event): Promise<void> {
    const link = await findMeetingLink(client, event)
    permanentMeeting = link?.permanentMeeting
  }

  $: sameMeeting =
    $currentMeetingMinutes !== undefined &&
    ($currentMeetingMinutes.eventId === seriesIdOf(live) ||
      (permanentMeeting !== undefined && $currentMeetingMinutes.meeting === permanentMeeting))
  $: inThisCall = $lkSessionConnected && (sameMeeting || $currentMeetingMinutes === undefined)

  async function leaveOrClose (): Promise<void> {
    await leaveMeeting()
    dispatch('close')
  }
</script>

<div class="flex flex-col">
  <div class="flex flex-row">
    <div class="flex flex-grow space-between gap-2 mb-4">
      <!-- The title is an EditBox like the room and session cards use: it is the same row of a card
           header, and a plain div of another font size left the buttons sitting off the baseline. -->
      <div class="title flex-grow">
        <EditBox disabled={true} placeholder={love.string.Meeting} bind:value={live.title} focusIndex={1} />
      </div>
      {#if !readonly}
        <Button label={presentation.string.Edit} size="large" kind="secondary" on:click={openEditor} />
      {/if}
      <!-- While this meeting is the one being attended the action leaves it instead of offering to
           join it again: the same rule the room and session cards follow. -->
      {#if inThisCall}
        <Button label={love.string.LeaveRoom} size="large" kind="negative" on:click={leaveOrClose} />
      {:else}
        <Button label={love.string.JoinMeeting} size="large" kind="primary" on:click={joinLive} />
      {/if}
    </div>
  </div>
  {#if !readonly}
    <div class="reminder flex-row-center gap-2">
      <CheckBox
        checked={reminderOn}
        kind="primary"
        on:value={(ev) => {
          void toggleReminder(ev.detail)
        }}
      />
      <span class="text-sm content-color"><Label label={love.string.RemindBefore} /></span>
    </div>
  {/if}  <!-- The answer of the person looking at the card, or the counts of everyone else's: the card is
       the only place a meeting from the planner is opened, and RSVP used to live in the calendar
       popup only. -->
  <EventRsvp object={live} /></div>
