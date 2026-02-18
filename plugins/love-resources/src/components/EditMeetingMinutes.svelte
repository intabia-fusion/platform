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
  import presentation, { getClient } from '@hcengineering/presentation'
  import { EditBox, ModernButton } from '@hcengineering/ui'
  import { MeetingMinutes, MeetingStatus } from '@hcengineering/love'
  import { createEventDispatcher, onMount } from 'svelte'

  import love from '../plugin'
  import { joinMeeting } from '../meetings'
  import { currentMeetingMinutes, myConnectingSessionId } from '../stores'
  import { lkSessionConnected } from '../liveKitClient'
  import { getMetadata } from '@hcengineering/platform'
  import { liveKitClient } from '../utils'

  export let object: MeetingMinutes
  export let readonly: boolean = false

  const client = getClient()
  const dispatch = createEventDispatcher()

  let currentTitle = object.title
  let newTitle = object.title

  $: if (object.title !== currentTitle) {
    newTitle = object.title
    currentTitle = object.title
  }

  async function changeTitle (): Promise<void> {
    await client.diffUpdate(object, { title: newTitle })
  }

  onMount(() => {
    dispatch('open', { ignoreKeys: ['title'] })
  })

  const isConnecting = liveKitClient.isConnecting

  // Check if pending join is for THIS session (same browser tab)
  $: currentSessionId = getMetadata(presentation.metadata.SessionId)
  $: hasPendingJoinInThisSession = ($myConnectingSessionId !== null && $myConnectingSessionId === currentSessionId) && $isConnecting

  async function connect (): Promise<void> {
    await joinMeeting(object)
  }

  $: connectLabel = object.status !== MeetingStatus.Scheduled ? love.string.JoinMeeting : love.string.StartMeeting

  function showConnectionButton (object: MeetingMinutes, connecting: boolean, isConnected: boolean): boolean {
    if (object.status === MeetingStatus.Finished) {
      return false
    }
    // Show during connecting with spinner
    if (connecting) return true
    // Do not show connect button if we are already connected to the room
    if (isConnected && $currentMeetingMinutes?._id === object._id) return false

    return true
  }
</script>

<div class="flex-row-stretch">
  <div class="row flex-grow">
    <div class="title">
      <EditBox
        disabled={readonly}
        placeholder={love.string.MeetingMinutes}
        bind:value={newTitle}
        on:change={changeTitle}
        focusIndex={1}
      />
    </div>
    {#if showConnectionButton(object, hasPendingJoinInThisSession, $lkSessionConnected)}
      <ModernButton label={connectLabel} size="large" kind={'primary'} on:click={connect} loading={hasPendingJoinInThisSession} />
    {/if}
  </div>
</div>

<style lang="scss">
  .title {
    font-weight: 500;
    font-size: 1.25rem;
    color: var(--theme-caption-color);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    justify-content: space-between;
  }
</style>
