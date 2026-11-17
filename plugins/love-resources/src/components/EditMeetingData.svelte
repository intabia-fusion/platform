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
  import calendar, { type Event, type ReccuringInstance } from '@hcengineering/calendar'
  import type { Ref } from '@hcengineering/core'
  import love from '../plugin'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { ObjectPresenter } from '@hcengineering/view-resources'
  import type { MeetingEventLink, MeetingMinutes, PermanentMeeting, Room } from '@hcengineering/love'
  import { LIVE_MEETING_STATUSES, meetingMasterQuery } from '@hcengineering/love'
  // Icons come off the default export: `@hcengineering/ui` exports no `Icon<Name>` components, so a
  // named import is `undefined` and the button renders empty.
  import ui, { Icon, Label, eventToHTMLElement, showPopup } from '@hcengineering/ui'
  // The kit, not the legacy barrel: `x-small` is not a kit size, and mixing the two buttons in one row
  // left the primary action a different height from the icon button next to it.
  import { Button, IconButton } from '@hcengineering/ui/kit'
  import MeetingMinutesStatusPresenter from './MeetingMinutesStatusPresenter.svelte'
  import PermanentMeetingPresenter from './PermanentMeetingPresenter.svelte'
  import RoomPresenter from './RoomPresenter.svelte'
  import RoomSelector from './RoomSelector.svelte'
  import { confirmRoomAvailable, joinMeeting, joinMeetingBySession, leaveMeeting } from '../meetings'
  import { findMeetingLink } from '../meetingLink'
  import MeetingLinkPopup from './MeetingLinkPopup.svelte'

  export let value: Event
  export let readOnly: boolean = false

  const valueQuery = createQuery()
  const meetingQuery = createQuery()
  const roomQuery = createQuery()
  const permanentQuery = createQuery()

  let _value: Event = value

  $: valueQuery.query(value._class, { _id: value._id }, (r) => {
    _value = r.shift() ?? value
  })
  const client = getClient()

  // The mixin is resolved through its document, not read off the event: the calendar hands over bare
  // events, and an expanded occurrence carries no mixin at all - only its master does. Reading it off
  // the object hid the whole meeting row for every occurrence of a series, which for a permanent
  // meeting also meant no way to open its card or join it.
  let meeting: MeetingEventLink | undefined
  $: void resolveMeeting(_value)

  async function resolveMeeting (event: Event): Promise<void> {
    meeting = await findMeetingLink(client, event)
  }

  // A permanent meeting is an entity of its own: it runs in the workspace meeting room and owns no
  // office room, so there is no room to pick here and no room to take over.
  $: isPermanent = meeting?.permanentMeeting !== undefined

  let meetingDoc: MeetingMinutes | undefined
  // The room the meeting happens in, as a document: the row shows it as a link into the room card,
  // the way the session row links into the session card.
  let roomDoc: Room | undefined
  // A permanent meeting is a document of its own, and its card is where the meeting is managed -
  // showing it as a link keeps the drill-down the room link has.
  let permanentDoc: PermanentMeeting | undefined
  $: permanentRef = meeting?.permanentMeeting

  // An expanded occurrence is virtual: `getInstance` gives it a brand new eventId that exists in
  // no database. Everything about the meeting hangs off the series, so resolve that instead.
  $: seriesEventId = (_value as ReccuringInstance).recurringEventId ?? _value.eventId

  $: if (permanentRef !== undefined) {
    permanentQuery.query(love.class.PermanentMeeting, { _id: permanentRef }, (r) => {
      permanentDoc = r.shift()
    })
  } else {
    permanentDoc = undefined
  }

  $: if (meeting?.room !== undefined) {
    roomQuery.query(love.class.Room, { _id: meeting.room }, (r) => {
      roomDoc = r.shift()
    })
  } else {
    roomDoc = undefined
  }

  // A session exists only while the meeting is running - it is looked up by the series, not by a
  // reference on the event, which no longer holds one.
  $: meetingQuery.query(
    love.class.MeetingMinutes,
    { eventId: seriesEventId, status: { $in: LIVE_MEETING_STATUSES } },
    (r) => {
      meetingDoc = r.shift()
    }
  )

  async function openMeeting (): Promise<void> {
    // A permanent meeting is an entity of its own: it is joined by its own id, and it is open at any
    // time - there is no occurrence to wait for and no room to take over.
    if (permanentRef !== undefined) {
      await joinMeetingBySession(permanentRef, 'meeting')
      return
    }
    // The room hosts one meeting at a time: a newcomer may evict the one already running there, but
    // only by saying so.
    if (!(await confirmRoomAvailable(meeting?.room, seriesEventId))) return
    // Sessions of a series are opened by the love service, addressed by the event. The old path
    // stays for meetings whose mixin still points at a session created by the client (F1 §7).
    if (seriesEventId !== undefined && meeting?.linkVersion !== undefined) {
      await joinMeetingBySession(seriesEventId, 'event')
      return
    }
    if (meetingDoc === undefined) return
    await joinMeeting(meetingDoc)
  }

  /**
   * The room is part of the meeting, not of one occurrence, so it is written on the series master.
   * A live session already holds a room and cannot be moved out of it.
   */
  async function changeRoom (room: Ref<Room>): Promise<void> {
    if (meetingDoc !== undefined || isPermanent) return
    const master = await client.findOne(calendar.class.Event, meetingMasterQuery(_value))
    if (master === undefined) return
    await client.updateMixin(master._id, master._class, master.space, love.mixin.MeetingEventLink, { room })
  }

  async function closeMeeting (): Promise<void> {
    await leaveMeeting()
  }

  // A running session is entered by its own document; the click handler closes over the variable,
  // which loses the `!== undefined` narrowing the template block had. Joining dials the room, so
  // a second click while it is in flight is dropped instead of opening a second connection.
  let joining = false
  async function joinCurrent (): Promise<void> {
    if (meetingDoc === undefined || joining) return
    joining = true
    try {
      await joinMeeting(meetingDoc)
    } finally {
      joining = false
    }
  }
