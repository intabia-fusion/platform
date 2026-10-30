<!--
// Copyright © 2024 Hardcore Engineering Inc.
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
<script lang="ts">
  import presentation, { createQuery, getClient } from '@hcengineering/presentation'
  import { EditBox, Label } from '@hcengineering/ui'
  import { Button } from '@hcengineering/ui/kit'
  import view from '@hcengineering/view'
  import type { MeetingMinutes, PendingRecording, ParticipantInfo } from '@hcengineering/love'
  import { MeetingStatus } from '@hcengineering/love'
  import { createEventDispatcher, onMount } from 'svelte'

  import love from '../plugin'
  import { joinMeeting, leaveMeeting } from '../meetings'
  import { currentMeetingMinutes, infos, myConnectingSessionId, rooms, connectingToMeeting } from '../stores'
  import { lkIsConnecting, lkSessionConnected } from '../liveKitClient'
  import { getMetadata } from '@hcengineering/platform'
  import { AccountRole, type Ref } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import ParticipantsPreview from './ParticipantsPreview.svelte'
  import PendingRecordingPresenter from './PendingRecordingPresenter.svelte'
  import { openWidgetTab } from '@hcengineering/workbench-resources'
  import { setMeetingPrivate } from '../meetingPrivacy'
  import { videoVisible } from '../utils'

  export let object: MeetingMinutes
  export let readonly: boolean = false

  const client = getClient()
  const dispatch = createEventDispatcher()

  const currentAccount = getCurrentAccount()

  let currentName = object.name
  let newName = object.name

  $: if (object.name !== currentName) {
    newName = object.name
    currentName = object.name
  }

  async function changeName (): Promise<void> {
    await client.diffUpdate(object, { name: newName })
  }

  let togglingPrivate = false
  async function togglePrivate (): Promise<void> {
    if (togglingPrivate) return
    togglingPrivate = true
    try {
      await setMeetingPrivate(object, !object.private)
    } finally {
      togglingPrivate = false
    }
  }

  // Check if current user is owner of the meeting
  $: isOwner = object.owners?.includes(currentAccount.uuid) ?? false

  let togglingStartOnLink = false
  async function toggleStartOnLink (): Promise<void> {
    if (togglingStartOnLink) return
    togglingStartOnLink = true
    try {
      await client.update(object, { startOnLink: object.startOnLink !== true })
    } finally {
      togglingStartOnLink = false
    }
  }

  // Content of a private space is readable only by members, even for the workspace owner.
  $: isOutsider = object.private && !object.members.includes(currentAccount.uuid)

  const contentKeys = ['descriptionRef', 'summary', 'attachments', 'recordings', 'transcription', 'messages', 'todos']
  let mounted = false
  $: if (mounted) {
    dispatch('open', {
      ignoreKeys: isOutsider ? ['name', ...contentKeys] : ['name'],
      activityOptions: { enabled: !isOutsider, showInput: !isOutsider }
    })
  }

  onMount(() => {
    mounted = true
  })

  let joining = false
  async function join (): Promise<void> {
    if (joining) return
    joining = true
    try {
      await client.update(object, { $push: { members: currentAccount.uuid } })
    } finally {
      joining = false
    }
  }

  // Check if pending join is for THIS session (same browser tab)
  $: currentSessionId = getMetadata(presentation.metadata.SessionId)
  $: hasPendingJoinInThisSession =
    $myConnectingSessionId !== null && $myConnectingSessionId === currentSessionId && $lkIsConnecting

  async function connect (): Promise<void> {
    if ($connectingToMeeting) return
    await joinMeeting(object)
  }

  let leavingRoom = false
  async function handleLeaveRoom (): Promise<void> {
    if (leavingRoom) return
    leavingRoom = true
    try {
      await leaveMeeting()
    } finally {
      leavingRoom = false
    }
  }

  $: connectLabel = object.status !== MeetingStatus.Scheduled ? love.string.JoinMeeting : love.string.StartMeeting

  function showConnectionButton (
    object: MeetingMinutes,
    connecting: boolean,
    isConnected: boolean,
    role?: AccountRole
  ): boolean {
    if (role === AccountRole.Guest || role === AccountRole.ReadOnlyGuest) {
      return false
    }

    if (object.status === MeetingStatus.Finished) {
      return false
    }
    // Show during connecting with spinner
    if (connecting) return true
    // Do not show connect button if we are already connected to the room
    if (isConnected && $currentMeetingMinutes?._id === object._id) return false

    return true
  }

  function getInfo (mm: Ref<MeetingMinutes>, info: ParticipantInfo[]): ParticipantInfo[] {
    return info.filter((p) => p.meeting === mm)
  }

  $: roomInfos = getInfo(object._id, $infos)

  $: room = $rooms.find((it) => it._id === object.roomId)

  const pendingQuery = createQuery()
  let pendingRecordings: PendingRecording[] = []

  $: pendingQuery.query(love.class.PendingRecording, { attachedTo: object._id }, (result) => {
    pendingRecordings = result
  })
</script>

<div class="flex flex-col">
  <div class="flex flex-row">
    <div class="flex flex-grow flex-between gap-2 mb-4">
      <div class="title flex-grow" data-id="meeting-name-input">
        <EditBox
          disabled={readonly}
          placeholder={love.string.MeetingMinutes}
          bind:value={newName}
          on:change={changeName}
          focusIndex={1}
        />
      </div>
      {#if isOwner}
        <Button
          label={object.private ? love.string.OpenRoom : love.string.CloseRoom}
          size="large"
          kind={object.private ? 'secondary' : 'primary'}
          on:click={togglePrivate}
          data-id="meeting-toggle-private"
          loading={togglingPrivate}
        />
        <Button
          label={love.string.StartOnLink}
          size="large"
          kind={object.startOnLink === true ? 'primary' : 'secondary'}
          on:click={toggleStartOnLink}
          data-id="meeting-toggle-start-on-link"
          loading={togglingStartOnLink}
        />
      {/if}
      {#if showConnectionButton(object, hasPendingJoinInThisSession || $connectingToMeeting, $lkSessionConnected, currentAccount.role)}
        <Button
          label={connectLabel}
          size="large"
          kind="primary"
          on:click={connect}
          loading={hasPendingJoinInThisSession || $connectingToMeeting}
          data-id="meeting-connect"
        />
      {:else if $lkSessionConnected}
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
          loading={leavingRoom}
          data-id="meeting-leave"
        />
      {/if}
    </div>
  </div>
  {#if object != null && roomInfos.length > 0 && room != null}
    <div class="room-preview">
      <ParticipantsPreview info={roomInfos} />
    </div>
  {/if}
  {#if isOutsider}
    <div class="joinOverlay">
      <div class="header"><Label label={love.string.PrivateMeetingJoinHeader} /></div>
      <span><Label label={love.string.PrivateMeetingJoinText} /></span>
      <span class="mt-4" />
      <Button label={view.string.Join} kind="primary" loading={joining} on:click={join} data-id="meeting-join" />
    </div>
  {/if}
  {#if pendingRecordings.length > 0}
    <div class="pending-recordings">
      {#each pendingRecordings as recording}
        <PendingRecordingPresenter value={recording} />
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
  .room-preview {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .joinOverlay {
    display: flex;
    flex-direction: column;
    align-items: center;
    align-self: center;
    text-align: center;
    max-width: 35rem;
    margin-top: 2rem;
  }
  .header {
    font-weight: 600;
    margin: 1rem;
    color: var(--theme-caption-color);
  }
  .pending-recordings {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
</style>
