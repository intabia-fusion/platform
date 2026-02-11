<script lang="ts">
  import { Person } from '@hcengineering/contact'
  import { Ref } from '@hcengineering/core'
  import { isOffice, Room } from '@hcengineering/love'
  import { ActionIcon, closePopup } from '@hcengineering/ui'
  import love from '../plugin'
  import { myInfo } from '../stores'
  import { kick } from '../meetings'
  import { sendInvites } from '../invites'

  export let room: Room
  export let person: Ref<Person>

  $: isMyOffice = isOffice(room) && room.person === $myInfo?.person
</script>

<div class="p-3 flex-gap-2 antiPopup">
  {#if isMyOffice && person !== $myInfo?.person}
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
  {#if person !== $myInfo?.person}
    <ActionIcon
      size={'small'}
      label={love.string.Invite}
      icon={love.icon.Invite}
      action={() => {
        console.log('[PersonActionPopup] Inviting person:', person)
        closePopup()
        sendInvites([person])
      }}
    />
  {/if}
</div>

<style lang="scss">
  .antiPopup {
    flex-direction: row;
    margin-top: -0.75rem;
  }
</style>
