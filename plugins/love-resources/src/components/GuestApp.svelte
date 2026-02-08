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
<script lang="ts">
  // GuestApp: full-screen application that handles guest join flow.
  // It watches location query params (meetingId, guestToken), requests `/guestInfo`
  // and attempts to auto-resolve/select the workspace (via login.function.SelectWorkspace).
  // If workspace can be selected and returns a token, we navigate to the workspace+meeting.
  // Otherwise we remain on the public Guest flow (GuestJoinPopup).

  import GuestJoinPopup from './GuestJoinPopup.svelte'
  import ScreenSharingView from './meeting/ScreenSharingView.svelte'
  import GuestParticipantsListView from './meeting/GuestParticipantsListView.svelte'
  import { lkSessionConnected } from '../liveKitClient'
  import { liveKitClient } from '../utils'
  import { onDestroy } from 'svelte'
  import ui, { location, navigate, Modal, Location, Popup, Button } from '@hcengineering/ui'
  import { getMetadata, getResource } from '@hcengineering/platform'
  import login from '@hcengineering/login'

  import love from '../plugin'
  import { MeetingMinutes, MeetingStatus } from '@hcengineering/love'
  import { workbenchId } from '@hcengineering/workbench'
  import GuestControlBar from './GuestControlBar.svelte'
  import { Ref, WorkspaceUuid } from '@hcengineering/core'

  // Route params
  let meetingId: string | undefined = undefined
  let guestToken: string | undefined = undefined
  let errorMessage: string | null = null

  // Guest info / resolution state
  let guestInfo: {
    meetingId: Ref<MeetingMinutes>
    workspace: WorkspaceUuid
    workspaceUrl: string
    meetingStatus: MeetingStatus
    roomFound: boolean
    title: string
  } | null = null
  let resolving = false
  let resolveError: string | null = null
  // When we fail to fetch guest info, surface the error to the UI
  // (resolveError will be displayed in the modal)

  // ref to GuestJoinPopup to trigger join programmatically
  let guestJoinRef: any = null

  // Live view state for guest presentation
  let withScreenSharing: boolean = false
  let gridStyle = ''
  let columns: number = 0
  let rows: number = 0
  const guestRoomPlaceholder: any = undefined

  function updateStyle (count: number, screenSharing: boolean): void {
    columns = screenSharing ? 1 : Math.min(Math.ceil(Math.sqrt(count)), 8)
    rows = Math.ceil(count / columns)
    gridStyle = `grid-template-columns: repeat(${columns}, 1fr); aspect-ratio: ${columns * 1280}/${rows * 720};`
  }

  async function leaveGuest (): Promise<void> {
    try {
      await liveKitClient.disconnect()
    } catch (err: any) {
      console.error('Failed to disconnect guest', err)
    }
  }

  function handleLocation (loc: Location): void {
    const q = loc.query ?? {}
    meetingId = q.meetingId ?? undefined
    guestToken = q.guestToken ?? undefined

    if (meetingId == null || guestToken == null) {
      errorMessage = 'Ссылка некорректна или устарела.'
      guestInfo = null
    } else {
      errorMessage = null
      // Fire-and-forget: fetch guest info and attempt to resolve workspace
      void fetchGuestInfo()
    }
  }

  async function fetchGuestInfo (): Promise<void> {
    if (meetingId == null || guestToken == null) return

    resolving = true
    resolveError = null
    guestInfo = null

    try {
      const endpoint = getMetadata(love.metadata.ServiceEndpoint)
      if (endpoint == null || endpoint === '') {
        throw new Error('Love service endpoint not found')
      }

      const resp = await fetch(`${endpoint}/guestInfo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: guestToken })
      })

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        throw new Error(`Failed to fetch guest info: ${resp.status} ${txt}`)
      }

      const data = await resp.json()
      guestInfo = data

      // Attempt automatic workspace resolve/select if URL is present
      const wsUrl = guestInfo?.workspaceUrl ?? guestInfo?.workspace ?? null
      if (wsUrl != null) {
        try {
          const selectFn = await getResource(login.function.SelectWorkspace)
          const selectResult = await selectFn?.(wsUrl, null, false)
          const [, loginInfo, ok] = selectResult ?? [undefined, null, false]
          // If selection completed successfully and returned login token — perform login/navigation
          if (ok && loginInfo?.token != null) {
            navigate({ path: [workbenchId, wsUrl, 'meetings'], query: { meetingId } }, true)
          }
        } catch (err: any) {
          // Swallow error — we'll remain in Public Guest flow
          console.error('selectWorkspace failed', err)
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch guest info', err)
      resolveError = err?.message ?? String(err)
    } finally {
      resolving = false
    }
  }

  function handleJoinFromGuestApp (): void {
    // Programmatically trigger child's join action (it will validate name and call /guestJoin)
    try {
      void guestJoinRef?.join?.()
    } catch (err: any) {
      console.error('Failed to trigger guest join', err)
    }
  }

  // Subscribe to location and ensure subscription is cleaned up automatically
  onDestroy(
    location.subscribe((loc) => {
      handleLocation(loc)
    })
  )

  // Ensure LiveKit is disconnected when this component is destroyed (e.g., modal closed)
  onDestroy(() => {
    if ($lkSessionConnected) {
      void liveKitClient.disconnect().catch((err: any) => {
        console.error('Failed to disconnect LiveKit on destroy', err)
      })
    }
  })

  function goHome (): void {
    // Navigate to root (workbench) - adjust if you prefer a different location
    navigate({ path: [] })
  }
</script>

<div class="guest-app">
  <div class="panel" class:full={$lkSessionConnected}>
    {#if errorMessage}
      <div class="center" role="alert">
        <div class="message">{errorMessage}</div>
        <div class="actions">
          <Button on:click={goHome} label={ui.string.Back}></Button>
        </div>
      </div>
    {:else if meetingId !== undefined && guestToken}
      <Modal
        type="type-component"
        hideFooter
        padding="0"
        on:close={() => {
          void leaveGuest()
        }}
      >
        <svelte:fragment slot="title">
          {guestInfo?.title ?? guestInfo?.workspaceUrl ?? 'Meeting'}
        </svelte:fragment>

        {#if resolving}
          <div class="center">
            <div class="message">Проверка ссылки и подготовка...</div>
          </div>
        {:else if $lkSessionConnected}
          <!-- Full-room view for connected guest -->
          <div class="room-container" class:sharing={withScreenSharing}>
            <div class="screenContainer">
              <ScreenSharingView bind:hasActiveTrack={withScreenSharing} />
            </div>
            <div class="videoGrid" style={withScreenSharing ? '' : gridStyle} class:scroll-m-0={withScreenSharing}>
              <GuestParticipantsListView
                room={guestRoomPlaceholder}
                on:participantsCount={(evt) => {
                  updateStyle(evt.detail, withScreenSharing)
                }}
              />
            </div>
          </div>

          <GuestControlBar {leaveGuest} />
        {:else}
          <div class="center">
            {#if guestInfo?.workspaceUrl != null && guestInfo.workspaceUrl !== ''}
              <div class="message">Приглашение в рабочую область: {guestInfo.workspaceUrl}</div>
            {/if}
            {#if resolveError}
              <div class="message" role="alert">Ошибка: {resolveError}</div>
            {/if}

            <!-- Show join UI (handles name prompt and connecting to LiveKit).
                   We pass workspace info so GuestJoinPopup can persist guest-id / prefill name. -->
            <GuestJoinPopup
              bind:this={guestJoinRef}
              {meetingId}
              {guestToken}
              workspaceId={guestInfo?.workspace ?? undefined}
              workspaceName={guestInfo?.workspaceUrl ?? undefined}
            />
          </div>
        {/if}
      </Modal>
    {:else}
      <!-- In case location hasn't been populated yet we show a small loader/placeholder -->
      <div class="center">
        <div class="message">Подготовка гостевого подключения...</div>
      </div>
    {/if}
  </div>
</div>
<Popup />

<style>
  .guest-app {
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    box-sizing: border-box;
    background: var(--app-bg, #ffffff);
  }

  .panel {
    width: 100%;
    max-width: 980px;
    height: 100%;
    max-height: 860px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel.full {
    max-width: none;
    max-height: none;
    width: 100%;
    height: 100%;
  }

  .room-container {
    display: flex;
    justify-content: center;
    padding: 1rem;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .screenContainer {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    max-height: 100%;
    min-height: 0;
    width: 100%;
    border-radius: 0.75rem;
  }

  .videoGrid {
    display: grid;
    grid-auto-rows: 1fr;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    max-height: 100%;
    max-width: 100%;
  }

  .videoGrid.scroll-m-0 {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.5rem 0;
    padding: 0 0.5rem;
    width: 15rem;
    min-width: 15rem;
    min-height: 0;
    max-width: 15rem;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    padding: 24px;
  }

  .message {
    font-size: 1.05rem;
    color: var(--text-muted, #666);
  }

  .actions {
    display: flex;
    gap: 8px;
  }
</style>
