<script lang="ts">
  import { aiBotSocialIdentityStore } from '@hcengineering/ai-bot-resources'
  import ParticipantView from './ParticipantView.svelte'
  import { Participant, RemoteParticipant, RoomEvent } from 'livekit-client'
  import { onDestroy, onMount } from 'svelte'
  import { liveKitClient, lk } from '../../utils'
  import { infos, currentMeetingMinutes } from '../../stores'
  import { Ref } from '@hcengineering/core'
  import { Person } from '@hcengineering/contact'
  import { getPersonRefByPersonIdCb } from '@hcengineering/contact-resources'
  import { Room as TypeRoom, MeetingMinutes, ParticipantInfo, Room } from '@hcengineering/love'

  export let room: Ref<TypeRoom>

  interface ParticipantData {
    _id: string
    participant: Participant | undefined
    isAgent: boolean
  }

  let aiPersonRef: Ref<Person> | undefined
  $: if ($aiBotSocialIdentityStore != null) {
    getPersonRefByPersonIdCb($aiBotSocialIdentityStore?._id, (ref) => {
      if (ref != null) {
        aiPersonRef = ref
      }
    })
  } else {
    aiPersonRef = undefined
  }

  let participants: ParticipantData[] = []

  onMount(async () => {
    await liveKitClient.awaitConnect()

    // Populate initial participants from current LiveKit room state
    for (const participant of lk.remoteParticipants.values()) {
      attachParticipant(participant)
    }

    // Include local participant (if available)
    attachParticipant(lk.localParticipant)

    // Subscribe to LiveKit participant lifecycle events
    lk.on(RoomEvent.ParticipantConnected, attachParticipant)
    lk.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
  })

  onDestroy(() => {
    lk.off(RoomEvent.ParticipantConnected, attachParticipant)
    lk.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
  })

  // Attach or update a participant entry (using LiveKit identity as key).
  function attachParticipant (participant: Participant): void {
    if (participant == null) return
    if (participant.identity == null || participant.identity === '') return

    const current = participants.find((p) => p._id === participant.identity)
    if (current !== undefined) {
      current.participant = participant
      participants = participants
      return
    }

    // Add new participant
    const value: ParticipantData = {
      _id: participant.identity,
      participant,
      isAgent: participant.isAgent
    }
    participants.push(value)
    participants = participants
  }

  function handleParticipantDisconnected (participant: RemoteParticipant): void {
    const index = participants.findIndex((p) => p._id === participant.identity)
    if (index !== -1) {
      participants.splice(index, 1)
      participants = participants
    }
  }

  function updateParticipants (
    data: ParticipantInfo[],
    currentMeeting: MeetingMinutes | undefined,
    room: Ref<Room>
  ): void {
    const _participants: ParticipantData[] = []
    for (const info of data) {
      // Filter by meeting if available, otherwise fallback to room
      const infoMeeting = info.meeting as Ref<MeetingMinutes> | undefined
      if (currentMeeting !== undefined && infoMeeting !== currentMeeting._id) continue
      if (currentMeeting === undefined && info.room !== room) continue

      // Find existing participant from LiveKit
      const existing = participants.find((p) => p._id === info.person)

      const value: ParticipantData = {
        _id: info.person,
        participant: existing?.participant,
        isAgent: info.person === aiPersonRef
      }
      _participants.push(value)
    }
    participants = _participants
  }

  $: updateParticipants($infos, $currentMeetingMinutes, room)
</script>

{#each participants as participant (participant._id)}
  <div class="video">
    <ParticipantView {...participant} />
  </div>
{/each}
