<script lang="ts">
  import { getCurrentEmployee, Person } from '@hcengineering/contact'
  import { Ref } from '@hcengineering/core'
  import { isOffice, Room } from '@hcengineering/love'
  import { ActionIcon, closePopup } from '@hcengineering/ui'
  import love from '../plugin'
  import { myOffice } from '../stores'
  import { createMeeting, kick } from '../meetings'
  import { sendInvites } from '../invites'

  export let room: Room
  export let person: Ref<Person>

  const me = getCurrentEmployee()
  // Check if this is my office using myOffice store (available even when not in a meeting)
  $: isMyOffice = isOffice(room) && room._id === $myOffice?._id
  $: isSelf = person === me
</script>

<div class="p-3 flex-gap-2 antiPopup">
  {#if isMyOffice && !isSelf}
    <ActionIcon
      size={'small'}
      label={love.string.Kick}
      icon={love.icon.Kick}
      action={() => {
        closePopup()
        void kick(person)
      }}
    />
  {/if}
  {#if isSelf && isMyOffice}
    <!--
      Clicking own avatar in own office: start a meeting in this office.
      Otherwise the popup would be empty (kick/invite are blocked for self)
      and the owner has no entry point to host a meeting in their own room.
    -->
    <div data-id="start-own-meeting">
      <ActionIcon
        size={'small'}
        label={love.string.StartMeeting}
        icon={love.icon.MeetingMinutes}
        action={() => {
          closePopup()
          void createMeeting(room)
        }}
      />
    </div>
  {/if}
  {#if !isSelf}
    <div data-id="person-invite-call">
      <ActionIcon
        size={'small'}
        label={love.string.Invite}
        icon={love.icon.Invite}
        action={() => {
          closePopup()
          sendInvites([person])
        }}
      />
    </div>
  {/if}
</div>

<style lang="scss">
  .antiPopup {
    flex-direction: row;
    margin-top: -0.75rem;
  }
</style>
