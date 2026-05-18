<script lang="ts">
  import { ButtonMenu, DropdownIntlItem, IconMoreV } from '@hcengineering/ui'
  import { Action } from '@hcengineering/view'
  import { getResource } from '@hcengineering/platform'
  import { lkSessionConnected } from '../../../liveKitClient'
  import { getActions } from '@hcengineering/view-resources'
  import love from '../../../plugin'
  import { MeetingMinutes, Room } from '@hcengineering/love'
  import { getClient } from '@hcengineering/presentation'

  export let room: Room
  export let meetingMinutes: MeetingMinutes | undefined = undefined
  export let kind: 'primary' | 'secondary' | 'tertiary' | 'negative' = 'secondary'
  export let size: 'large' | 'medium' | 'small' | 'extra-small' | 'min' = 'large'

  let actions: Action[] = []
  let moreItems: DropdownIntlItem[] = []

  const client = getClient()

  $: void loadActions(room, meetingMinutes)

  async function loadActions (_room: Room, _mm: MeetingMinutes | undefined): Promise<void> {
    const roomActions = await getActions(client, room, love.class.Room)
    let mmActions: Action[] = []
    if (meetingMinutes !== undefined) {
      mmActions = await getActions(client, meetingMinutes, love.class.MeetingMinutes)
    }
    actions = [...roomActions, ...mmActions]
  }

  $: moreItems = actions.map((action) => ({
    id: action._id,
    label: action.label,
    icon: action.icon
  }))

  async function handleMenuOption (e: CustomEvent<DropdownIntlItem['id']>): Promise<void> {
    const action = actions.find((action) => action._id === e.detail)
    if (action !== undefined) {
      await handleAction(action)
    }
  }

  async function handleAction (action: Action): Promise<void> {
    const fn = await getResource(action.action)
    // Pass the appropriate object based on action target
    if (action.target === love.class.MeetingMinutes && meetingMinutes !== undefined) {
      await fn(meetingMinutes)
    } else {
      await fn(room)
    }
  }
</script>

{#if $lkSessionConnected && moreItems.length > 0}
  <ButtonMenu
    items={moreItems}
    icon={IconMoreV}
    tooltip={{ label: love.string.MoreOptions, direction: 'top' }}
    {kind}
    {size}
    noSelection
    on:selected={handleMenuOption}
  />
{/if}
