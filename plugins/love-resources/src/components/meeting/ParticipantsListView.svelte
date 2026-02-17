<script lang="ts">
  import { aiBotSocialIdentityStore } from '@hcengineering/ai-bot-resources'
  import ParticipantView from './ParticipantView.svelte'
  import { Participant } from 'livekit-client'
  import { onMount } from 'svelte'
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
  })

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

      const value: ParticipantData = {
        _id: info.person,
        participant: undefined,
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
