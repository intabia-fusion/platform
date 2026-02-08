<script lang="ts">
  import { Ref } from '@hcengineering/core'
  import { MeetingMinutes } from '@hcengineering/love'
  import { pushRootBarComponent } from '@hcengineering/ui'
  import { RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEvent, Track } from 'livekit-client'
  import { onDestroy, onMount } from 'svelte'
  import { subscribeJoinRequests, unsubscribeJoinRequests } from '../joinRequests'
  import { lkSessionConnected } from '../liveKitClient'
  import love from '../plugin'
  import { myInfo, myConnectingSessionId } from '../stores'
  import { liveKitClient, lk } from '../utils'

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

  function subscribeMeetingRequests (meeting?: Ref<MeetingMinutes>): void {
    unsubscribeJoinRequests()
      .then(() => subscribeJoinRequests(meeting))
      .catch((e) => {
        console.log(e)
      })
  }

  $: subscribeMeetingRequests($myInfo?.meeting)

  onMount(async () => {
    pushRootBarComponent('left', love.component.ControlExt, 20)
    lk.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

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
    // Do not disconnect if the current session initiated a connect (user is in the process of connecting)
    // or if the LiveKit client is currently connecting
    if ($lkSessionConnected && $myConnectingSessionId === null && !liveKitClient.isConnecting) {
      await liveKitClient.disconnect()
    }
  })
</script>

<div bind:this={parentElement} class="hidden"></div>
