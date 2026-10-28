<!--
// Copyright © 2024 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
-->
<script lang="ts">
  import type { DocNotificationSetting, UnreadContext } from '@hcengineering/notification'
  import notification from '@hcengineering/notification'
  import { translate } from '@hcengineering/platform'
  import { copyTextToClipboard, getClient } from '@hcengineering/presentation'
  import type { Action } from '@hcengineering/ui'
  import ui, { languageStore, lowercaseFirstLetter, Menu, showPopup } from '@hcengineering/ui'
  import { getLink, getObjectLinkId, IconPicker } from '@hcengineering/view-resources'
  import { NotificationClientImpl, MutePopup } from '@hcengineering/notification-resources'
  import { createEventDispatcher } from 'svelte'
  import view from '@hcengineering/view'
  import type { Space } from '@hcengineering/core'
  import { getCurrentAccount } from '@hcengineering/core'
  import type { Channel } from '@hcengineering/chunter'
  import workbench from '@hcengineering/workbench'

  import NavItem from './NavItem.svelte'
  import type { ChatNavItemModel } from '../types'
  import { isFakeDirect } from '../utils'
  import { openChannel, openChannelInSidebar, resetChunterLocIfEqual } from '../../../navigation'
  import chunter from '../../../plugin'
  import { leaveChannel, toggleChannelIcon } from '../../../utils'

  export let unread: UnreadContext | undefined
  export let item: ChatNavItemModel
  export let isSelected = false
  export let type: 'type-link' | 'type-tag' | 'type-anchor-link' | 'type-object' = 'type-link'

  const client = getClient()
  const hierarchy = client.getHierarchy()
  const dispatch = createEventDispatcher()
  const notificationClient = NotificationClientImpl.getClient()
  const settingByDocStore = notificationClient.docSettingByDoc

  let setting: DocNotificationSetting | undefined = undefined
  let count: number = 0
  let actions: Action[] = []

  $: void notificationClient.loadDocSetting(item.id)
  $: setting = $settingByDocStore.get(item.id) ?? undefined
  $: count = unread?.unreadMessagesCount ?? 0

  $: void getActions(item).then((res) => {
    actions = res
  })

  const linkProviders = client.getModel().findAllSync(view.mixin.LinkIdProvider, {})

  // The menu is built from the preview; an action that changes the document loads it when run.
  async function getActions ({ preview, chat, icon, iconProps }: ChatNavItemModel): Promise<Action[]> {
    if (isFakeDirect(preview)) return []
    const { objectId: _id, objectClass: _class } = preview
    const isChannel = hierarchy.isDerived(_class, chunter.class.Channel)
    const result: Action[] = []

    result.push({
      icon: view.icon.Open,
      label: view.string.Open,
      group: 'edit',
      action: async () => {
        const id = await getObjectLinkId(linkProviders, _id, _class)
        openChannel(id, _class, undefined, true)
      }
    })

    result.push({
      label: workbench.string.OpenInSidebar,
      icon: view.icon.DetailsFilled,
      group: 'edit',
      action: async () => {
        await openChannelInSidebar(_id, _class)
      }
    })

    if (isChannel) {
      result.push({
        label: chunter.string.CopyLink,
        icon: ui.icon.Copy,
        group: 'edit',
        action: async () => {
          // The promise goes straight in: awaiting first loses the click gesture in Safari.
          // A channel gone meanwhile fails the copy instead of putting an empty line in the clipboard
          const link = client.findOne(_class, { _id }).then(async (channel) => {
            if (channel == null) throw new Error(`Channel ${_id} not found`)
            return await getLink(channel)
          })
          await copyTextToClipboard(link)
        }
      })
    }

    const label = lowercaseFirstLetter(await translate(hierarchy.getClass(_class).label, {}, $languageStore))

    if (chat != null && !chat.pinned) {
      result.push({
        icon: view.icon.Star,
        label: chunter.string.Star,
        labelParams: { label },
        group: 'edit',
        action: async () => {
          await client.updateCollection(
            chat._class,
            chat.space,
            chat._id,
            chat.attachedTo,
            chat.attachedToClass,
            'chats',
            { pinned: true }
          )
        }
      })
    } else if (chat?.pinned === true) {
      result.push({
        icon: view.icon.Star,
        label: chunter.string.Unstar,
        group: 'edit',
        action: async () => {
          await client.updateCollection(
            chat._class,
            chat.space,
            chat._id,
            chat.attachedTo,
            chat.attachedToClass,
            'chats',
            { pinned: false }
          )
        }
      })
    }

    if (isChannel) {
      const { asset, emoji } = preview.icon ?? {}
      // The preview carries the default asset of a channel without its own icon
      const own = asset !== chunter.icon.Hashtag && asset !== chunter.icon.Lock ? asset : undefined
      result.push({
        icon,
        iconProps,
        label: chunter.string.ChangeIcon,
        group: 'tools',
        component: IconPicker,
        props: { icon: own, color: emoji },
        action: async () => {},
        onSubmenuResult: async (result) => {
          if (result == null) return
          const channel = (await client.findOne(_class, { _id })) as Channel | undefined
          if (channel != null) await toggleChannelIcon(channel, result.icon, result.color)
        }
      })
    }

    result.push({
      icon: notification.icon.Notifications,
      label: notification.string.EditNotifications,
      group: 'associate',
      component: MutePopup,
      props: { value: { _id, _class } },
      action: async () => {}
    })

    // A channel has a chat of the user only while they are a member: an open one they did not join has none
    if (isChannel && chat != null) {
      result.push({
        icon: view.icon.Delete,
        label: chunter.string.Leave,
        labelParams: { label },
        group: 'remove',
        action: async () => {
          const channel = (await client.findOne(_class, { _id })) as Space | undefined
          const me = getCurrentAccount().uuid
          if (channel?.members.includes(me) === true) {
            await leaveChannel(channel, me)
            return
          }
          // Not a member any more: there is nothing to leave, the chat only leaves the list
          await client.updateCollection(
            chat._class,
            chat.space,
            chat._id,
            chat.attachedTo,
            chat.attachedToClass,
            'chats',
            { hidden: true }
          )
          await resetChunterLocIfEqual(_id)
        }
      })
    } else if (!isChannel && chat != null && !chat.hidden) {
      result.push({
        icon: view.icon.EyeCrossed,
        label: chunter.string.HideFromChatList,
        group: 'remove',
        action: async () => {
          await client.updateCollection(
            chat._class,
            chat.space,
            chat._id,
            chat.attachedTo,
            chat.attachedToClass,
            'chats',
            { hidden: true }
          )
          await resetChunterLocIfEqual(_id)
        }
      })
    }

    return result
  }

  let pressed = false

  function handleContextMenu (event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()

    if (actions.length === 0) return
    pressed = true
    showPopup(Menu, { actions, ctx: { _id: item.id } }, event.target as HTMLElement, () => {
      pressed = false
    })
  }
</script>

<NavItem
  _id={item.id}
  icon={item.icon}
  withIconBackground={item.withIconBackground}
  iconSize={item.iconSize}
  {isSelected}
  iconProps={item.iconProps}
  {count}
  countColor={(unread?.notifiedMessagesCount ?? 0) === 0 ? 'gray' : 'red'}
  title={item.title}
  subTitle={item.subTitle}
  identifier={item.identifier}
  {actions}
  {type}
  muted={setting?.mode === 'mute'}
  {pressed}
  on:click={() => {
    const select = { chat: item.chat, preview: item.preview }
    dispatch('select', select)
  }}
  on:contextmenu={handleContextMenu}
/>
