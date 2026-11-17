<!--
// Copyright © 2026 Intabia Fusion.
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
  Panel header of a permanent meeting: the name, followed live, and the way into the meeting. The
  document, attachments and chat below it are rendered by the generic panel, the same way a session
  gets them. The settings of the meeting - name, members, period, guest password - have one place,
  the gear of the meeting row in the office navigator, so this header carries no settings of its own.
-->
<script lang="ts">
  import calendar, { type Event } from '@hcengineering/calendar'
  import { LIVE_MEETING_STATUSES, type MeetingMinutes, type PermanentMeeting } from '@hcengineering/love'
  import { createQuery, getClient } from '@hcengineering/presentation'
  import { EditBox } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import { createEventDispatcher, onMount } from 'svelte'
  import love from '../plugin'
  import { joinMeeting, joinMeetingBySession, leaveMeeting } from '../meetings'
  import { currentMeetingMinutes } from '../stores'
  import { lkSessionConnected } from '../liveKitClient'
  import { videoVisible } from '../utils'
  import { openWidgetTab } from '@hcengineering/workbench-resources'

  export let object: PermanentMeeting
  export let readonly: boolean = false

  const client = getClient()
  const dispatch = createEventDispatcher()

  let live: PermanentMeeting = object
  // Destroyed with the card: a non-destroying query would keep its subscription (and this component
  // with it) for the whole session, one pair per opened meeting.
  const query = createQuery()

  $: query.query(object._class, { _id: object._id }, (res) => {
    if (res.length > 0) live = res[0] as PermanentMeeting
  })

  let currentName = object.name
  let newName = object.name

  $: if (live.name !== currentName) {
    newName = live.name
    currentName = live.name
  }

  // The series created together with the meeting carries the same title: renaming one renames the
  // other, otherwise the planner and the meeting list keep showing the old name.
  async function changeName (): Promise<void> {
    const name = newName.trim()
    if (name === '' || name === live.name) return
    await client.diffUpdate(live, { name })
    const series = await client.findAll(calendar.class.Event, {
      [`${love.mixin.MeetingEventLink}.permanentMeeting`]: object._id
    } as any)
    for (const event of series) {
      if (event.title !== name) await client.update(event as Event, { title: name })
    }
  }

  // Both read in the header, and the attributes panel below would repeat them: the period has its own
  // editor in the settings window, the name is edited here.
  onMount(() => {
    dispatch('open', { ignoreKeys: ['name', 'repeatEvery'] })
  })

  // A session someone already started is a meeting in progress: a member joins it as a participant
  // instead of opening the room, which would start a session of their own.
  let liveSession: MeetingMinutes | undefined
  const sessionQuery = createQuery()

  $: sessionQuery.query(
    love.class.MeetingMinutes,
    { meeting: object._id, status: { $in: LIVE_MEETING_STATUSES } },
    (res) => {
      liveSession = res[0]
    }
  )

  // Joining a running session directly: the room is already open, there is nothing to start.
  function joinLive (): void {
    if (liveSession === undefined) return
    void joinMeeting(liveSession)
  }

  // The header follows the call, the way a room card does on develop: while this meeting is the one
  // being attended the button leaves it instead of offering to join again - otherwise entering from
  // here left a "Join meeting" button in front of a person who is already inside.
  $: inThisMeeting =
    $lkSessionConnected && ($currentMeetingMinutes?.meeting === object._id || $currentMeetingMinutes === undefined)

  let leaving = false
  async function handleLeaveRoom (): Promise<void> {
    if (leaving) return
    leaving = true
    try {
      await leaveMeeting()
    } finally {
      leaving = false
    }
  }
</script>

<div class="flex-row-center flex-between flex-gap-2 mb-4">
  <div class="title flex-grow">
    <EditBox
      disabled={readonly}
      placeholder={love.string.PermanentMeeting}
      bind:value={newName}
      on:change={changeName}
      focusIndex={1}
    />
  </div>
  {#if inThisMeeting}
    {#if !$videoVisible}
      <Button
        label={love.string.ShowVideo}
        size="large"
        kind="secondary"
        on:click={() => {
          openWidgetTab(love.ids.MeetingWidget, 'video')
        }}
      />
    {/if}
    <Button
      label={love.string.LeaveRoom}
      size="large"
      kind="negative"
      on:click={handleLeaveRoom}
      loading={leaving}
      data-id="permanent-meeting-leave"
    />
  {:else}
    {#if liveSession !== undefined}
      <Button label={love.string.JoinAsParticipant} size="large" kind="secondary" on:click={joinLive} />
    {/if}
    <Button
      label={love.string.JoinMeeting}
      size="large"
      kind="primary"
      on:click={() => {
        void joinMeetingBySession(live._id, 'meeting')
      }}
      data-id="permanent-meeting-join"
    />
  {/if}
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
</style>
