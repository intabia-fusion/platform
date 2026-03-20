<script lang="ts">
  import { pushRootBarComponent } from '@hcengineering/ui'
  import {
    Participant,
    RemoteParticipant,
    RemoteTrack,
    RemoteTrackPublication,
    RoomEvent,
    Track,
    TrackPublication
  } from 'livekit-client'
  import { onDestroy, onMount } from 'svelte'
  import { subscribeToIncomingInvites, unsubscribeFromIncomingInvites } from '../invites'
  import { lkIsConnecting, lkReconnected, lkSessionConnected } from '../liveKitClient'
  import love from '../plugin'
  import { myConnectingSessionId } from '../stores'
  import { liveKitClient, lk } from '../utils'
  import { get } from 'svelte/store'

  let parentElement: HTMLDivElement
  let audioUnlocked = false

  interface AudioContextState {
    state: string
    sampleRate?: number
    currentTime?: number
    error?: string
  }

  /**
   * Ensure the Room-level AudioContext is resumed (unlocks autoplay).
   * LiveKit SDK handles this internally but we call it explicitly
   * to cover edge cases where browser blocked audio playback.
   *
   * When force is true, bypasses the audioUnlocked flag and checks the actual
   * AudioContext state — needed when Safari suspends audio after initial unlock.
   */
  async function ensureAudioUnlocked (force: boolean = false): Promise<void> {
    if (!force && audioUnlocked) return
    try {
      // Check actual AudioContext state when forcing recovery
      if (force) {
        const ctxState = getAudioContextState()
        if (ctxState.state === 'running') return
        console.log('[WorkbenchExtension] AudioContext not running, forcing startAudio()', { state: ctxState.state })
        audioUnlocked = false
      }
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
   * Get current audio context state for debugging Safari audio issues.
   */
  function getAudioContextState (): AudioContextState {
    try {
      // @ts-expect-error - accessing internal LiveKit audio context
      const audioCtx = lk.audioContext
      if (audioCtx != null) {
        return {
          state: audioCtx.state as string,
          sampleRate: audioCtx.sampleRate as number,
          currentTime: audioCtx.currentTime as number
        }
      }
      return { state: 'not_available' }
    } catch (e) {
      return { state: 'error', error: String(e) }
    }
  }

  /**
   * Get current state of all audio elements for debugging.
   */
  function getAudioElementsState (): Array<{
    id: string
    paused: boolean
    muted: boolean
    volume: number
    readyState: number
  }> {
    if (parentElement == null) return []
    const audioElements = Array.from(parentElement.children) as HTMLAudioElement[]
    return audioElements.map((el) => ({
      id: el.id,
      paused: el.paused,
      muted: el.muted,
      volume: el.volume,
      readyState: el.readyState
    }))
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

  function handleTrackMuted (publication: TrackPublication, participant: Participant): void {
    if (publication.track?.kind !== Track.Kind.Audio) return

    console.log('[WorkbenchExtension.handleTrackMuted] Audio track muted', {
      trackSid: publication.trackSid,
      participantId: participant.identity,
      participantName: participant.name,
      isLocal: participant.isLocal,
      audioContextState: getAudioContextState(),
      audioElements: getAudioElementsState()
    })
  }

  function handleTrackUnmuted (publication: TrackPublication, participant: Participant): void {
    if (publication.track?.kind !== Track.Kind.Audio) return

    console.log('[WorkbenchExtension.handleTrackUnmuted] Audio track unmuted', {
      trackSid: publication.trackSid,
      participantId: participant.identity,
      participantName: participant.name,
      isLocal: participant.isLocal,
      audioContextState: getAudioContextState(),
      audioElementsBefore: getAudioElementsState()
    })

    // Safari fix: when remote participant unmutes, AudioContext may get suspended
    // Force check actual AudioContext state and re-unlock if needed
    if (!participant.isLocal) {
      void ensureAudioUnlocked(true).then(() => {
        // Check if any audio elements got paused after the unmute event
        setTimeout(() => {
          const pausedElements = getAudioElementsState().filter((el) => el.paused)
          if (pausedElements.length > 0) {
            console.warn(
              '[WorkbenchExtension.handleTrackUnmuted] Found paused audio elements after unmute, retrying playback',
              {
                pausedCount: pausedElements.length,
                pausedIds: pausedElements.map((el) => el.id)
              }
            )
            retryPausedAudioElements()
          }
          console.log('[WorkbenchExtension.handleTrackUnmuted] Audio elements after recovery', {
            audioElements: getAudioElementsState()
          })
        }, 100)
      })
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
    lk.on(RoomEvent.TrackMuted, handleTrackMuted)
    lk.on(RoomEvent.TrackUnmuted, handleTrackUnmuted)

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
    lk.off(RoomEvent.TrackMuted, handleTrackMuted)
    lk.off(RoomEvent.TrackUnmuted, handleTrackUnmuted)
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
