<script lang="ts">
  import { DocNavLink } from '@hcengineering/view-resources'
  import { MeetingMinutes, MeetingStatus, Room } from '@hcengineering/love'
  import { onMount } from 'svelte'
  import { meetings } from '../../stores'
  import { formatElapsedTime } from '../../utils'

  export let room: Room

  let currentMeetingMinutes: MeetingMinutes | undefined

  // Live from the meetings store: a one-shot findOne would never pick up the meeting start.
  $: currentMeetingMinutes = $meetings.find(
    (m) => m.roomId === room._id && (m.status === MeetingStatus.Active || m.status === MeetingStatus.Pending)
  )

  let now = Date.now()

  onMount(() => {
    const interval = setInterval(() => {
      now = Date.now()
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  })
</script>

{#if currentMeetingMinutes !== undefined}
  <div class="flex-between flex-gap-2">
    <DocNavLink object={room}>
      <span class="font-medium-12 secondary-textColor overflow-label">{room.name}</span>
    </DocNavLink>

    <!-- elapsed time from start -->
    {#if currentMeetingMinutes?.createdOn !== undefined}
      {@const elapsed = now - currentMeetingMinutes.createdOn}
      <div class="font-medium-12 secondary-textColor">{formatElapsedTime(elapsed)}</div>
    {/if}
  </div>
{/if}

<div class="flex-between flex-gap-2">
  <!-- title -->
  {#if currentMeetingMinutes !== undefined}
    <DocNavLink object={currentMeetingMinutes}>
      <span class="font-medium overflow-label">{currentMeetingMinutes.name}</span>
    </DocNavLink>
  {:else}
    <DocNavLink object={room}>
      <span class="font-medium overflow-label">{room.name}</span>
    </DocNavLink>
  {/if}
</div>
