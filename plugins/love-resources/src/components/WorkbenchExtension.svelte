<script lang="ts">
  import { pushRootBarComponent } from '@hcengineering/ui'
  import { RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEvent, Track } from 'livekit-client'
  import { onDestroy, onMount } from 'svelte'
  import { subscribeToIncomingInvites, unsubscribeFromIncomingInvites } from '../invites'
  import { lkIsConnecting, lkSessionConnected } from '../liveKitClient'
  import love from '../plugin'
  import { myConnectingSessionId } from '../stores'
  import { liveKitClient, lk } from '../utils'
  import { get } from 'svelte/store'

  let parentElement: HTMLDivElement

  function handleTrackSubscribed (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    _participant: RemoteParticipant
  ): void {
    if (track.kind === Track.Kind.Audio) {
      const element = track.attach()
      element.id = publication.trackSid
      parentElement.appendChild(element)
    }
  }

  function handleTrackUnsubscribed (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    _participant: RemoteParticipant
  ): void {
    if (track.kind === Track.Kind.Audio) {
      const element = document.getElementById(publication.trackSid)
      if (element != null) {
        parentElement.removeChild(element)
      }
    }
  }

  onMount(async () => {
    pushRootBarComponent('left', love.component.ControlExt, 20)
    pushRootBarComponent('left', love.component.InvitesExt, 25)
    lk.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

    // Subscribe to incoming meeting invites
    subscribeToIncomingInvites()

    // Attach existing audio tracks from already connected participants
    // This fixes the issue where audio is not heard when joining a room with existing participants
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          const element = publication.track.attach()
          element.id = publication.trackSid
          parentElement.appendChild(element)
        }
      }
    }
  })

  onDestroy(async () => {
    lk.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
    // Unsubscribe from incoming invites
    unsubscribeFromIncomingInvites()
    // Do not disconnect if the current session initiated a connect (user is in the process of connecting)
    // or if the LiveKit client is currently connecting
    if ($lkSessionConnected && $myConnectingSessionId === null && !$lkIsConnecting) {
      await liveKitClient.disconnect()
    }
  })
</script>

<div bind:this={parentElement} class="hidden"></div>
