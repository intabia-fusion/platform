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
    participant: RemoteParticipant
  ): void {
    if (track.kind === Track.Kind.Audio) {
      console.log('[WorkbenchExtension.handleTrackSubscribed] Audio track subscribed', {
        trackSid: publication.trackSid,
        participant: participant.identity,
        participantName: participant.name,
        isMuted: track.isMuted,
        mediaStreamTrackReadyState: track.mediaStreamTrack?.readyState,
        mediaStreamTrackMuted: track.mediaStreamTrack?.muted
      })
      const element = track.attach() as HTMLAudioElement
      element.id = publication.trackSid
      element.autoplay = true
      parentElement.appendChild(element)

      console.log('[WorkbenchExtension.handleTrackSubscribed] Audio element attached', {
        trackSid: publication.trackSid,
        elementId: element.id,
        elementPaused: element.paused,
        elementMuted: element.muted,
        elementReadyState: element.readyState,
        parentChildrenCount: parentElement?.children?.length ?? 0
      })

      // Try to play and log any errors
      element.play().catch((err) => {
        console.error('[WorkbenchExtension.handleTrackSubscribed] Audio play() failed', {
          trackSid: publication.trackSid,
          errorName: err.name,
          errorMessage: err.message,
          participant: participant.identity
        })
      })
    }
  }

  function handleTrackUnsubscribed (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant: RemoteParticipant
  ): void {
    if (track.kind === Track.Kind.Audio) {
      console.log('[WorkbenchExtension.handleTrackUnsubscribed] Audio track unsubscribed', {
        trackSid: publication.trackSid,
        participant: participant.identity,
        participantName: participant.name,
        parentChildrenCount: parentElement?.children?.length ?? 0
      })
      const element = document.getElementById(publication.trackSid)
      if (element != null) {
        parentElement.removeChild(element)
        console.log('[WorkbenchExtension.handleTrackUnsubscribed] Audio element removed', {
          trackSid: publication.trackSid,
          remainingChildrenCount: parentElement?.children?.length ?? 0
        })
      } else {
        console.warn('[WorkbenchExtension.handleTrackUnsubscribed] Audio element not found for removal', {
          trackSid: publication.trackSid
        })
      }
    }
  }

  // Validate audio elements are functioning properly
  function validateAudioElements (): void {
    if (parentElement == null) {
      console.log('[WorkbenchExtension.validateAudioElements] No parent element')
      return
    }

    const audioElements = Array.from(parentElement.children) as HTMLAudioElement[]
    console.log('[WorkbenchExtension.validateAudioElements] Validating audio elements', {
      totalElements: audioElements.length,
      connectionState: lk.state
    })

    audioElements.forEach((el, index) => {
      const trackSid = el.id
      console.log(`[WorkbenchExtension.validateAudioElements] Audio element ${index}`, {
        trackSid,
        paused: el.paused,
        muted: el.muted,
        ended: el.ended,
        readyState: el.readyState,
        currentTime: el.currentTime,
        volume: el.volume,
        error: el.error?.code ?? null,
        networkState: el.networkState
      })
    })
  }

  onMount(async () => {
    console.log('[WorkbenchExtension.onMount] Mounting WorkbenchExtension', {
      lkState: lk.state,
      remoteParticipantsCount: lk.remoteParticipants.size
    })

    pushRootBarComponent('left', love.component.ControlExt, 20)
    pushRootBarComponent('left', love.component.InvitesExt, 25)
    lk.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)

    // Subscribe to incoming meeting invites
    subscribeToIncomingInvites()

    // Attach existing audio tracks from already connected participants
    // This fixes the issue where audio is not heard when joining a room with existing participants
    let attachedCount = 0
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          console.log('[WorkbenchExtension.onMount] Attaching existing audio track', {
            trackSid: publication.trackSid,
            participant: participant.identity,
            isMuted: publication.track.isMuted,
            mediaStreamTrackReadyState: publication.track.mediaStreamTrack?.readyState
          })
          const element = publication.track.attach() as HTMLAudioElement
          element.id = publication.trackSid
          element.autoplay = true
          parentElement.appendChild(element)
          attachedCount++

          element.play().catch((err) => {
            console.error('[WorkbenchExtension.onMount] Failed to play existing audio', {
              trackSid: publication.trackSid,
              error: err.message
            })
          })
        }
      }
    }

    console.log('[WorkbenchExtension.onMount] Finished attaching existing audio tracks', {
      attachedCount,
      totalAudioElements: parentElement?.children?.length ?? 0
    })

    // Validate audio elements after initial setup
    validateAudioElements()
  })

  onDestroy(async () => {
    console.log('[WorkbenchExtension.onDestroy] Destroying WorkbenchExtension', {
      lkState: lk.state,
      audioElementsCount: parentElement?.children?.length ?? 0
    })

    lk.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
    // Unsubscribe from incoming invites
    unsubscribeFromIncomingInvites()
    // Do not disconnect if the current session initiated a connect (user is in the process of connecting)
    // or if the LiveKit client is currently connecting
    if ($lkSessionConnected && $myConnectingSessionId === null && !$lkIsConnecting) {
      console.log('[WorkbenchExtension.onDestroy] Disconnecting LiveKit')
      await liveKitClient.disconnect()
    } else {
      console.log('[WorkbenchExtension.onDestroy] Skipping disconnect', {
        lkSessionConnected: $lkSessionConnected,
        myConnectingSessionId: $myConnectingSessionId,
        lkIsConnecting: $lkIsConnecting
      })
    }
  })
</script>

<div bind:this={parentElement} class="hidden"></div>
