<script lang="ts">
  import { pushRootBarComponent } from '@hcengineering/ui'
  import { RemoteParticipant, RemoteTrack, RemoteTrackPublication, RoomEvent, Track } from 'livekit-client'
  import { onDestroy, onMount } from 'svelte'
  import { subscribeToIncomingInvites, unsubscribeFromIncomingInvites } from '../invites'
  import { lkIsConnecting, lkReconnected, lkSessionConnected } from '../liveKitClient'
  import love from '../plugin'
  import { myConnectingSessionId } from '../stores'
  import { liveKitClient, lk } from '../utils'
  import { get } from 'svelte/store'

  let parentElement: HTMLDivElement
  let audioUnlocked = false

  /**
   * Ensure the Room-level AudioContext is resumed (unlocks autoplay).
   * LiveKit SDK handles this internally but we call it explicitly
   * to cover edge cases where browser blocked audio playback.
   */
  async function ensureAudioUnlocked (): Promise<void> {
    if (audioUnlocked) return
    try {
      await lk.startAudio()
      audioUnlocked = true
      console.log('[WorkbenchExtension] Audio context unlocked via startAudio()')
    } catch (err) {
      console.warn('[WorkbenchExtension] startAudio() failed, will retry on user interaction', err)
    }
  }

  /**
   * Try to play an audio element with retry on user interaction.
   */
  function safePlay (element: HTMLAudioElement, trackSid: string): void {
    element.play().catch((err) => {
      console.warn('[WorkbenchExtension] Audio play() failed, will retry on interaction', {
        trackSid,
        errorName: err.name,
        errorMessage: err.message
      })
      // Register one-time click handler to resume playback on user interaction
      const resumeHandler = (): void => {
        void ensureAudioUnlocked().then(() => {
          retryPausedAudioElements()
        })
        document.removeEventListener('click', resumeHandler)
        document.removeEventListener('keydown', resumeHandler)
      }
      document.addEventListener('click', resumeHandler, { once: true })
      document.addEventListener('keydown', resumeHandler, { once: true })
    })
  }

  /**
   * Retry playing all paused audio elements in the container.
   */
  function retryPausedAudioElements (): void {
    if (parentElement == null) return
    const audioElements = Array.from(parentElement.children) as HTMLAudioElement[]
    for (const el of audioElements) {
      if (el.paused && !el.ended) {
        el.play().catch((err) => {
          console.warn('[WorkbenchExtension] Retry play() still failed', {
            trackSid: el.id,
            error: err.message
          })
        })
      }
    }
  }

  function attachAudioTrack (
    track: RemoteTrack,
    publication: RemoteTrackPublication,
    participant?: RemoteParticipant
  ): void {
    // Avoid duplicate elements for the same track
    if (parentElement?.querySelector(`#${CSS.escape(publication.trackSid)}`) != null) {
      return
    }

    const element = track.attach() as HTMLAudioElement
    element.id = publication.trackSid
    element.autoplay = true
    parentElement.appendChild(element)

    console.log('[WorkbenchExtension] Audio element attached', {
      trackSid: publication.trackSid,
      participant: participant?.identity ?? 'unknown',
      parentChildrenCount: parentElement?.children?.length ?? 0
    })

    safePlay(element, publication.trackSid)
  }

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
        isMuted: track.isMuted
      })
      void ensureAudioUnlocked()
      attachAudioTrack(track, publication, participant)
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
        participantName: participant.name
      })
      const element = parentElement?.querySelector(`#${CSS.escape(publication.trackSid)}`)
      if (element != null) {
        track.detach(element as HTMLMediaElement)
        element.remove()
      }
    }
  }

  /**
   * Re-attach all remote audio tracks. Called after LiveKit reconnect
   * to ensure audio elements reference the new MediaStreams.
   */
  function reattachAllAudioTracks (): void {
    if (parentElement == null) return

    console.log('[WorkbenchExtension] Reattaching audio tracks after reconnect')

    // Detach tracks before removing elements to avoid dangling references in LiveKit SDK
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          const element = parentElement.querySelector(`#${CSS.escape(publication.trackSid)}`)
          if (element != null) {
            publication.track.detach(element as HTMLMediaElement)
          }
        }
      }
    }

    // Remove stale audio elements
    while (parentElement.firstChild != null) {
      parentElement.removeChild(parentElement.firstChild)
    }

    // Re-attach from current remote participants
    let count = 0
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          attachAudioTrack(publication.track, publication, participant)
          count++
        }
      }
    }

    console.log('[WorkbenchExtension] Reattached audio tracks', { count })

    void ensureAudioUnlocked()
  }

  /**
   * Attach existing audio tracks from already connected participants.
   */
  function attachExistingAudioTracks (): void {
    let attachedCount = 0
    for (const participant of lk.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (publication.track?.kind === Track.Kind.Audio && publication.isSubscribed) {
          attachAudioTrack(publication.track, publication, participant)
          attachedCount++
        }
      }
    }

    console.log('[WorkbenchExtension.onMount] Attached existing audio tracks', {
      attachedCount,
      totalAudioElements: parentElement?.children?.length ?? 0
    })
  }

  let unsubReconnect: (() => void) | undefined

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

    // Attach existing audio tracks
    attachExistingAudioTracks()

    // Unlock audio context
    void ensureAudioUnlocked()

    // Listen for reconnect events to re-attach audio elements
    unsubReconnect = lkReconnected.subscribe(() => {
      // Skip initial subscription call (value is 0)
      if (get(lkReconnected) > 0) {
        audioUnlocked = false
        reattachAllAudioTracks()
      }
    })
  })

  onDestroy(async () => {
    console.log('[WorkbenchExtension.onDestroy] Destroying WorkbenchExtension', {
      lkState: lk.state,
      audioElementsCount: parentElement?.children?.length ?? 0
    })

    lk.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    lk.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
    unsubReconnect?.()
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