</script>

{#if meeting !== undefined}
  <!-- One row with a single gap, no per-child margins: the label, the room and the actions keep the
       same 8px rhythm at any width, and the actions never squeeze the primary button into its label. -->
  <div class="meeting-row flex-row-center mt-2">
    <div class="flex-row-center gap-2 shrink-0">
      <Icon icon={love.icon.MeetingMinutes} size="small" />
      <Label label={love.string.Meeting} />
    </div>
    <!-- The room the meeting takes place in. A live session is shown as the session card, a room as
         a link into the room card - the same drill-down the session row has. A permanent meeting has
         no room at all: its own card is shown instead, and a roomless one-off event says where it
         runs and still offers to pick a room. -->
    <div class="room flex-grow">
      {#if meetingDoc !== undefined}
        <ObjectPresenter
          shouldShowAvatar={false}
          objectId={meetingDoc._id}
          _class={meetingDoc._class}
          value={meetingDoc}
        />
      {:else if permanentDoc !== undefined}
        <PermanentMeetingPresenter value={permanentDoc} accent noUnderline />
      {:else if roomDoc !== undefined}
        <RoomPresenter value={roomDoc} accent />
      {:else if !isPermanent}
        {#if readOnly}
          <span class="text-sm content-color"><Label label={love.string.MeetingRunsInServiceRoom} /></span>
        {:else}
          <RoomSelector
            value={meeting?.room}
            on:change={(ev) => {
              void changeRoom(ev.detail)
            }}
          />
        {/if}
      {/if}
    </div>
    <div class="actions flex-row-center gap-2 shrink-0">
      {#if meetingDoc !== undefined}
        <MeetingMinutesStatusPresenter object={meetingDoc} value={meetingDoc.status} attributeKey="status" />
      {/if}
      {#if !readOnly}
        <IconButton
          icon={ui.icon.Gear}
          size="small"
          kind="tertiary"
          tooltip={{ label: love.string.MeetingLinkSettings }}
          on:click={(e) => {
            showPopup(MeetingLinkPopup, { event: _value }, eventToHTMLElement(e))
          }}
        />
      {/if}
      <!-- A running session is entered directly: the room is already open, there is nothing to start. -->
      {#if meetingDoc !== undefined && isPermanent}
        <Button
          kind="secondary"
          label={love.string.JoinAsParticipant}
          size="small"
          loading={joining}
          on:click={joinCurrent}
        />
      {/if}
      <!-- Any participant may start a scheduled meeting, not only its owner; a permanent one is
           always open, so its action is joining it rather than starting it. -->
      {#if meetingDoc !== undefined}
        <Button kind="negative" label={love.string.EndMeeting} size="small" on:click={closeMeeting} />
      {:else if isPermanent}
        <Button kind="primary" label={love.string.JoinMeeting} size="small" on:click={openMeeting} />
      {:else}
        <Button kind="primary" label={love.string.StartMeeting} size="small" on:click={openMeeting} />
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .meeting-row {
    gap: 0.5rem;
    min-width: 0;
  }

  .room {
    min-width: 0;
  }

  .actions {
    margin-left: auto;
  }
</style>
